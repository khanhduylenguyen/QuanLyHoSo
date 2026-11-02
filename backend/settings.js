/**
 * Cấu hình hệ thống lưu trong MongoDB (collection "settings", mỗi khoá một bản ghi) + bộ nhớ đệm.
 *
 * - deadlines: thời hạn theo loại thủ tục, có tính theo ngày làm việc không, ngày nghỉ cuối tuần, ngày lễ.
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

// Ngày lễ cố định theo dương lịch. Tết Nguyên đán, Giỗ Tổ (âm lịch) và ngày nghỉ bù thay đổi
// theo từng năm nên Quản trị tự thêm trong trang Cấu hình hạn.
const DEFAULT_HOLIDAYS = ['2026-01-01', '2026-04-30', '2026-05-01', '2026-09-02', '2027-01-01', '2027-04-30', '2027-05-01', '2027-09-02'];

const DEFAULTS = {
  deadlines: {
    useWorkingDays: true,
    weekendDays: [0, 6], // 0 = Chủ nhật, 6 = Thứ bảy
    holidays: DEFAULT_HOLIDAYS,
    rules: Object.fromEntries(Object.entries(PHAN_LOAI_RULES).map(([code, rule]) => [code, { trinh: rule.trinh, hetHan: rule.hetHan }])),
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
const ruleFor = (phanLoai) => cache.deadlines.rules[phanLoai] ?? null;

/** Danh sách loại + thời hạn hiệu lực (cho API /meta và trang cấu hình). */
const effectiveRules = () =>
  Object.entries(PHAN_LOAI_RULES).map(([ma, rule]) => ({ ma, moTa: rule.moTa, ...(cache.deadlines.rules[ma] ?? rule) }));

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
    const rule = input?.rules?.[code] ?? cache.deadlines.rules[code];
    const trinh = Number(rule?.trinh);
    const hetHan = Number(rule?.hetHan);
    const name = PHAN_LOAI_RULES[code].moTa;
    if (!Number.isInteger(hetHan) || hetHan < 1 || hetHan > MAX_RULE_DAYS) {
      errors.push(`${name}: hạn xử lý phải là số nguyên 1–${MAX_RULE_DAYS}`);
    } else if (!Number.isInteger(trinh) || trinh < 1 || trinh > hetHan) {
      errors.push(`${name}: hạn trình LĐ phải là số nguyên 1–${hetHan} (không vượt hạn xử lý)`);
    }
    output.rules[code] = { trinh, hetHan };
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
  effectiveRules,
  validateDeadlineSettings,
};
