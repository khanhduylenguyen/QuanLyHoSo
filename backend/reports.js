/**
 * Báo cáo & xuất Excel.
 *
 * Định nghĩa (so sánh theo NGÀY, ngày lưu dạng 00:00 UTC — xem settings.js):
 * - Tiếp nhận trong kỳ:   Ngày vào ∈ [từ, đến]
 * - Giải quyết trong kỳ:  Hoàn thành và Ngày kết thúc ∈ [từ, đến]
 *     · Đúng hạn: Ngày kết thúc ≤ Hạn xử lý   · Trễ hạn: ngược lại
 *     · Hồ sơ nhập từ sổ còn giữ đánh giá của sổ (treHanTheoSo) thì dùng đánh giá đó thay cho so sánh ngày
 * - Hoàn thành không ghi ngày: Hoàn thành, không có Ngày kết thúc, Ngày vào trong kỳ (sổ cũ chỉ đánh "x")
 * - Tồn cuối kỳ: Ngày vào ≤ đến và chưa hoàn thành tính tới cuối kỳ
 *     · trong đó quá hạn: Hạn xử lý < min(đến, hôm nay)
 */
const ExcelJS = require('exceljs');
const { PHAN_LOAI_RULES } = require('./catalog');
const { todayVN } = require('./settings');

const TRANG_THAI_LABELS = {
  MOI_TIEP_NHAN: 'Mới tiếp nhận',
  DANG_XU_LY: 'Đang thụ lý',
  CHO_LANH_DAO_DUYET: 'Đã trình LĐ',
  HOAN_THANH: 'Hoàn thành',
};
const MUC_DO_UU_TIEN_LABELS = { THAP: 'Thấp', TRUNG_BINH: 'Trung bình', CAO: 'Cao', KHAN_CAP: 'Khẩn cấp' };
const UNASSIGNED = 'Chưa phân công';

const day = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);
const officerName = (d) => d.canBoThuLy?.hoTen || d.canBoThuLy?.username || UNASSIGNED;
const typeName = (code) => PHAN_LOAI_RULES[code]?.moTa ?? code;
const daysBetween = (fromDay, toDay) => Math.round((Date.parse(toDay) - Date.parse(fromDay)) / 86400000);

/** Hồ sơ đã hoàn thành có trễ hạn không: đánh giá của sổ (nếu còn) → so sánh Ngày kết thúc với Hạn xử lý. */
function isResolvedLate(d) {
  if (typeof d.treHanTheoSo === 'boolean') return d.treHanTheoSo;
  const due = day(d.ngayHetHan);
  const done = day(d.ngayKetThuc);
  return Boolean(due && done && done > due);
}

/** Tình trạng hạn của một hồ sơ tại ngày `today` (yyyy-mm-dd). */
function deadlineState(d, today) {
  const due = day(d.ngayHetHan);
  if (d.trangThai === 'HOAN_THANH') {
    if (typeof d.treHanTheoSo !== 'boolean' && (!d.ngayKetThuc || !due)) return 'Hoàn thành';
    return isResolvedLate(d) ? 'Trễ hạn' : 'Đúng hạn';
  }
  if (!due) return 'Đang xử lý';
  return due < today ? 'Quá hạn' : 'Còn hạn';
}

const emptyCounters = () => ({
  received: 0,
  resolved: 0,
  onTime: 0,
  late: 0,
  resolvedNoDate: 0,
  pending: 0,
  pendingOverdue: 0,
});

const withRate = (c) => ({ ...c, onTimeRate: c.onTime + c.late ? Math.round((c.onTime / (c.onTime + c.late)) * 1000) / 10 : null });

/** Tổng hợp theo kỳ [from, to] (yyyy-mm-dd), theo loại thủ tục và theo cán bộ. */
function buildSummary(dossiers, from, to) {
  const today = day(todayVN());
  const cutoff = to < today ? to : today;
  const total = emptyCounters();
  const byType = new Map();
  const byOfficer = new Map();

  const bump = (map, key, field) => {
    const c = map.get(key) ?? emptyCounters();
    c[field]++;
    map.set(key, c);
  };
  const count = (d, field) => {
    total[field]++;
    bump(byType, d.phanLoai, field);
    bump(byOfficer, officerName(d), field);
  };

  for (const d of dossiers) {
    const vao = day(d.ngayVao);
    const done = day(d.ngayKetThuc);
    const due = day(d.ngayHetHan);
    const isDone = d.trangThai === 'HOAN_THANH';

    if (vao >= from && vao <= to) count(d, 'received');
    if (isDone && done && done >= from && done <= to) {
      count(d, 'resolved');
      count(d, isResolvedLate(d) ? 'late' : 'onTime');
    }
    if (isDone && !done && vao >= from && vao <= to) count(d, 'resolvedNoDate');

    const openAtEnd = vao <= to && !(isDone && (!done || done <= to));
    if (openAtEnd) {
      count(d, 'pending');
      if (due && due < cutoff) count(d, 'pendingOverdue');
    }
  }

  return {
    from,
    to,
    total: withRate(total),
    byType: [...byType.entries()]
      .map(([code, c]) => ({ ma: code, moTa: typeName(code), ...withRate(c) }))
      .sort((a, b) => b.received - a.received || b.pending - a.pending),
    byOfficer: [...byOfficer.entries()]
      .map(([name, c]) => ({ name, ...withRate(c) }))
      .sort((a, b) => (a.name === UNASSIGNED) - (b.name === UNASSIGNED) || b.received + b.pending - (a.received + a.pending)),
  };
}

