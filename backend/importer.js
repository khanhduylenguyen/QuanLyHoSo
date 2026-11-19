/**
 * Nhập hồ sơ từ file Excel — dùng chung cho API (trang web) và script dòng lệnh.
 *
 * Luồng: readWorkbook → analyzeImport (đọc, gộp sheet, chuẩn hoá loại / cán bộ / trạng thái,
 * bỏ hồ sơ đã có trong DB) → commitImport (tạo tài khoản cán bộ còn thiếu + ghi hồ sơ).
 *
 * Định dạng file:
 * - Mỗi sheet (đang hiện) có một dòng tiêu đề trong 12 dòng đầu, chứa ít nhất cột "Tên hồ sơ"/"Tên"
 *   và "Ngày nhận". Các cột khác nhận theo tên (xem COLUMN_PATTERNS), thứ tự cột không quan trọng.
 * - Sổ GCN ("DANH SÁCH GCN 2026"): các cột bước quy trình nhận theo tên cột + nhóm tiêu đề gộp ở dòng
 *   phía trên (vd. "Ngày trình" thuộc nhóm "TRÌNH DỰ THẢO CẤP GCN") — xem GCN_COLUMNS.
 * - Nhiều sheet: hồ sơ ở các sheet sau được gộp vào hồ sơ trùng ở sheet khác theo Số biên nhận
 *   (hoặc Tên + Địa chỉ + Ngày nhận) — chỉ bổ sung ô trống. Trong cùng một sheet không gộp.
 */
const ExcelJS = require('exceljs');
const { User, Dossier, PHAN_LOAI_RULES } = require('./models');
const { BUOC, applyWorkflow, statusForStep } = require('./gcn');
const { logMany } = require('./audit');

/* ------------------------------------------------------------------ */
/* Cấu hình                                                           */
/* ------------------------------------------------------------------ */

// Sheet đã biết của sổ theo dõi: tiền tố mã khi thiếu số biên nhận + loại mặc định khi ô Loại trống.
// Sheet đầu tiên trong danh sách được đọc trước (làm nguồn chính).
const KNOWN_SHEETS = [{ name: 'CẤP GIẤY CHỨNG NHẬN', prefix: 'GCN', defaultType: 'CAP_GCN' }];
const DEFAULT_SHEET_CONFIG = { prefix: 'GCN', defaultType: 'CAP_GCN' };
const HEADER_SCAN_ROWS = 12;

// Cột logic → tiêu đề (đã bỏ dấu, viết hoa). Thứ tự trong mảng = mức ưu tiên.
const COLUMN_PATTERNS = {
  stt: [/^STT TONG$/, /^STT$/],
  ngayNhan: [/^NGAY NHAN$/, /^NGAY VAO$/, /^NGAY VAO HO SO$/],
  ngayChuyen: [/^NGAY CHUYEN$/],
  soBienNhan: [/^SO BIEN NHAN$/, /^MA HO SO$/],
  ten: [/^TEN HO SO$/, /^TEN$/, /^TEN NGUOI NOP$/],
  diaChi: [/^DIA CHI$/],
  loai: [/^LOAI HO SO$/, /^LOAI THU TUC$/, /^PHAN LOAI$/],
  cbtl: [/^CBTL$/, /^CAN BO THU LY$/],
  henTra: [/^NGAY HEN TRA THEO BN$/, /^HAN 10 NGAY$/, /^NGAY HEN TRA 10 NGAY$/, /^NGAY HEN TRA$/],
  giaHan: [/^GIA HAN NEU CO$/, /^GIA HAN$/],
  ketThucX: [/^KET THUC QUY TRINH/],
  treHan: [/^TRE HAN/],
  trinhLD: [/^NGAY TRINH LD$/],
  trinhVPUB: [/^NGAY TRINH VPUB$/, /^NGAY TRINH UB$/, /^TRINH UB$/],
  ngayKetThuc: [/^NGAY KET THUC$/],
  dienGiai: [/^DIEN GIAI$/],
  ghiChu: [/^GHI CHU$/],
  tinhTrang: [/^TRANG THAI HO SO$/, /^TRANG THAI$/, /^X$/],
};

/**
 * Cột quy trình của sổ GCN: các cách nhận [nhóm tiêu đề gộp ở dòng trên (null = không cần), tên cột],
 * thử theo thứ tự. Sổ thật cần nhóm vì nhiều cột trùng tên ("Hạn trình", "Ngày trình", "TRÌNH UB");
 * file mẫu (không có dòng nhóm) dùng tên cột đầy đủ.
 */
const GCN_COLUMNS = {
  ghiChuUuTien: [[null, /^GHI CHU UU TIEN/]],
  congNhanThem: [[null, /^CONG NHAN THEM DAT$/]],
  capGcnX: [[null, /^CAP GCN$/]],
  to: [[null, /^TO$/]],
  hanTrinhNY: [[null, /^HAN TRINH NY/]],
  ngayTrinhNY: [[null, /^NGAY TRINH NY/]],
  ngayBatDauNY: [[null, /^NGAY BAT DAU NY/]],
  ngayKetThucNY: [[null, /^NGAY KET THUC NY/]],
  hanTrinhDuThao: [[/^TRINH DU THAO/, /^HAN TRINH$/], [null, /^HAN TRINH DU THAO/]],
  ngayTrinhDuThao: [[/^TRINH DU THAO/, /^NGAY TRINH$/], [null, /^NGAY TRINH DU THAO/]],
  hanTrinhPCThue: [[null, /^HAN TRINH PC THUE/]],
  ngayTrinhPCThue: [[null, /^NGAY TRINH PC THUE/]],
  ngayDiThue: [[null, /^DI THUE/]],
  ngayNhanKQNVTC: [[null, /^NHAN KET QUA/]],
  hanTrinhGCN: [[null, /^HAN TRINH GCN/]],
  ngayTrinhGCN: [[/^CAP GCN/, /^NGAY TRINH UB$/], [null, /^NGAY TRINH UB CAP GCN/]],
  soGCN: [[null, /^SO GCN$/]],
  ngayTrinhRut: [[/RUT/, /^TRINH UB$/], [null, /^NGAY TRINH UB RUT/]],
  ngayVBRut: [[/RUT/, /^NGAY VB$/], [null, /^NGAY VB RUT/]],
  ngayTraTo: [[null, /^NGAY TRA TO$/]],
  // Sổ thật: cột "Đã GIẢI QUYẾT" (cột "Tình trạng" phía sau là công thức đếm ngày); file mẫu: "Tình trạng".
  tinhTrangGcn: [[null, /^DA GIAI QUYET$/], [null, /^TINH TRANG$/]],
  giaiTrinh: [[null, /^GIAI TRINH$/]],
  hanTrinhLaiUB: [[null, /^HAN TRINH LAI UB$/]],
};
const GCN_DATE_COLUMNS = [
  'hanTrinhNY', 'ngayTrinhNY', 'ngayBatDauNY', 'ngayKetThucNY', 'hanTrinhDuThao', 'ngayTrinhDuThao',
  'hanTrinhPCThue', 'ngayTrinhPCThue', 'ngayDiThue', 'ngayNhanKQNVTC', 'hanTrinhGCN', 'ngayTrinhGCN',
  'ngayTrinhRut', 'ngayVBRut', 'ngayTraTo', 'hanTrinhLaiUB',
];

