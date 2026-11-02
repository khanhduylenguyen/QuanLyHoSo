/**
 * Nhập sổ theo dõi thủ tục hành chính (Excel) vào MongoDB từ dòng lệnh.
 * (Trên web: nút "Nhập từ Excel" — cùng bộ đọc trong importer.js.)
 *
 *   node scripts/import-excel.js <file.xlsx>                 # chạy thử: chỉ phân tích + ghi báo cáo, KHÔNG ghi DB
 *   node scripts/import-excel.js <file.xlsx> --commit        # thêm hồ sơ chưa có vào DB (MONGO_URI trong .env)
 *       --purge-demo        xoá 12 hồ sơ mẫu (HS-001..HS-012) và tài khoản canbo_a, canbo_b, vanthu trước khi nhập
 *       --replace-imported  xoá MỌI hồ sơ đã nhập từ Excel (cả nhập qua web) rồi nhập lại toàn bộ file
 *
 * Báo cáo CSV ghi vào backend/import-reports/<thời điểm>/.
 */
require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { User, Dossier } = require('../models');
const { loadSettings } = require('../settings');
const { readWorkbook, analyzeImport, previewCodes, commitImport } = require('../importer');

const DEMO_DOSSIER_CODES = Array.from({ length: 12 }, (_, i) => `HS-${String(i + 1).padStart(3, '0')}`);
const DEMO_USERNAMES = ['canbo_a', 'canbo_b', 'vanthu'];

const csvCell = (value) => {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const writeCsv = (file, header, rows) =>
  fs.writeFileSync(file, `﻿${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')}\n`, 'utf8');

async function purgeDemo() {
  const demoUsers = await User.find({ username: { $in: DEMO_USERNAMES } }).select('_id username').lean();
  const nonImported = await Dossier.countDocuments({ nguonNhap: { $exists: false } });
  const demoQuery = { nguonNhap: { $exists: false }, maHoSo: { $in: DEMO_DOSSIER_CODES } };
  const demoDossiers = await Dossier.countDocuments(demoQuery);
  if (nonImported !== demoDossiers) {
    throw new Error(`Có ${nonImported - demoDossiers} hồ sơ không phải dữ liệu mẫu (không nằm trong HS-001..HS-012). Dừng lại để không xoá nhầm.`);
  }
  const { deletedCount } = await Dossier.deleteMany(demoQuery);
  await User.deleteMany({ _id: { $in: demoUsers.map((u) => u._id) } });
  console.log(`Đã xoá dữ liệu mẫu: ${deletedCount} hồ sơ, ${demoUsers.length} tài khoản (${demoUsers.map((u) => u.username).join(', ')})`);
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const commit = args.includes('--commit');
  const replaceImported = args.includes('--replace-imported');
  if (!file) {
    console.error('Cách dùng: node scripts/import-excel.js <file.xlsx> [--commit] [--purge-demo] [--replace-imported]');
    process.exit(1);
  }

  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/quanlyhoso';
  await mongoose.connect(uri);
  await loadSettings(); // thời hạn / ngày làm việc đang cấu hình
  console.log(`Đã kết nối ${uri.replace(/\/\/[^@/]+@/, '//***@')}`);

  try {
    if (commit && args.includes('--purge-demo')) await purgeDemo();
    if (commit && replaceImported) {
      const { deletedCount } = await Dossier.deleteMany({ nguonNhap: { $exists: true } });
      console.log(`Đã xoá ${deletedCount} hồ sơ nhập từ Excel trước đó.`);
    }

    const workbook = await readWorkbook(file);
    const { records, issues, summary } = await analyzeImport(workbook, { useDb: true, skipExisting: true });
    previewCodes(records);

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const reportDir = path.join(__dirname, '..', 'import-reports', stamp);
    fs.mkdirSync(reportDir, { recursive: true });
    writeCsv(
      path.join(reportDir, 'officers.csv'),
      ['Cán bộ (chuẩn)', 'Username', 'Số hồ sơ', 'Tài khoản', 'Các cách ghi trong file'],
      summary.officers.map((o) => [o.name, o.username, o.count, o.isNew ? 'tạo mới' : 'đã có', o.variants.join('; ')])
    );
    writeCsv(path.join(reportDir, 'types.csv'), ['Loại', 'Tên loại', 'Số hồ sơ'], summary.byType.map((t) => [t.ma, t.moTa, t.count]));
    writeCsv(path.join(reportDir, 'issues.csv'), ['Sheet', 'Dòng', 'Vấn đề', 'Giá trị'], issues.map((i) => [i.sheet, i.dong, i.message, i.value]));

    console.log('\n=== SHEET (dòng đọc được | gộp vào hồ sơ sheet khác | thêm mới)');
    summary.sheets.forEach((s) => console.log(`  ${s.sheet} | ${s.read} | ${s.merged} | ${s.added}`));
    console.log(`\nHồ sơ mới: ${summary.newCount} | Đã có trong DB (bỏ qua): ${summary.duplicateCount}`);
    console.log('Theo trạng thái:', JSON.stringify(summary.byStatus));
    console.log(`Cán bộ: ${summary.officers.length} (tạo mới ${summary.officers.filter((o) => o.isNew).length}) | Chưa phân công: ${summary.unassigned}`);
    if (summary.newOfficerNames.length) {
      // Dòng lệnh không tạo tài khoản cho tên lạ (sổ cũ có ô CBTL ghi nhầm tên người dân).
      console.log(`Tên CBTL lạ → Chưa phân công: ${summary.newOfficerNames.map((n) => `${n.name} (${n.count})`).join(', ')}`);
    }
    console.log(`Vấn đề ghi nhận: ${summary.issueCount} | Báo cáo: ${reportDir}`);

    if (!commit) {
      console.log('\n(Chạy thử — chưa ghi gì vào database. Thêm --commit để nhập.)');
      return;
    }
    const batchId = crypto.randomUUID();
    const { inserted, officersCreated } = await commitImport(records, { batchId, fileName: path.basename(file) });
    console.log(`\nHoàn tất: ${inserted} hồ sơ, tạo ${officersCreated} tài khoản cán bộ. Mã lần nhập: ${batchId}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error('\nNhập thất bại:', error.message);
  process.exitCode = 1;
});
