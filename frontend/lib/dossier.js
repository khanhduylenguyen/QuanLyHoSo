import { differenceInCalendarDays, format, isValid, parseISO } from 'date-fns';

export const UPCOMING_WINDOW_DAYS = 7;
export const URGENT_SUBMIT_DAYS = 2;

export const ROLE_LABELS = {
  ADMIN: 'Lãnh đạo / Admin',
  CAN_BO: 'Cán bộ',
  VAN_THU: 'Văn thư',
};

export const ROLE_DESCRIPTIONS = {
  ADMIN:
    'Toàn quyền: xem tất cả hồ sơ, phân công cán bộ thụ lý, xem & sửa cột Chỉ đạo Lãnh đạo và Mức độ ưu tiên nội bộ.',
  VAN_THU:
    'Tiếp nhận hồ sơ: nhập mới, sửa Ngày vào & Phân loại (hệ thống tự tính lại hạn), phân công cán bộ.',
  CAN_BO:
    'Phân quyền dòng & cột: chỉ thấy hồ sơ được phân công, cập nhật Tình trạng, ngày từng bước, tiến độ & Các lần trình. Cột nhạy cảm bị giới hạn.',
};

export const TRANG_THAI_LABELS = {
  MOI_TIEP_NHAN: 'Mới tiếp nhận',
  DANG_XU_LY: 'Đang thụ lý',
  CHO_LANH_DAO_DUYET: 'Đã trình LĐ',
  HOAN_THANH: 'Hoàn thành',
};

// Kết quả một lần trình Lãnh đạo ('' = sổ cũ không ghi kết quả).
export const KET_QUA_TRINH_LABELS = {
  CHO_Y_KIEN: 'Chờ ý kiến',
  TRA_LAI: 'Trả lại bổ sung',
  DA_DUYET: 'Đã duyệt',
  '': 'Không rõ kết quả',
};

export const KET_QUA_TRINH_STYLES = {
  CHO_Y_KIEN: 'bg-sky-50 text-sky-700 border-sky-200',
  TRA_LAI: 'bg-orange-50 text-orange-700 border-orange-200',
  DA_DUYET: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '': 'bg-slate-50 text-slate-500 border-slate-200',
};

/** Các lần trình của hồ sơ; hồ sơ cũ chỉ có ngày trình thực tế thì coi là một lần trình. */
export const submissionsOf = (record) => {
  if (record?.lanTrinh?.length) return record.lanTrinh;
  return record?.ngayTrinhThucTe ? [{ ngay: record.ngayTrinhThucTe, ketQua: '', ghiChu: '' }] : [];
};

// Bước quy trình GCN (cột "Tình trạng" của sổ) — cùng danh sách với backend/gcn.js (API /meta trả nhãn).
export const BUOC_LABELS = {
  DANG_THU_LY: 'Đang thụ lý',
  TRINH_NY: 'Trình UB niêm yết',
  NIEM_YET: 'Đang niêm yết',
  CHO_HOP: 'Thụ lý chờ họp',
  TRINH_DU_THAO: 'Trình dự thảo cấp GCN',
  THUE: 'Thuế',
  TRINH_CAP_GCN: 'Trình UB cấp GCN',
  TRINH_UB: 'Trình UB',
  TRINH_RUT: 'Trình UB rút / điều chỉnh',
  TRA_GIAI_TRINH: 'Trả giải trình',
  DA_GIAI_QUYET: 'Đã giải quyết',
};