/** Bước quy trình từ cột "Tình trạng" của sổ GCN (thứ tự quan trọng: DỰ THẢO trước CẤP GCN…). */
const STEP_RULES = [
  [/DA GIAI QUYET|HOAN THANH/, 'DA_GIAI_QUYET'],
  [/\bRUT\b/, 'TRINH_RUT'],
  [/TRINH UB.*NIEM YET/, 'TRINH_NY'],
  [/DU THAO/, 'TRINH_DU_THAO'],
  [/TRINH UB.*CAP GCN/, 'TRINH_CAP_GCN'],
  [/NIEM YET/, 'NIEM_YET'],
  [/CHO HOP/, 'CHO_HOP'],
  [/GIAI TRINH/, 'TRA_GIAI_TRINH'],
  [/THUE/, 'THUE'],
  [/TRINH UB/, 'TRINH_UB'],
];

// Loại hồ sơ GCN: thứ tự quan trọng (CÔNG NHẬN THÊM trước GCN). Ô trống → loại mặc định của sheet.
const TYPE_RULES = [
  [/CONG NHAN THEM/, 'CONG_NHAN_THEM_DAT'],
  [/DINH CHINH/, 'DINH_CHINH_GCN'],
  [/GIAY CHUNG NHAN|\bGCN\b/, 'CAP_GCN'],
];

/**
 * Bảng gộp tên cán bộ: cách ghi (đã bỏ dấu, viết hoa) → tên chuẩn.
 * Tên ngắn mơ hồ được gán theo người xuất hiện nhiều nhất cùng lĩnh vực trong sổ
 * (vd. "Vũ" → Quang Vũ, "Tuấn" → Anh Tuấn). Cán bộ đã có tài khoản cũng được nhận theo Họ tên.
 */
const OFFICER_ALIASES = {
  'Tuấn Anh': ['TUAN ANH'],
  'Anh Tuấn': ['ANH TUAN', 'A TUAN', 'TUAN'],
  'Tuấn Đạt': ['TUAN DAT'],
  'Quang Vũ': ['QUANG VU', 'QUAMG VU', 'ANH VU', 'A VU', 'VU'],
  'Thanh Vũ': ['THANH VU'],
  'Ngọc Thảo': ['NGOC THAO', 'CHI THAO', 'C THAO', 'THAO'],
  'Vĩnh Phương': ['VINH PHUONG', 'A PHUONG', 'ANH PHUONG', 'PHUONG'],
  'Nga': ['CHI NGA', 'C NGA', 'NGA'],
  'Quang Huân': ['QUANG HUAN', 'A HUAN', 'ANH HUAN', 'HUAN'],
  'Thanh Trai': ['THANH TRAI', 'TRANH TRAI', 'A TRAI', 'ANH TRAI', 'TRAI'],
  'Khánh Nhân': ['KHANH NHAN', 'NHAN'],
  'Thanh Nhân': ['THANH NHAN'],
  'Tấn Trường': ['TAN TRUONG', 'A TRUONG', 'ANH TRUONG', 'TRUONG'],
  'Phi Trường': ['PHI TRUONG'],
  'Quang Huy': ['QUANG HUY', 'HUY'],
  'Viết Huy': ['VIET HUY'],
  'Trúc Linh': ['TRUC LINH', 'CHI LINH', 'LINH'],
  'Tiến Dũng': ['TRINH TIEN DUNG', 'TIEN DUNG', 'DUNG'],
  'Nhứt Phy': ['NHUT PHY', 'A PHY', 'PHY'],
  'Anh Phi': ['ANH PHI', 'PHI'],
  'Ngọc Trân': ['NGOC TRAN', 'TRAN'],
  'Chí Hùng': ['CHI HUNG', 'HUNG'],
  'Ngọc Anh': ['NGOC ANH'],
  'Luân': ['ANH LUAN', 'A LUAN', 'LUAN'],
  'Tống Văn Anh': ['TONG VAN ANH', 'TONG ANH', 'A VAN ANH', 'VAN ANH'],
  'Tấn Đạt': ['TAN DAT', 'DAT'],
  'Ngọc Lộc': ['NGOC LOC'],
  'Huyên': ['HUYEN'],
  'Bình': ['TRUNG BINH', 'ANH BINH', 'A BINH', 'BINH'],
};

// Từ nối / ghi chú trong ô CBTL bị bỏ qua khi dò tên.
const OFFICER_NOISE = new Set(['A', 'C', 'CHI', 'ANH', 'CHUYEN', 'DOI', 'NOP', 'THEM', 'VA']);

