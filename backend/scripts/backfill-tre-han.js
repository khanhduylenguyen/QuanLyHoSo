/**
 * Bổ sung đánh giá "Trễ hạn" theo sổ (treHanTheoSo) cho các hồ sơ ĐÃ nhập từ Excel trước khi có trường này.
 *
 *   node scripts/backfill-tre-han.js <file.xlsx>            # chạy thử: chỉ đếm
 *   node scripts/backfill-tre-han.js <file.xlsx> --commit   # ghi vào DB (MONGO_URI trong .env)
 *
 * Đọc lại đúng file đã nhập, khớp từng hồ sơ theo nguồn nhập (sheet + dòng).
 * Bỏ qua hồ sơ đã được sửa trong hệ thống sau khi nhập (updatedAt khác createdAt) —
 * với các hồ sơ đó, so sánh ngày trong hệ thống mới là đúng.
 * Hoàn tác: db.dossiers.updateMany({}, { $unset: { treHanTheoSo: 1 } }).
 */
require('dotenv').config({ quiet: true });

const mongoose = require('mongoose');
const { Dossier } = require('../models');
const { loadSettings } = require('../settings');
const { readWorkbook, analyzeImport, registerLateFlag } = require('../importer');

// Sai lệch tối đa giữa createdAt và updatedAt vẫn coi là "chưa sửa" (insertMany đặt hai mốc bằng nhau).
const UNTOUCHED_TOLERANCE_MS = 1000;

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const commit = args.includes('--commit');
  if (!file) {
    console.error('Cách dùng: node scripts/backfill-tre-han.js <file.xlsx> [--commit]');
    process.exit(1);
  }

  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/quanlyhoso';
  await mongoose.connect(uri);
  await loadSettings();
  console.log(`Đã kết nối ${uri.replace(/\/\/[^@/]+@/, '//***@')}`);

  try {
    // Đọc file như lúc nhập (không đối chiếu DB, không bỏ trùng) để có đủ mọi dòng.
    const { records } = await analyzeImport(await readWorkbook(file), { useDb: false, skipExisting: false });
    const flagBySource = new Map(records.map((r) => [`${r.sheet}|${r.dong}`, registerLateFlag(r)]));

    const imported = await Dossier.find({ nguonNhap: { $exists: true } })
      .select('maHoSo nguonNhap trangThai treHanTheoSo createdAt updatedAt')
      .lean();

    const stats = { imported: imported.length, notInFile: 0, editedInApp: 0, alreadySet: 0, noLateColumn: 0, toSetLate: 0, toSetOnTime: 0 };
    const updates = [];
    for (const d of imported) {
      const key = `${d.nguonNhap.sheet}|${d.nguonNhap.dong}`;
      if (!flagBySource.has(key)) {
        stats.notInFile++;
        continue;
      }
      if (typeof d.treHanTheoSo === 'boolean') {
        stats.alreadySet++;
        continue;
      }
      if (Math.abs(new Date(d.updatedAt) - new Date(d.createdAt)) > UNTOUCHED_TOLERANCE_MS) {
        stats.editedInApp++;
        continue;
      }
      const flag = flagBySource.get(key);
      if (typeof flag !== 'boolean') {
        stats.noLateColumn++;
        continue;
      }
      stats[flag ? 'toSetLate' : 'toSetOnTime']++;
      updates.push({ updateOne: { filter: { _id: d._id }, update: { $set: { treHanTheoSo: flag } }, timestamps: false } });
    }

    console.log(JSON.stringify(stats, null, 2));
    if (!commit) {
      console.log('\n(Chạy thử — chưa ghi gì. Thêm --commit để cập nhật.)');
      return;
    }
    if (updates.length) await Dossier.bulkWrite(updates, { ordered: false });
    console.log(`\nĐã cập nhật ${updates.length} hồ sơ.`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error('\nThất bại:', error.message);
  process.exitCode = 1;
});