export const BUOC_STYLES = {
  DANG_THU_LY: 'bg-sky-50 text-sky-700 border-sky-200',
  TRINH_NY: 'bg-violet-50 text-violet-700 border-violet-200',
  NIEM_YET: 'bg-amber-50 text-amber-800 border-amber-200',
  CHO_HOP: 'bg-slate-100 text-slate-700 border-slate-300',
  TRINH_DU_THAO: 'bg-violet-50 text-violet-700 border-violet-200',
  THUE: 'bg-orange-50 text-orange-700 border-orange-200',
  TRINH_CAP_GCN: 'bg-violet-50 text-violet-700 border-violet-200',
  TRINH_UB: 'bg-violet-50 text-violet-700 border-violet-200',
  TRINH_RUT: 'bg-rose-50 text-rose-700 border-rose-200',
  TRA_GIAI_TRINH: 'bg-rose-50 text-rose-700 border-rose-200',
  DA_GIAI_QUYET: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

// Bước kế tiếp cần trình (hạn của nó = ngayTrinhLanhDao).
export const BUOC_KE_TIEP_LABELS = {
  NY: 'Trình niêm yết',
  DU_THAO: 'Trình dự thảo GCN',
  PC_THUE: 'Trình phiếu chuyển thuế',
  GCN: 'Trình cấp GCN',
  TRINH_LAI: 'Trình lại UB',
};

export const TRANG_THAI_STYLES = {
  MOI_TIEP_NHAN: 'bg-slate-100 text-slate-700 border-slate-300',
  DANG_XU_LY: 'bg-sky-50 text-sky-700 border-sky-200',
  CHO_LANH_DAO_DUYET: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  HOAN_THANH: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

// Màu badge cho loại thủ tục: nhóm theo lĩnh vực, loại lạ dùng màu xám.
const PHAN_LOAI_STYLES = {
  CAP_GCN: 'bg-purple-50 text-purple-700 border-purple-200',
  CONG_NHAN_THEM_DAT: 'bg-teal-50 text-teal-700 border-teal-200',
  DINH_CHINH_GCN: 'bg-sky-50 text-sky-700 border-sky-200',
};

export const phanLoaiStyle = (code) => PHAN_LOAI_STYLES[code] ?? 'bg-slate-50 text-slate-700 border-slate-200';

/**
 * Cộng `days` ngày kể từ ngày sau `start` theo lịch cấu hình (cùng quy tắc với backend settings.js):
 * calendar.useWorkingDays → bỏ ngày nghỉ cuối tuần (weekendDays, 0 = CN) và ngày lễ (yyyy-mm-dd).
 * `start` là Date 00:00 UTC (parseISO của chuỗi yyyy-MM-dd cho ra giờ địa phương nên đổi về UTC).
 */
export function addDeadlineDays(start, days, calendar) {
  const base = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()));
  if (!calendar?.useWorkingDays) return new Date(base.getTime() + days * 86400000);
  const holidays = new Set(calendar.holidays ?? []);
  let date = base;
  let counted = 0;
  for (let guard = 0; counted < days && guard < days * 7 + 400; guard++) {
    date = new Date(date.getTime() + 86400000);
    const off = calendar.weekendDays.includes(date.getUTCDay()) || holidays.has(date.toISOString().slice(0, 10));
    if (!off) counted++;
  }
  return date;
}

/** "ngày" hoặc "ngày làm việc" theo cấu hình. */
export const dayUnit = (calendar) => (calendar?.useWorkingDays ? 'ngày làm việc' : 'ngày');

/** Nguồn của hạn xử lý: gia hạn / biên nhận / mặc định theo loại. */
/** Nguồn của hạn trả (ghi chú nhỏ dưới ngày). niemYet: loại hồ sơ có cộng thời gian niêm yết. */
export const deadlineSource = (record, niemYet) => {
  if (record.ngayGiaHan) return 'gia hạn';
  const base = record.ngayHenTra ? 'hẹn trả theo BN' : 'ngày nhận + hạn của loại';
  return niemYet ? `${base} + niêm yết` : base;
};

export const MUC_DO_UU_TIEN_LABELS = {
  THAP: 'Thấp',
  TRUNG_BINH: 'Trung bình',
  CAO: 'Cao',
  KHAN_CAP: 'Khẩn cấp',
};

export const MUC_DO_UU_TIEN_STYLES = {
  THAP: 'bg-slate-100 text-slate-700 border-slate-200',
  TRUNG_BINH: 'bg-blue-50 text-blue-800 border-blue-200',
  CAO: 'bg-orange-50 text-orange-800 border-orange-200',
  KHAN_CAP: 'bg-rose-600 text-white border-rose-700',
};