/** Số tiếp nhận / giải quyết (đúng, trễ hạn) theo từng tháng của một năm. */
function buildMonthly(dossiers, year) {
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, received: 0, onTime: 0, late: 0, resolvedNoDate: 0 }));
  const prefix = String(year);
  for (const d of dossiers) {
    const vao = day(d.ngayVao);
    const done = day(d.ngayKetThuc);
    if (vao?.startsWith(prefix)) {
      months[Number(vao.slice(5, 7)) - 1].received++;
      if (d.trangThai === 'HOAN_THANH' && !done) months[Number(vao.slice(5, 7)) - 1].resolvedNoDate++;
    }
    if (d.trangThai === 'HOAN_THANH' && done?.startsWith(prefix)) {
      months[Number(done.slice(5, 7)) - 1][isResolvedLate(d) ? 'late' : 'onTime']++;
    }
  }
  return { year, months };
}

/** Hồ sơ chưa hoàn thành quá hạn lâu nhất. */
function buildOldestOverdue(dossiers, limit = 10) {
  const today = day(todayVN());
  return dossiers
    .filter((d) => d.trangThai !== 'HOAN_THANH' && d.ngayHetHan && day(d.ngayHetHan) < today)
    .sort((a, b) => new Date(a.ngayHetHan) - new Date(b.ngayHetHan))
    .slice(0, limit)
    .map((d) => ({
      _id: d._id,
      maHoSo: d.maHoSo,
      tenHoSo: d.tenHoSo,
      loai: typeName(d.phanLoai),
      canBo: officerName(d),
      ngayHetHan: day(d.ngayHetHan),
      soNgayQuaHan: daysBetween(day(d.ngayHetHan), today),
    }));
}

/* ------------------------------------------------------------------ */
/* Excel                                                              */
/* ------------------------------------------------------------------ */

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
const toExcelDate = (value) => (value ? new Date(value) : null);

function styleHeader(ws) {
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = HEADER_FILL;
  head.alignment = { vertical: 'middle', wrapText: true };
  head.height = 30;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
}

/** Danh sách hồ sơ → Excel (cột nhạy cảm chỉ có khi includeSensitive). */
async function buildDossierWorkbook(dossiers, { includeSensitive }) {
  const today = day(todayVN());
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Hệ thống Quản lý Hồ sơ';
  const ws = wb.addWorksheet('Hồ sơ');

  const columns = [
    { header: 'STT', key: 'stt', width: 6 },
    { header: 'Mã HS', key: 'maHoSo', width: 24 },
    { header: 'Số biên nhận', key: 'soBienNhan', width: 24 },
    { header: 'Ngày nhận', key: 'ngayVao', width: 12, date: true },
    { header: 'Tên hồ sơ', key: 'tenHoSo', width: 32 },
    { header: 'Địa chỉ', key: 'diaChi', width: 30 },
    { header: 'Loại thủ tục', key: 'loai', width: 28 },
    { header: 'Loại hồ sơ (trong sổ)', key: 'loaiGoc', width: 28 },
    { header: 'CBTL', key: 'canBo', width: 18 },
    { header: 'Hạn trình LĐ', key: 'ngayTrinhLanhDao', width: 12, date: true },
    { header: 'Ngày trình thực tế', key: 'ngayTrinhThucTe', width: 12, date: true },
    { header: 'Ngày hẹn trả / Hạn xử lý', key: 'ngayHetHan', width: 13, date: true },
    { header: 'Ngày kết thúc', key: 'ngayKetThuc', width: 12, date: true },
    { header: 'Trạng thái', key: 'trangThai', width: 15 },
    { header: 'Tình trạng hạn', key: 'tinhTrangHan', width: 13 },
    { header: 'Diễn giải', key: 'dienGiai', width: 40 },
    { header: 'Ghi chú', key: 'ghiChu', width: 28 },
    ...(includeSensitive
      ? [
          { header: 'Chỉ đạo LĐ', key: 'chiDao', width: 30 },
          { header: 'Ưu tiên nội bộ', key: 'uuTien', width: 13 },
        ]
      : []),
  ];
  ws.columns = columns.map(({ header, key, width }) => ({ header, key, width }));

  dossiers.forEach((d, index) => {
    const row = ws.addRow({
      stt: index + 1,
      maHoSo: d.maHoSo,
      soBienNhan: d.soBienNhan,
      ngayVao: toExcelDate(d.ngayVao),
      tenHoSo: d.tenHoSo,
      diaChi: d.diaChi,
      loai: typeName(d.phanLoai),
      loaiGoc: d.loaiHoSoGoc,
      canBo: d.canBoThuLy ? officerName(d) : '',
      ngayTrinhLanhDao: toExcelDate(d.ngayTrinhLanhDao),
      ngayTrinhThucTe: toExcelDate(d.ngayTrinhThucTe),
      ngayHetHan: toExcelDate(d.ngayHetHan),
      ngayKetThuc: toExcelDate(d.ngayKetThuc),
      trangThai: TRANG_THAI_LABELS[d.trangThai] ?? d.trangThai,
      tinhTrangHan: deadlineState(d, today),
      dienGiai: d.ghiChuCanBo,
      ghiChu: d.ghiChu,
      chiDao: d.chiDaoLanhDao ?? '',
      uuTien: MUC_DO_UU_TIEN_LABELS[d.mucDoUuTien] ?? '',
    });
    const state = row.getCell('tinhTrangHan');
    if (state.value === 'Quá hạn' || state.value === 'Trễ hạn') state.font = { color: { argb: 'FFDC2626' }, bold: true };
  });

  columns.forEach((col, i) => {
    if (col.date) ws.getColumn(i + 1).numFmt = 'dd/mm/yyyy';
  });
  ws.getColumn('dienGiai').alignment = { wrapText: true, vertical: 'top' };
  styleHeader(ws);
  return wb.xlsx.writeBuffer();
}