// Cột trong file mẫu (theo đúng tên tiêu đề mà bộ đọc nhận ra).
// File mẫu theo cột của sổ "DANH SÁCH GCN 2026" (tên cột đầy đủ để nhận được khi không có dòng nhóm).
const TEMPLATE_COLUMNS = [
  { header: 'STT', width: 6 },
  { header: 'Ngày nhận', width: 13, date: true, required: true },
  { header: 'Ngày chuyển', width: 13, date: true },
  { header: 'GHI CHÚ (ƯU TIÊN) (Lãnh đạo xem)', width: 22 },
  { header: 'Số biên nhận', width: 24 },
  { header: 'Tên hồ sơ', width: 30, required: true },
  { header: 'Địa chỉ', width: 30 },
  { header: 'Loại hồ sơ', width: 28, list: 'types' },
  { header: 'Công nhận thêm đất', width: 10 },
  { header: 'Cấp GCN', width: 9 },
  { header: 'CBTL', width: 18, list: 'officers' },
  { header: 'TỔ', width: 9 },
  { header: 'Ngày hẹn trả (theo BN)', width: 14, date: true },
  { header: 'Gia hạn (nếu có)', width: 14, date: true },
  { header: 'Kết thúc Quy trình (ĐÁNH X)', width: 12 },
  { header: 'Hạn trình NY lên UB', width: 14, date: true },
  { header: 'Ngày trình NY VPUB', width: 14, date: true },
  { header: 'Ngày bắt đầu NY', width: 14, date: true },
  { header: 'Ngày kết thúc NY', width: 14, date: true },
  { header: 'Hạn trình dự thảo GCN', width: 14, date: true },
  { header: 'Ngày trình dự thảo GCN', width: 14, date: true },
  { header: 'Hạn trình PC thuế', width: 14, date: true },
  { header: 'Ngày trình PC thuế VPUB', width: 14, date: true },
  { header: 'Đi thuế', width: 14, date: true },
  { header: 'Nhận kết quả đã thực hiện NVTC', width: 14, date: true },
  { header: 'Hạn trình GCN', width: 14, date: true },
  { header: 'Ngày trình UB cấp GCN', width: 14, date: true },
  { header: 'Số GCN', width: 14 },
  { header: 'Ngày trình UB rút / điều chỉnh', width: 14, date: true },
  { header: 'Ngày VB rút / điều chỉnh', width: 14, date: true },
  { header: 'Ngày trả tổ', width: 14, date: true },
  { header: 'Tình trạng', width: 22, list: 'steps' },
  { header: 'Diễn giải', width: 40 },
  { header: 'GHI CHÚ', width: 24 },
  { header: 'GIẢI TRÌNH', width: 24 },
  { header: 'HẠN TRÌNH LẠI UB', width: 14, date: true },
];

/* ------------------------------------------------------------------ */
/* Tiện ích                                                           */
/* ------------------------------------------------------------------ */

const fold = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();

const slugUsername = (name) => fold(name).toLowerCase().replace(/\s+/g, '_');

/** Giá trị "thật" của ô (bỏ richText / công thức). */
function cellValue(cell) {
  let v = cell?.value;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if (v.richText) v = v.richText.map((t) => t.text).join('');
    else if ('result' in v) v = v.result;
    else if (v.text) v = v.text;
    else v = null;
  }
  if (typeof v === 'string') v = v.replace(/\s+/g, ' ').trim();
  return v === '' || v === undefined ? null : v;
}

const DATE_IN_TEXT = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/g;

// Năm ngoài khoảng này coi như gõ nhầm (vd. "0206") → bỏ.
const isPlausible = (date) => date.getUTCFullYear() >= 2000 && date.getUTCFullYear() <= 2100;

/** Ngày từ ô Excel: Date, hoặc chuỗi chứa dd/mm/yyyy (nhiều ngày → lấy ngày `pick`). */
/** Mọi ngày hợp lệ trong một ô (ô ngày Excel, hoặc chữ có nhiều ngày như "05/03/2026, 12/03/2026"). */
function toDates(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) || !isPlausible(value) ? [] : [value];
  if (typeof value !== 'string') return [];
  return [...value.matchAll(DATE_IN_TEXT)]
    .map(([, d, m, y]) => {
      const year = y.length === 2 ? 2000 + Number(y) : Number(y);
      const date = new Date(Date.UTC(year, Number(m) - 1, Number(d)));
      return date.getUTCDate() === Number(d) && date.getUTCMonth() === Number(m) - 1 && isPlausible(date) ? date : null;
    })
    .filter(Boolean);
}

function toDate(value, pick = 'first') {
  const dates = toDates(value);
  if (dates.length === 0) return null;
  return pick === 'last' ? dates[dates.length - 1] : dates[0];
}

/**
 * Các lần trình từ cột "Ngày trình LĐ" và "Ngày trình VPUB" (mỗi ô có thể ghi nhiều ngày).
 * Sổ không ghi kết quả nên ketQua để trống; lần trình VPUB ghi chú "Trình VPUB". Trùng ngày chỉ giữ một.
 */
function submissionsFrom(trinhLD, trinhVPUB, fixYear) {
  const byDay = new Map();
  for (const [raw, ghiChu] of [[trinhLD, ''], [trinhVPUB, 'Trình VPUB']]) {
    for (const date of toDates(raw)) {
      const ngay = fixYear(date);
      if (ngay && !byDay.has(isoDay(ngay))) byDay.set(isoDay(ngay), { ngay, ketQua: '', ghiChu });
    }
  }
  return [...byDay.values()].sort((a, b) => a.ngay - b.ngay);
}

const latest = (...dates) => dates.filter(Boolean).sort((a, b) => b - a)[0] ?? null;
const isMarked = (value) => value !== null && value !== undefined && String(value).trim() !== '';
const isoDay = (date) => date.toISOString().slice(0, 10);

// Năm gõ nhầm: ngày nhận lùi ≥ 2 năm so với dòng ngay trên (vd. 22/10/2022 sau 21/10/2026)
// được sửa về năm của dòng trên. Lùi 1 năm (2025 sau 2026) coi là dữ liệu thật.
const YEAR_TYPO_GAP = 2;

const withYear = (date, year) => {
  const fixed = new Date(Date.UTC(year, date.getUTCMonth(), date.getUTCDate()));
  return fixed.getUTCDate() === date.getUTCDate() ? fixed : null;
};

function classifyType(raw, fallback) {
  const key = fold(raw);
  if (!key) return fallback;
  return TYPE_RULES.find(([pattern]) => pattern.test(key))?.[1] ?? 'KHAC';
}

/** Chỉ mục tên cán bộ: bảng gộp tĩnh + họ tên các cán bộ đã có tài khoản. Cụm dài nhất trước. */
function buildAliasIndex(existingOfficers = []) {
  const entries = Object.entries(OFFICER_ALIASES).flatMap(([canonical, aliases]) =>
    aliases.map((alias) => ({ tokens: alias.split(' '), canonical }))
  );
  const known = new Set(entries.map((entry) => entry.tokens.join(' ')));
  for (const officer of existingOfficers) {
    const key = fold(officer.hoTen);
    if (key && !known.has(key)) {
      entries.push({ tokens: key.split(' '), canonical: officer.hoTen });
      known.add(key);
    }
  }
  return entries.sort((a, b) => b.tokens.length - a.tokens.length);
}

