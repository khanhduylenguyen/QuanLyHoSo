/**
 * Cấu hình hệ thống lưu trong MongoDB (collection "settings", mỗi khoá một bản ghi) + bộ nhớ đệm.
 *
 * - deadlines: thời hạn theo loại hồ sơ, số ngày từng bước quy trình GCN (quyTrinh), có tính theo ngày làm việc
 *   không, ngày nghỉ cuối tuần, ngày lễ.
 * - reminders: nhắc hạn qua email (xem reminders.js).
 *
 * Hook Mongoose tính hạn chạy đồng bộ nên đọc từ bộ đệm; gọi loadSettings() sau khi kết nối DB
 * (server, seed, script nhập) để nạp cấu hình đã lưu.
 */
const mongoose = require('mongoose');
const { addDays } = require('date-fns');
const { PHAN_LOAI_RULES } = require('./catalog');

const { Schema } = mongoose;

const settingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, minimize: false }
);
const Setting = mongoose.models.Setting || mongoose.model('Setting', settingSchema);

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RULE_DAYS = 365;
const MAX_HOLIDAYS = 500;

// Số ngày từng bước quy trình GCN. null = chưa quy định → bước đó chỉ ghi ngày, không tự tính hạn.
// trinhNY / duThao / pcThue / trinhGCN tính theo lịch làm việc (useWorkingDays); niemYet, henTraCongNY là ngày lịch.
const QUY_TRINH_KEYS = Object.freeze({
  trinhNY: { label: 'Hạn trình niêm yết (từ ngày nhận)', required: true },
  niemYet: { label: 'Thời gian niêm yết (ngày lịch)', required: true },
  henTraCongNY: { label: 'Hạn trả cộng thêm do niêm yết (ngày lịch)', required: true },
  duThao: { label: 'Hạn trình dự thảo cấp GCN (từ ngày kết thúc niêm yết)' },
  pcThue: { label: 'Hạn trình phiếu chuyển thuế (từ ngày trình dự thảo)' },
  trinhGCN: { label: 'Hạn trình cấp GCN (từ ngày nhận kết quả NVTC)' },
});

// Ngày lễ cố định theo dương lịch. Tết Nguyên đán, Giỗ Tổ (âm lịch) và ngày nghỉ bù thay đổi
// theo từng năm nên Quản trị tự thêm trong trang Cấu hình hạn.
const DEFAULT_HOLIDAYS = ['2026-01-01', '2026-04-30', '2026-05-01', '2026-09-02', '2027-01-01', '2027-04-30', '2027-05-01', '2027-09-02'];

const DEFAULTS = {
  deadlines: {
    useWorkingDays: true,
    weekendDays: [0, 6], // 0 = Chủ nhật, 6 = Thứ bảy
    holidays: DEFAULT_HOLIDAYS,
    rules: Object.fromEntries(Object.entries(PHAN_LOAI_RULES).map(([code, rule]) => [code, { hetHan: rule.hetHan }])),
    // Theo công thức trong sheet GCN: hạn trình NY = WORKDAY(Ngày nhận, 8); niêm yết 15 ngày; hạn trả + 15.
    quyTrinh: { trinhNY: 8, niemYet: 15, henTraCongNY: 15, duThao: null, pcThue: null, trinhGCN: null },
  },
  reminders: {
    enabled: false,
    sendTime: '07:30', // giờ Việt Nam
    daysAhead: 3,
    includeOverdue: true,
    sendSummaryToAdmins: true,
    lastRunDate: null,
  },
};

const cache = structuredClone(DEFAULTS);
let holidaySet = new Set(cache.deadlines.holidays);

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

/** Gộp cấu hình đã lưu lên mặc định (trường mới thêm sau này vẫn có giá trị). */
function merge(defaults, saved) {
  if (!isPlainObject(saved)) return structuredClone(defaults);
  const result = structuredClone(defaults);
  for (const [key, value] of Object.entries(saved)) {
    result[key] = isPlainObject(defaults[key]) && isPlainObject(value) ? merge(defaults[key], value) : value;
  }
  return result;
}

async function loadSettings() {
  const docs = await Setting.find({ key: { $in: Object.keys(DEFAULTS) } }).lean();
  for (const key of Object.keys(DEFAULTS)) {
    cache[key] = merge(DEFAULTS[key], docs.find((doc) => doc.key === key)?.value);
  }
  holidaySet = new Set(cache.deadlines.holidays);
}

const getSettings = (key) => structuredClone(cache[key]);

async function saveSettings(key, value) {
  const merged = merge(DEFAULTS[key], value);
  await Setting.updateOne({ key }, { $set: { value: merged } }, { upsert: true });
  cache[key] = merged;
  if (key === 'deadlines') holidaySet = new Set(merged.holidays);
  return structuredClone(merged);
}

/* ------------------------------------------------------------------ */
/* Lịch làm việc                                                      */
/* ------------------------------------------------------------------ */