const SUMMARY_COLUMNS = [
  { header: 'Tiếp nhận', key: 'received', width: 11 },
  { header: 'Giải quyết', key: 'resolved', width: 11 },
  { header: 'Đúng hạn', key: 'onTime', width: 10 },
  { header: 'Trễ hạn', key: 'late', width: 10 },
  { header: 'Tỷ lệ đúng hạn (%)', key: 'onTimeRate', width: 12 },
  { header: 'Hoàn thành không ghi ngày', key: 'resolvedNoDate', width: 13 },
  { header: 'Tồn cuối kỳ', key: 'pending', width: 10 },
  { header: 'Trong đó quá hạn', key: 'pendingOverdue', width: 11 },
];

/** Báo cáo kỳ → Excel: theo loại thủ tục, theo cán bộ, danh sách quá hạn. */
async function buildSummaryWorkbook(summary, overdue, scopeLabel) {
  const fmt = (iso) => iso.split('-').reverse().join('/');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Hệ thống Quản lý Hồ sơ';

  const addTable = (name, firstColumn, rows) => {
    const ws = wb.addWorksheet(name);
    ws.columns = [firstColumn, ...SUMMARY_COLUMNS];
    rows.forEach((row) => ws.addRow(row));
    const totalRow = ws.addRow({ [firstColumn.key]: 'TỔNG CỘNG', ...summary.total });
    totalRow.font = { bold: true };
    styleHeader(ws);
    ws.spliceRows(1, 0, [`BÁO CÁO KẾT QUẢ GIẢI QUYẾT HỒ SƠ — từ ${fmt(summary.from)} đến ${fmt(summary.to)}${scopeLabel ? ` — ${scopeLabel}` : ''}`]);
    ws.getRow(1).font = { bold: true, size: 13 };
    ws.views = [{ state: 'frozen', ySplit: 2 }];
    ws.autoFilter = undefined;
  };

  addTable('Theo loại thủ tục', { header: 'Loại thủ tục', key: 'moTa', width: 34 }, summary.byType);
  addTable('Theo cán bộ', { header: 'Cán bộ thụ lý', key: 'name', width: 24 }, summary.byOfficer);

  const ws = wb.addWorksheet('Hồ sơ quá hạn');
  ws.columns = [
    { header: 'Mã HS', key: 'maHoSo', width: 24 },
    { header: 'Tên hồ sơ', key: 'tenHoSo', width: 32 },
    { header: 'Loại thủ tục', key: 'loai', width: 28 },
    { header: 'CBTL', key: 'canBo', width: 18 },
    { header: 'Hạn xử lý', key: 'ngayHetHan', width: 12 },
    { header: 'Số ngày quá hạn', key: 'soNgayQuaHan', width: 12 },
  ];
  overdue.forEach((d) => ws.addRow({ ...d, ngayHetHan: new Date(d.ngayHetHan) }));
  ws.getColumn('ngayHetHan').numFmt = 'dd/mm/yyyy';
  styleHeader(ws);

  return wb.xlsx.writeBuffer();
}

module.exports = { buildSummary, buildMonthly, buildOldestOverdue, buildDossierWorkbook, buildSummaryWorkbook, deadlineState };