/** Dò tên cán bộ trong ô CBTL. Có chữ "chuyển" → người cuối là người đang thụ lý. */
function resolveOfficer(raw, aliasIndex) {
  if (!isMarked(raw)) return { primary: null, matches: [], ambiguous: false };
  const text = fold(String(raw).replace(DATE_IN_TEXT, ' ').replace(/\d+\/\d+/g, ' '));
  const tokens = text.split(' ').filter((token) => token && !/^\d+$/.test(token));
  const matches = [];
  let unknown = 0;

  for (let i = 0; i < tokens.length; ) {
    const hit = aliasIndex.find(({ tokens: alias }) => alias.every((word, k) => tokens[i + k] === word));
    if (hit) {
      if (matches[matches.length - 1] !== hit.canonical) matches.push(hit.canonical);
      i += hit.tokens.length;
    } else {
      if (!OFFICER_NOISE.has(tokens[i])) unknown++;
      i++;
    }
  }

  const transferred = /\bCHUYEN\b/.test(text);
  const primary = matches.length ? (transferred ? matches[matches.length - 1] : matches[0]) : null;
  // Ô chỉ chứa một tên chưa biết (không số, không "chuyển", tối đa 5 từ) → có thể là cán bộ mới.
  const newName =
    !primary && !transferred && !/\d/.test(String(raw)) && tokens.length >= 1 && tokens.length <= 5
      ? toTitleCase(String(raw).replace(/\s+/g, ' ').trim())
      : null;
  return { primary, matches, ambiguous: matches.length > 1 || unknown > 0, newName };
}

/** "LÊ VĂN MỚI" → "Lê Văn Mới"; tên đã có chữ thường thì giữ nguyên. */
function toTitleCase(name) {
  if (name !== name.toLocaleUpperCase('vi')) return name;
  return name
    .toLocaleLowerCase('vi')
    .split(' ')
    .map((word) => word.charAt(0).toLocaleUpperCase('vi') + word.slice(1))
    .join(' ');
}

/**
 * Đánh giá trễ hạn theo sổ: true nếu cột "Trễ hạn" có đánh dấu, false nếu file CÓ cột này mà để trống.
 * File không có cột "Trễ hạn" (vd. file mẫu) → undefined: báo cáo tự so sánh ngày.
 */
function registerLateFlag(r) {
  if (isMarked(r.treHanX)) return true;
  return r.hasLateColumn ? false : undefined;
}

/** Bước quy trình: sổ GCN theo cột Tình trạng, sổ khác suy từ trạng thái. */
function deriveStep(r) {
  if (isMarked(r.ketThucX)) return 'DA_GIAI_QUYET';
  const key = fold(r.tinhTrangGcn);
  if (key) return STEP_RULES.find(([pattern]) => pattern.test(key))?.[1] ?? null;
  if (!r.isGcnLayout) {
    const status = deriveStatus(r);
    return status === 'HOAN_THANH' ? 'DA_GIAI_QUYET' : status === 'CHO_LANH_DAO_DUYET' ? 'TRINH_UB' : 'DANG_THU_LY';
  }
  return 'DANG_THU_LY';
}

function deriveStatus(r) {
  if (isMarked(r.ketThucX) || r.ngayKetThuc || isMarked(r.ketThucRaw) || /DA GIAI QUYET|HOAN THANH|DA TRA/.test(fold(r.tinhTrang))) {
    return 'HOAN_THANH';
  }
  if (r.ngayTrinhThucTe || isMarked(r.trinhRaw)) return 'CHO_LANH_DAO_DUYET';
  return r.cbtlRaw ? 'DANG_XU_LY' : 'MOI_TIEP_NHAN';
}

/* ------------------------------------------------------------------ */
/* Đọc Excel                                                          */
/* ------------------------------------------------------------------ */

async function readWorkbook(source) {
  const workbook = new ExcelJS.Workbook();
  if (Buffer.isBuffer(source)) await workbook.xlsx.load(source);
  else await workbook.xlsx.readFile(source);
  return workbook;
}

/** Tìm dòng tiêu đề (có cột Tên + Ngày nhận) trong các dòng đầu và ánh xạ cột. */
function findHeader(ws) {
  for (let rowNumber = 1; rowNumber <= Math.min(HEADER_SCAN_ROWS, ws.rowCount); rowNumber++) {
    const titles = {};
    ws.getRow(rowNumber).eachCell((cell, col) => {
      const title = fold(cellValue(cell));
      if (title) titles[col] = title;
    });
    const columns = {};
    for (const [field, patterns] of Object.entries(COLUMN_PATTERNS)) {
      for (const pattern of patterns) {
        const col = Object.keys(titles).find((c) => pattern.test(titles[c]));
        if (col) {
          columns[field] = Number(col);
          break;
        }
      }
    }
    if (columns.ten && columns.ngayNhan) {
      // Nhóm tiêu đề gộp ở dòng ngay trên (ô gộp trả về giá trị của ô đầu).
      const groups = {};
      if (rowNumber > 1) {
        ws.getRow(rowNumber - 1).eachCell((cell, col) => {
          const group = fold(cellValue(cell));
          if (group) groups[col] = group;
        });
      }
      const gcn = {};
      for (const [field, options] of Object.entries(GCN_COLUMNS)) {
        for (const [groupPattern, titlePattern] of options) {
          const col = Object.keys(titles).find(
            (c) => titlePattern.test(titles[c]) && (!groupPattern || groupPattern.test(groups[c] ?? ''))
          );
          if (col) {
            gcn[field] = Number(col);
            break;
          }
        }
      }
      // Sổ GCN: các cột "Ngày trình UB" / "TRÌNH UB" là của từng bước, không phải ngày trình LĐ chung.
      if (gcn.ngayBatDauNY) {
        delete columns.trinhLD;
        delete columns.trinhVPUB;
      }
      return { headerRow: rowNumber, columns, gcn };
    }
  }
  return null;
}