// Thứ hạng dùng để sort cột ưu tiên theo mức độ thay vì theo alphabet.
export const MUC_DO_UU_TIEN_RANK = { THAP: 1, TRUNG_BINH: 2, CAO: 3, KHAN_CAP: 4 };

const toDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : parseISO(value);
  return isValid(date) ? date : null;
};

export const formatDate = (value) => {
  const date = toDate(value);
  return date ? format(date, 'dd/MM/yyyy') : '--/--/----';
};

/** Chuỗi yyyy-MM-dd cho <input type="date">. */
export const toDateInputValue = (value) => {
  const date = toDate(value);
  return date ? format(date, 'yyyy-MM-dd') : '';
};

/** Số ngày lịch từ hôm nay đến `value` (âm = đã qua). */
export const daysFromToday = (value, now = new Date()) => {
  const date = toDate(value);
  return date ? differenceInCalendarDays(date, now) : null;
};

const isDone = (record) => record.trangThai === 'HOAN_THANH';

/**
 * Trạng thái hạn theo ngày lịch:
 * - done:     hồ sơ đã hoàn thành (không cảnh báo)
 * - overdue:  ngayHetHan đã qua
 * - today:    hết hạn hôm nay
 * - upcoming: còn 1..7 ngày
 * - normal:   còn hơn 7 ngày
 */
export function getDeadlineStatus(record) {
  const daysLeft = daysFromToday(record.ngayHetHan);
  if (isDone(record)) return { status: 'done', daysLeft };
  if (daysLeft === null) return { status: 'normal', daysLeft };
  if (daysLeft < 0) return { status: 'overdue', daysLeft };
  if (daysLeft === 0) return { status: 'today', daysLeft };
  if (daysLeft <= UPCOMING_WINDOW_DAYS) return { status: 'upcoming', daysLeft };
  return { status: 'normal', daysLeft };
}

/**
 * Hạn bước kế tiếp cần trình (ngayTrinhLanhDao, tính ở backend/gcn.js):
 * - done: hồ sơ đã giải quyết;  returned: lần trình LĐ gần nhất bị trả lại;
 * - waiting: không chờ trình gì (đang niêm yết, đang chờ thuế, đã trình…) hoặc bước kế tiếp chưa có hạn;
 * - late / today / urgent (≤ 2 ngày) / normal.
 */
export function getSubmitStatus(record) {
  const daysLeft = daysFromToday(record.ngayTrinhLanhDao);
  const submissions = submissionsOf(record);
  const last = submissions[submissions.length - 1];
  const step = record.buocKeTiep ?? null;
  if (isDone(record)) return { status: 'done', daysLeft, step };
  if (last?.ketQua === 'TRA_LAI') return { status: 'returned', daysLeft, count: submissions.length, step };
  if (daysLeft === null) return { status: 'waiting', daysLeft, step };
  if (daysLeft < 0) return { status: 'late', daysLeft, step };
  if (daysLeft === 0) return { status: 'today', daysLeft, step };
  if (daysLeft <= URGENT_SUBMIT_DAYS) return { status: 'urgent', daysLeft, step };
  return { status: 'normal', daysLeft, step };
}

export const isOverdue = (record) => getDeadlineStatus(record).status === 'overdue';

/** Cùng điều kiện với API /dossiers/upcoming: ngayHetHan trong [hôm nay, hôm nay + 7]. */
export const isDueNextWeek = (record) => {
  const daysLeft = daysFromToday(record.ngayHetHan);
  return daysLeft !== null && daysLeft >= 0 && daysLeft <= UPCOMING_WINDOW_DAYS;
};

export const isUrgentSubmit = (record) =>
  ['late', 'today', 'urgent', 'returned'].includes(getSubmitStatus(record).status);

/** Column-level RBAC phía UI: BE xoá hẳn key nếu user không có quyền xem. */
export const isFieldHidden = (record, field) =>
  !Object.prototype.hasOwnProperty.call(record, field);

export const getRecordId = (record) => String(record._id);

export const getUserName = (user) => user?.hoTen || user?.username || '';

/** Mở phiếu theo dõi để in (tab mới). */
export const openPrintForm = (record) => window.open(`/print/${record._id}`, '_blank');
