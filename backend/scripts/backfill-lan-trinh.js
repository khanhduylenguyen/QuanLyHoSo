/**
 * Bổ sung "Các lần trình LĐ" (lanTrinh) cho hồ sơ có từ trước khi có trường này.
 *
 *   node scripts/backfill-lan-trinh.js <file.xlsx>            # chạy thử: chỉ đếm
 *   node scripts/backfill-lan-trinh.js <file.xlsx> --commit   # ghi vào DB (MONGO_URI trong .env)
 *
 * - Hồ sơ nhập từ sổ: đọc lại đúng file đã nhập, khớp theo nguồn nhập (sheet + dòng), lấy MỌI ngày trong
 *   cột "Ngày trình LĐ" / "Ngày trình VPUB" (một ô có thể ghi nhiều ngày). Sổ không có kết quả → để trống.
 * - Hồ sơ khác (hoặc dòng sổ không đọc được ngày) có Ngày trình thực tế → một lần trình.
 * Chỉ ghi vào hồ sơ chưa có lần trình nào; không đổi trạng thái, không đổi updatedAt.
 * Hoàn tác: db.dossiers.updateMany({}, { $set: { lanTrinh: [] } }).
 */
require('dotenv').config({ quiet: true });

const path = require('node:path');
const mongoose = require('mongoose');
const { Dossier } = require('../models');
const { loadSettings } = require('../settings');
const { readWorkbook, analyzeImport } = require('../importer');

const day = (date) => (date ? new Date(date).toISOString().slice(0, 10) : null);

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const commit = args.includes('--commit');
  if (!file) {
    console.error('Cách dùng: node scripts/backfill-lan-trinh.js <file.xlsx> [--commit]');
    process.exit(1);
  }

  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/quanlyhoso';
  await mongoose.connect(uri);
  await loadSettings();
  console.log(`Đã kết nối ${uri.replace(/\/\/[^@/]+@/, '//***@')}`);

  try {
    // Đọc file như lúc nhập (không đối chiếu DB, không bỏ trùng) để có đủ mọi dòng.
    const { records } = await analyzeImport(await readWorkbook(file), { useDb: false, skipExisting: false });
    const bySource = new Map(records.map((r) => [`${r.sheet}|${r.dong}`, r]));
    // Chỉ khớp hồ sơ nhập từ CHÍNH file này (hồ sơ từ file khác có sheet + dòng trùng số nhưng là dòng khác).
    const fileName = path.basename(file);

    const dossiers = await Dossier.find({ $or: [{ lanTrinh: { $exists: false } }, { lanTrinh: { $size: 0 } }] })
      .select('maHoSo nguonNhap ngayTrinhThucTe')
      .lean();

    const stats = { candidates: dossiers.length, fromRegister: 0, multiple: 0, fromActualDate: 0, dateMismatch: 0, nothing: 0 };
    const updates = [];
    for (const d of dossiers) {
      const record = d.nguonNhap?.tep === fileName ? bySource.get(`${d.nguonNhap.sheet}|${d.nguonNhap.dong}`) : null;
      let lanTrinh = [];
      if (record?.lanTrinh?.length) {
        const last = record.lanTrinh[record.lanTrinh.length - 1];
        // Ngày trình trong hệ thống khác sổ → dòng sổ không còn khớp hồ sơ, không dùng.
        if (d.ngayTrinhThucTe && day(d.ngayTrinhThucTe) !== day(last.ngay)) {
          stats.dateMismatch++;
        } else {
          lanTrinh = record.lanTrinh;
          stats.fromRegister++;
          if (lanTrinh.length > 1) stats.multiple++;
        }
      }
      if (!lanTrinh.length && d.ngayTrinhThucTe) {
        lanTrinh = [{ ngay: d.ngayTrinhThucTe, ketQua: '', ghiChu: '' }];
        stats.fromActualDate++;
      }
      if (!lanTrinh.length) {
        stats.nothing++;
        continue;
      }
      updates.push({
        updateOne: {
          filter: { _id: d._id, $or: [{ lanTrinh: { $exists: false } }, { lanTrinh: { $size: 0 } }] },
          update: { $set: { lanTrinh, ngayTrinhThucTe: lanTrinh[lanTrinh.length - 1].ngay } },
          timestamps: false,
        },
      });
    }

    console.log(JSON.stringify(stats, null, 2));
    if (!commit) {
      console.log(`\n(Chạy thử — chưa ghi gì. Sẽ cập nhật ${updates.length} hồ sơ. Thêm --commit để ghi.)`);
      return;
    }
    const result = updates.length ? await Dossier.bulkWrite(updates, { ordered: false }) : { modifiedCount: 0 };
    console.log(`\nĐã cập nhật ${result.modifiedCount} hồ sơ.`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