function readSheet(ws, sheetConfig, header, issues) {
  const { headerRow, columns, gcn = {} } = header;
  const get = (row, field) => (columns[field] ? cellValue(row.getCell(columns[field])) : null);
  const getGcn = (row, field) => (gcn[field] ? cellValue(row.getCell(gcn[field])) : null);
  const isGcnLayout = Boolean(gcn.ngayBatDauNY);
  const records = [];
  let previousYear = null;

  ws.eachRow((row, dong) => {
    if (dong <= headerRow) return;
    const ten = get(row, 'ten');
    if (!isMarked(ten)) return;

    let ngayVao = toDate(get(row, 'ngayNhan')) ?? toDate(get(row, 'ngayChuyen'));
    if (!ngayVao) {
      issues.push({ sheet: ws.name, dong, message: 'Bỏ qua: không đọc được Ngày nhận', value: String(get(row, 'ngayNhan') ?? '') });
      return;
    }

    // Sửa năm gõ nhầm cho cả dòng (ngày nhận và các ngày khác cùng năm sai).
    const wrongYear = ngayVao.getUTCFullYear();
    const typo = previousYear !== null && previousYear - wrongYear >= YEAR_TYPO_GAP;
    const targetYear = previousYear;
    const fixYear = typo
      ? (date) => (date && date.getUTCFullYear() === wrongYear ? withYear(date, targetYear) : date)
      : (date) => date;
    if (typo) {
      issues.push({ sheet: ws.name, dong, message: `Sửa năm gõ nhầm ${wrongYear} → ${targetYear}`, value: isoDay(ngayVao) });
      ngayVao = fixYear(ngayVao);
    }
    previousYear = ngayVao.getUTCFullYear();

    const loaiGoc = get(row, 'loai');
    const ketThucRaw = get(row, 'ngayKetThuc');
    const record = {
      sheet: ws.name,
      dong,
      prefix: sheetConfig.prefix,
      hasLateColumn: Boolean(columns.treHan),
      stt: get(row, 'stt'),
      soBienNhan: isMarked(get(row, 'soBienNhan')) ? String(get(row, 'soBienNhan')).trim() : '',
      tenHoSo: ten instanceof Date ? isoDay(ten) : String(ten),
      diaChi: isMarked(get(row, 'diaChi')) ? String(get(row, 'diaChi')) : '',
      loaiHoSoGoc: isMarked(loaiGoc) ? String(loaiGoc) : '',
      phanLoai: classifyType(loaiGoc, sheetConfig.defaultType),
      ngayVao,
      ngayHenTra: fixYear(toDate(get(row, 'henTra'))),
      ngayGiaHan: fixYear(toDate(get(row, 'giaHan'), 'last')),
      ngayTrinhThucTe: fixYear(latest(toDate(get(row, 'trinhVPUB'), 'last'), toDate(get(row, 'trinhLD'), 'last'))),
      lanTrinh: submissionsFrom(get(row, 'trinhLD'), get(row, 'trinhVPUB'), fixYear),
      ngayKetThuc: fixYear(toDate(ketThucRaw, 'last')),
      ketThucX: get(row, 'ketThucX'),
      treHanX: get(row, 'treHan'),
      ketThucRaw,
      trinhRaw: get(row, 'trinhVPUB') ?? get(row, 'trinhLD'),
      tinhTrang: get(row, 'tinhTrang'),
      cbtlRaw: isMarked(get(row, 'cbtl')) ? String(get(row, 'cbtl')) : '',
      ghiChuCanBo: isMarked(get(row, 'dienGiai')) ? String(get(row, 'dienGiai')) : '',
      ghiChu: isMarked(get(row, 'ghiChu')) ? String(get(row, 'ghiChu')) : '',
      isGcnLayout,
      ngayChuyen: fixYear(toDate(get(row, 'ngayChuyen'))),
      ...Object.fromEntries(GCN_DATE_COLUMNS.map((field) => [field, fixYear(toDate(getGcn(row, field), 'last'))])),
      tinhTrangGcn: getGcn(row, 'tinhTrangGcn'),
      to: isMarked(getGcn(row, 'to')) ? String(getGcn(row, 'to')) : '',
      soGCN: isMarked(getGcn(row, 'soGCN')) ? String(getGcn(row, 'soGCN')) : '',
      giaiTrinh: isMarked(getGcn(row, 'giaiTrinh')) ? String(getGcn(row, 'giaiTrinh')) : '',
      ghiChuUuTien: isMarked(getGcn(row, 'ghiChuUuTien')) ? String(getGcn(row, 'ghiChuUuTien')) : '',
      congNhanThemDat: isMarked(getGcn(row, 'congNhanThem')),
      capGCN: isMarked(getGcn(row, 'capGcnX')),
    };
    // Ô ngày gõ sai (vd. "10//9/2026") → báo để người nhập kiểm tra.
    for (const field of GCN_DATE_COLUMNS) {
      const raw = getGcn(row, field);
      if (isMarked(raw) && !record[field] && typeof raw === 'string') {
        issues.push({ sheet: ws.name, dong, message: `Không đọc được ngày ở cột ${field}`, value: String(raw) });
      }
    }
    if (record.phanLoai === 'KHAC' && record.loaiHoSoGoc) {
      issues.push({ sheet: ws.name, dong, message: 'Loại hồ sơ không khớp loại chuẩn → Thủ tục khác', value: record.loaiHoSoGoc });
    }
    if (record.ngayHenTra && record.ngayHenTra < record.ngayVao) {
      issues.push({ sheet: ws.name, dong, message: 'Ngày hẹn trả trước Ngày nhận (giữ nguyên theo file)', value: isoDay(record.ngayHenTra) });
    }
    records.push(record);
  });
  return records;
}

const nameKey = (r) => `TD:${fold(r.tenHoSo)}|${fold(r.diaChi)}|${isoDay(new Date(r.ngayVao))}`;
const matchKeys = (r) => (r.soBienNhan ? [`BN:${fold(r.soBienNhan)}`, nameKey(r)] : [nameKey(r)]);

const FILLABLE = [
  'soBienNhan', 'diaChi', 'loaiHoSoGoc', 'ngayHenTra', 'ngayGiaHan', 'ngayTrinhThucTe', 'ngayKetThuc',
  'ketThucX', 'treHanX', 'ketThucRaw', 'trinhRaw', 'tinhTrang', 'cbtlRaw', 'ghiChuCanBo', 'ghiChu',
];