// Ngày lưu dạng 00:00 UTC (từ ô <input type="date"> / Excel) nên so theo UTC.
const isoDay = (date) => date.toISOString().slice(0, 10);

const VN_OFFSET_MS = 7 * 3600 * 1000;

/** Ngày hôm nay theo giờ Việt Nam, dạng 00:00 UTC (cùng quy ước lưu ngày của hệ thống). */
function todayVN(now = new Date()) {
  const local = new Date(now.getTime() + VN_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

const isNonWorkingDay = (date, config = cache.deadlines, holidays = holidaySet) =>
  config.weekendDays.includes(date.getUTCDay()) || holidays.has(isoDay(date));

/** Cộng `days` ngày (lịch hoặc làm việc tuỳ cấu hình) kể từ ngày sau `start`. */
function addDeadlineDays(start, days, config = cache.deadlines) {
  if (!config.useWorkingDays) return addDays(start, days);
  const holidays = config === cache.deadlines ? holidaySet : new Set(config.holidays);
  let date = new Date(start.getTime());
  let counted = 0;
  // Giới hạn vòng lặp phòng cấu hình nghỉ cả tuần.
  for (let guard = 0; counted < days && guard < days * 7 + 400; guard++) {
    date = new Date(date.getTime() + 86400000);
    if (!isNonWorkingDay(date, config, holidays)) counted++;
  }
  return date;
}

/** Thời hạn đang áp dụng cho một loại thủ tục. */
const ruleFor = (phanLoai) =>
  PHAN_LOAI_RULES[phanLoai] ? { ...PHAN_LOAI_RULES[phanLoai], ...cache.deadlines.rules[phanLoai] } : null;

/** Số ngày từng bước quy trình GCN đang áp dụng. */
const quyTrinhConfig = () => cache.deadlines.quyTrinh;

/** Danh sách loại + thời hạn hiệu lực (cho API /meta và trang cấu hình). */
const effectiveRules = () =>
  Object.entries(PHAN_LOAI_RULES).map(([ma, rule]) => ({ ma, moTa: rule.moTa, niemYet: rule.niemYet, hetHan: ruleFor(ma).hetHan }));

/* ------------------------------------------------------------------ */
/* Kiểm tra dữ liệu cấu hình                                          */
/* ------------------------------------------------------------------ */

function validateDeadlineSettings(input) {
  const errors = [];
  const output = {};

  output.useWorkingDays = Boolean(input?.useWorkingDays);

  const weekend = [...new Set((input?.weekendDays ?? []).map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (weekend.length >= 7) errors.push('Phải có ít nhất 1 ngày làm việc trong tuần');
  output.weekendDays = weekend.sort();

  const holidays = [...new Set((input?.holidays ?? []).map(String))];
  const badHoliday = holidays.find((h) => !ISO_DAY.test(h) || Number.isNaN(new Date(h).getTime()));
  if (badHoliday) errors.push(`Ngày lễ không hợp lệ: ${badHoliday}`);
  if (holidays.length > MAX_HOLIDAYS) errors.push(`Tối đa ${MAX_HOLIDAYS} ngày lễ`);
  output.holidays = holidays.sort();

  output.rules = {};
  for (const code of Object.keys(PHAN_LOAI_RULES)) {
    const hetHan = Number((input?.rules?.[code] ?? ruleFor(code))?.hetHan);
    if (!Number.isInteger(hetHan) || hetHan < 1 || hetHan > MAX_RULE_DAYS) {
      errors.push(`${PHAN_LOAI_RULES[code].moTa}: hạn trả phải là số nguyên 1–${MAX_RULE_DAYS}`);
    }
    output.rules[code] = { hetHan };
  }

  output.quyTrinh = {};
  for (const [key, { label, required }] of Object.entries(QUY_TRINH_KEYS)) {
    // Có gửi khoá thì dùng giá trị gửi (kể cả null = để trống); không gửi thì giữ cấu hình hiện tại.
    const raw = input?.quyTrinh && key in input.quyTrinh ? input.quyTrinh[key] : cache.deadlines.quyTrinh[key];
    if ((raw === null || raw === '' || raw === undefined) && !required) {
      output.quyTrinh[key] = null;
      continue;
    }
    const days = Number(raw);
    if (!Number.isInteger(days) || days < (required ? 1 : 0) || days > MAX_RULE_DAYS) {
      errors.push(`${label}: phải là số nguyên ${required ? 1 : 0}–${MAX_RULE_DAYS}${required ? '' : ' (để trống = không tự tính hạn)'}`);
    }
    output.quyTrinh[key] = days;
  }
  return { value: output, errors };
}

module.exports = {
  Setting,
  loadSettings,
  getSettings,
  saveSettings,
  addDeadlineDays,
  isNonWorkingDay,
  todayVN,
  ruleFor,
  quyTrinhConfig,
  QUY_TRINH_KEYS,
  effectiveRules,
  validateDeadlineSettings,
};