/** Gộp các sheet: hồ sơ ở sheet khác trùng biên nhận / tên-địa chỉ-ngày → bổ sung ô trống. */
function mergeSheets(sheetRecords) {
  const merged = [];
  const index = new Map();
  const stats = [];

  for (const { sheet, records } of sheetRecords) {
    let matched = 0;
    let added = 0;
    for (const r of records) {
      const target = matchKeys(r)
        .map((key) => index.get(key))
        .find((candidate) => candidate && candidate.sheet !== r.sheet);
      if (target) {
        matched++;
        for (const field of FILLABLE) {
          if (!isMarked(target[field]) && isMarked(r[field])) target[field] = r[field];
        }
        if (!target.lanTrinh?.length && r.lanTrinh?.length) target.lanTrinh = r.lanTrinh;
        target.hasLateColumn ||= r.hasLateColumn;
      } else {
        added++;
        merged.push(r);
        matchKeys(r).forEach((key) => index.has(key) || index.set(key, r));
      }
    }
    stats.push({ sheet, read: records.length, merged: matched, added });
  }
  return { records: merged, stats };
}

/* ------------------------------------------------------------------ */
/* Phân tích (không ghi DB)                                           */
/* ------------------------------------------------------------------ */

/**
 * Đọc workbook và chuẩn bị danh sách hồ sơ để nhập.
 * @param {object} options
 *   - useDb (mặc định true): đối chiếu cán bộ có sẵn + bỏ hồ sơ đã có trong DB (cần đã kết nối mongoose)
 *   - skipExisting (mặc định true): bỏ hồ sơ trùng với DB (theo biên nhận + tên, hoặc tên + địa chỉ + ngày nhận)
 */
async function analyzeImport(workbook, { useDb = true, skipExisting = true } = {}) {
  const issues = [];

  // Sheet đã biết đọc theo thứ tự KNOWN_SHEETS, rồi tới các sheet khác theo thứ tự trong file.
  const visible = workbook.worksheets.filter((ws) => ws.state !== 'hidden' && ws.state !== 'veryHidden');
  const knownOrder = (ws) => {
    const i = KNOWN_SHEETS.findIndex((s) => s.name === ws.name);
    return i === -1 ? KNOWN_SHEETS.length : i;
  };
  const ordered = [...visible].sort((a, b) => knownOrder(a) - knownOrder(b));

  const sheetRecords = [];
  const skippedSheets = [];
  for (const ws of ordered) {
    const header = findHeader(ws);
    if (!header) {
      skippedSheets.push(ws.name);
      continue;
    }
    const config = KNOWN_SHEETS.find((s) => s.name === ws.name) ?? DEFAULT_SHEET_CONFIG;
    sheetRecords.push({ sheet: ws.name, records: readSheet(ws, config, header, issues) });
  }
  if (sheetRecords.length === 0) {
    const error = new Error('Không tìm thấy sheet nào có dòng tiêu đề gồm cột "Tên hồ sơ" và "Ngày nhận"');
    error.status = 400;
    throw error;
  }

  const { records: merged, stats: sheetStats } = mergeSheets(sheetRecords);

  // Cán bộ đã có tài khoản: nhận theo họ tên; tên chuẩn ↔ tài khoản để biết ai sẽ được tạo mới.
  const existingOfficers = useDb ? await User.find({ role: 'CAN_BO' }).select('username hoTen').lean() : [];
  const aliasIndex = buildAliasIndex(existingOfficers);
  const accountFor = (name) =>
    existingOfficers.find((u) => fold(u.hoTen) === fold(name) || u.username === slugUsername(name)) ?? null;

  // Bỏ hồ sơ đã có trong DB.
  let records = merged;
  const duplicates = [];
  if (useDb && skipExisting) {
    const existing = await Dossier.find().select('soBienNhan tenHoSo diaChi ngayVao').lean();
    const byName = new Set(existing.map(nameKey));
    const byReceipt = new Set(existing.filter((d) => d.soBienNhan).map((d) => `${fold(d.soBienNhan)}|${fold(d.tenHoSo)}`));
    records = [];
    for (const r of merged) {
      const dup = byName.has(nameKey(r)) || (r.soBienNhan && byReceipt.has(`${fold(r.soBienNhan)}|${fold(r.tenHoSo)}`));
      (dup ? duplicates : records).push(r);
    }
  }

  // Cán bộ, trạng thái
  const officers = new Map();
  const newNames = new Map();
  for (const r of records) {
    const officer = resolveOfficer(r.cbtlRaw, aliasIndex);
    r.officer = officer.primary;
    r.newOfficerName = officer.newName;
    if (officer.primary) {
      const entry = officers.get(officer.primary) ?? { name: officer.primary, count: 0, variants: new Map() };
      entry.count++;
      entry.variants.set(r.cbtlRaw, (entry.variants.get(r.cbtlRaw) ?? 0) + 1);
      officers.set(officer.primary, entry);
    } else if (officer.newName) {
      newNames.set(officer.newName, (newNames.get(officer.newName) ?? 0) + 1);
    } else if (r.cbtlRaw) {
      issues.push({ sheet: r.sheet, dong: r.dong, message: 'Không nhận ra cán bộ → Chưa phân công', value: r.cbtlRaw });
    }
    // Giữ nguyên ô CBTL gốc trong ghi chú khi có nhiều người / chuyển giao / không nhận ra.
    // (Tên mới: chỉ ghi chú nếu lúc nhập chọn không tạo tài khoản — xem commitImport.)
    if (r.cbtlRaw && !officer.newName && (officer.ambiguous || !officer.primary)) {
      r.ghiChu = [r.ghiChu, `CBTL trong file: ${r.cbtlRaw}`].filter(Boolean).join(' | ');
    }
    const step = deriveStep(r);
    if (step === null) issues.push({ sheet: r.sheet, dong: r.dong, message: 'Không nhận ra tình trạng → Đang thụ lý', value: r.tinhTrangGcn });
    r.buoc = step ?? 'DANG_THU_LY';
    r.trangThai = statusForStep(r.buoc, Boolean(r.officer || r.newOfficerName));
    if (r.isGcnLayout) {
      // Ngày trình gần nhất + ngày kết thúc (hồ sơ đã giải quyết: ngày văn bản rút / trình cấp GCN).
      r.ngayTrinhThucTe = latest(r.ngayTrinhNY, r.ngayTrinhDuThao, r.ngayTrinhPCThue, r.ngayTrinhGCN, r.ngayTrinhRut);
      if (r.buoc === 'DA_GIAI_QUYET') r.ngayKetThuc = r.ngayKetThuc || latest(r.ngayVBRut, r.ngayTrinhGCN);
    }
  }

  const countBy = (key) =>
    records.reduce((acc, r) => {
      acc[r[key]] = (acc[r[key]] ?? 0) + 1;
      return acc;
    }, {});

  return {
    records,
    duplicates,
    issues,
    summary: {
      sheets: sheetStats,
      skippedSheets,
      totalRows: sheetStats.reduce((sum, s) => sum + s.read, 0),
      afterMerge: merged.length,
      newCount: records.length,
      duplicateCount: duplicates.length,
      byStatus: countBy('trangThai'),
      byType: Object.entries(countBy('phanLoai'))
        .map(([ma, count]) => ({ ma, moTa: PHAN_LOAI_RULES[ma]?.moTa ?? ma, count }))
        .sort((a, b) => b.count - a.count),
      officers: [...officers.values()]
        .sort((a, b) => b.count - a.count)
        .map((o) => ({
          name: o.name,
          count: o.count,
          username: accountFor(o.name)?.username ?? slugUsername(o.name),
          isNew: !accountFor(o.name),
          variants: [...o.variants.entries()].map(([raw, n]) => `${raw} (${n})`),
        })),
      // Tên trong cột CBTL chưa có tài khoản và không có trong bảng gộp tên — người nhập chọn có tạo hay không.
      newOfficerNames: [...newNames.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count, username: slugUsername(name) })),
      unassigned: records.filter((r) => !r.officer && !r.newOfficerName).length,
      withDeadline: records.filter((r) => r.ngayHenTra || r.ngayGiaHan).length,
      issueCount: issues.length,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Ghi DB                                                             */
/* ------------------------------------------------------------------ */

/** Mã hồ sơ: số biên nhận (thêm -2, -3 nếu trùng) hoặc <tiền tố>-<năm>-<STT>. */
function assignCodes(records, usedCodes) {
  const uniqueCode = (base) => {
    const upper = base.toUpperCase();
    let code = upper;
    for (let n = 2; usedCodes.has(code); n++) code = `${upper}-${n}`;
    usedCodes.add(code);
    return code;
  };
  for (const r of records) {
    const stt = r.stt !== null && Number.isFinite(Number(r.stt)) ? String(r.stt).padStart(4, '0') : `D${r.dong}`;
    r.maHoSo = uniqueCode(r.soBienNhan || `${r.prefix}-${r.ngayVao.getUTCFullYear()}-${stt}`);
  }
}

/** Gán mã tạm để xem trước (không đụng DB). */
function previewCodes(records) {
  assignCodes(records, new Set());
}

/**
 * Tạo tài khoản cán bộ còn thiếu (CHƯA có mật khẩu) và ghi hồ sơ.
 * - createNewOfficers: tạo tài khoản cho tên CBTL mới (summary.newOfficerNames); nếu không,
 *   các hồ sơ đó để Chưa phân công và giữ tên gốc trong Ghi chú.
 * Mã hồ sơ được cấp lại tại thời điểm ghi để tránh trùng với hồ sơ vừa thêm sau lúc xem trước.
 */
async function commitImport(records, { batchId, fileName, createNewOfficers = false, auth = null }) {
  for (const r of records) {
    if (r.officer || !r.newOfficerName) continue;
    if (createNewOfficers) r.officer = r.newOfficerName;
    else r.ghiChu = [r.ghiChu, `CBTL trong file: ${r.cbtlRaw}`].filter(Boolean).join(' | ');
  }

  const existingCodes = await Dossier.find().select('maHoSo').lean();
  assignCodes(records, new Set(existingCodes.map((d) => d.maHoSo)));

  const officers = await User.find({ role: 'CAN_BO' }).select('username hoTen').lean();
  const officerIds = new Map();
  let officersCreated = 0;
  for (const name of new Set(records.map((r) => r.officer).filter(Boolean))) {
    let user = officers.find((u) => fold(u.hoTen) === fold(name) || u.username === slugUsername(name));
    if (!user) {
      const taken = await User.findOne({ username: slugUsername(name) }).select('role').lean();
      if (taken) throw Object.assign(new Error(`Tên đăng nhập "${slugUsername(name)}" đã dùng cho tài khoản ${taken.role}`), { status: 409 });
      user = await User.create({ username: slugUsername(name), hoTen: name, role: 'CAN_BO' });
      officersCreated++;
    }
    officerIds.set(name, user._id);
  }

  const docs = records.map((r) => {
    const doc = {
      maHoSo: r.maHoSo,
      soBienNhan: r.soBienNhan,
      tenHoSo: r.tenHoSo,
      diaChi: r.diaChi,
      phanLoai: r.phanLoai,
      loaiHoSoGoc: r.loaiHoSoGoc,
      ngayVao: r.ngayVao,
      ngayHenTra: r.ngayHenTra,
      ngayGiaHan: r.ngayGiaHan,
      ngayChuyen: r.ngayChuyen ?? null,
      ...Object.fromEntries(GCN_DATE_COLUMNS.map((field) => [field, r[field] ?? null])),
      buoc: r.buoc,
      to: r.to ?? '',
      soGCN: r.soGCN ?? '',
      giaiTrinh: r.giaiTrinh ?? '',
      ghiChuUuTien: r.ghiChuUuTien ?? '',
      congNhanThemDat: Boolean(r.congNhanThemDat),
      capGCN: Boolean(r.capGCN),
      ngayTrinhThucTe: r.ngayTrinhThucTe,
      lanTrinh: r.lanTrinh ?? [],
      ngayKetThuc: r.ngayKetThuc,
      treHanTheoSo: registerLateFlag(r),
      canBoThuLy: r.officer ? officerIds.get(r.officer) : null,
      ghiChuCanBo: r.ghiChuCanBo,
      ghiChu: r.ghiChu,
      trangThai: r.trangThai,
      nguonNhap: { tep: fileName, lanNhap: batchId, sheet: r.sheet, dong: r.dong },
    };
    // Hạn trả, hạn các bước còn trống, bước kế tiếp — ngày có trong file giữ nguyên.
    return applyWorkflow(doc, { explicit: (field) => doc[field] !== null && doc[field] !== undefined });
  });

  let inserted = 0;
  const BATCH = 500;
  for (let i = 0; i < docs.length; i += BATCH) {
    const saved = await Dossier.insertMany(docs.slice(i, i + BATCH), { ordered: true });
    inserted += saved.length;
    // Nhật ký: mỗi hồ sơ một dòng "Nhập từ Excel" (auth = người nhập; script dòng lệnh để trống → "Hệ thống").
    await logMany(
      auth,
      saved.map((d) => ({
        dossier: d._id,
        maHoSo: d.maHoSo,
        action: 'IMPORT',
        note: `Nhập từ file ${fileName} (sheet ${d.nguonNhap.sheet}, dòng ${d.nguonNhap.dong})`,
      }))
    );
  }
  return { inserted, officersCreated };
}

/* ------------------------------------------------------------------ */
/* File mẫu                                                           */
/* ------------------------------------------------------------------ */

/** File Excel mẫu: sheet nhập liệu (có danh sách chọn Loại / CBTL) + sheet hướng dẫn. */
async function buildTemplate() {
  const officers = await User.find({ role: 'CAN_BO', isActive: { $ne: false } }).select('hoTen').sort({ hoTen: 1 }).lean();
  const types = Object.values(PHAN_LOAI_RULES).map((rule) => rule.moTa);
  const steps = Object.values(BUOC);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Hệ thống Quản lý Hồ sơ';

  const data = wb.addWorksheet('Hồ sơ', { views: [{ state: 'frozen', ySplit: 1 }] });
  data.columns = TEMPLATE_COLUMNS.map((col) => ({ header: col.header, width: col.width }));
  const head = data.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.alignment = { vertical: 'middle', wrapText: true };
  head.height = 32;
  TEMPLATE_COLUMNS.forEach((col, i) => {
    head.getCell(i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col.required ? 'FFB91C1C' : 'FF1E293B' } };
  });

  // Danh mục cho danh sách chọn (sheet ẩn).
  const lists = wb.addWorksheet('DanhMuc', { state: 'hidden' });
  types.forEach((t, i) => (lists.getCell(i + 1, 1).value = t));
  officers.forEach((o, i) => (lists.getCell(i + 1, 2).value = o.hoTen));
  steps.forEach((t, i) => (lists.getCell(i + 1, 3).value = t));
  const listRef = {
    types: `DanhMuc!$A$1:$A$${types.length}`,
    officers: `DanhMuc!$B$1:$B$${Math.max(officers.length, 1)}`,
    steps: `DanhMuc!$C$1:$C$${steps.length}`,
  };

  const ROWS = 500;
  TEMPLATE_COLUMNS.forEach((col, i) => {
    for (let r = 2; r <= ROWS + 1; r++) {
      const cell = data.getCell(r, i + 1);
      if (col.date) {
        cell.numFmt = 'dd/mm/yyyy';
        cell.dataValidation = {
          type: 'date', operator: 'greaterThan', allowBlank: true, formulae: [new Date(Date.UTC(2000, 0, 1))],
          showErrorMessage: true, errorTitle: 'Ngày không hợp lệ', error: 'Nhập ngày dạng dd/mm/yyyy',
        };
      } else if (col.list && (col.list !== 'officers' || officers.length)) {
        // Danh sách gợi ý, vẫn cho gõ giá trị khác (CBTL mới / loại khác).
        cell.dataValidation = { type: 'list', allowBlank: true, formulae: [listRef[col.list]], showErrorMessage: false };
      }
    }
  });

  const guide = wb.addWorksheet('Hướng dẫn');
  guide.columns = [{ width: 34 }, { width: 90 }];
  [
    ['HƯỚNG DẪN NHẬP HỒ SƠ', ''],
    ['', ''],
    ['Cột bắt buộc (tiêu đề đỏ)', 'Ngày nhận, Tên hồ sơ. Dòng thiếu một trong hai cột này bị bỏ qua.'],
    ['Ngày', 'Nhập dạng dd/mm/yyyy (vd. 05/01/2026).'],
    ['Loại hồ sơ', 'Chọn trong danh sách. Ghi theo tên thủ tục khác cũng được, hệ thống tự gộp về loại gần nhất.'],
    ['CBTL', 'Chọn cán bộ trong danh sách. Tên mới chưa có tài khoản: khi xem trước có thể chọn tạo tài khoản (chưa có mật khẩu) hoặc để Chưa phân công.'],
    ['Ngày hẹn trả / Gia hạn', 'Để trống thì hạn trả = Ngày nhận + hạn mặc định của loại hồ sơ; loại có niêm yết cộng thêm thời gian niêm yết.'],
    ['Kết thúc Quy trình', 'Đánh "x" nếu hồ sơ đã giải quyết xong (hoặc chọn Tình trạng "Đã giải quyết").'],
    ['Các cột hạn (Hạn trình …)', 'Để trống thì hệ thống tự tính theo Quản trị → Cấu hình hạn (vd. hạn trình niêm yết = Ngày nhận + 8 ngày làm việc).'],
    ['Tình trạng', 'Bước hiện tại của hồ sơ — chọn trong danh sách.'],
    ['Trùng hồ sơ', 'Hồ sơ đã có trong hệ thống (cùng Tên + Địa chỉ + Ngày nhận, hoặc cùng Số biên nhận + Tên) được bỏ qua.'],
    ['Tải lên sổ GCN', 'Có thể tải thẳng file "DANH SÁCH GCN" (Google Sheets → Tệp → Tải xuống → .xlsx).'],
    ['', ''],
    ['Loại hồ sơ', 'Hạn trả mặc định'],
    ...Object.values(PHAN_LOAI_RULES).map((rule) => [rule.moTa, `${rule.hetHan} ngày${rule.niemYet ? ' + niêm yết' : ''}`]),
  ].forEach((row) => guide.addRow(row));
  guide.getRow(1).font = { bold: true, size: 14 };
  guide.getRow(13).font = { bold: true };
  guide.getColumn(2).alignment = { wrapText: true };

  return wb.xlsx.writeBuffer();
}

module.exports = {
  submissionsFrom,
  readWorkbook,
  analyzeImport,
  previewCodes,
  commitImport,
  buildTemplate,
  registerLateFlag,
  slugUsername,
};
