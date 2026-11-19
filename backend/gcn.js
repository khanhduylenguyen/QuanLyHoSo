/**
 * Quy trình hồ sơ Giấy chứng nhận (theo sheet "DANH SÁCH GCN 2026"):
 *   tiếp nhận → trình UB niêm yết → niêm yết 15 ngày → trình dự thảo cấp GCN → thuế → trình UB cấp GCN
 *   (nhánh khác: trình UB rút / điều chỉnh, trả giải trình rồi trình lại).
 *
 * - BUOC: bước hiện tại (cột "Tình trạng" của sheet). trangThai chung của hồ sơ suy ra từ bước.
 * - applyWorkflow(): tính các hạn theo cấu hình (settings.quyTrinh) và "bước kế tiếp" + hạn của nó.
 *   Hạn bước kế tiếp lưu vào ngayTrinhLanhDao để cảnh báo / lọc "cần trình gấp" / nhắc email dùng chung.
 */
const { addDays } = require('date-fns');
const { addDeadlineDays, ruleFor, quyTrinhConfig } = require('./settings');

const BUOC = Object.freeze({
  DANG_THU_LY: 'Đang thụ lý',
  // Trình Lãnh đạo phòng duyệt trước khi trình UB.
  TRINH_LDP: 'Trình LĐP',
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
});
const BUOC_CODES = Object.freeze(Object.keys(BUOC));

// Bước kế tiếp cần trình (hạn của bước này = ngayTrinhLanhDao).
const BUOC_KE_TIEP = Object.freeze({
  NY: 'Trình niêm yết',
  DU_THAO: 'Trình dự thảo GCN',
  PC_THUE: 'Trình phiếu chuyển thuế',
  GCN: 'Trình cấp GCN',
  TRINH_LAI: 'Trình lại UB',
});

const SUBMITTED_STEPS = new Set(['TRINH_LDP', 'TRINH_NY', 'TRINH_DU_THAO', 'TRINH_CAP_GCN', 'TRINH_UB', 'TRINH_RUT']);

/** Trạng thái chung theo bước. */
function statusForStep(buoc, hasOfficer) {
  if (buoc === 'DA_GIAI_QUYET') return 'HOAN_THANH';
  if (SUBMITTED_STEPS.has(buoc)) return 'CHO_LANH_DAO_DUYET';
  if (buoc === 'DANG_THU_LY' && !hasOfficer) return 'MOI_TIEP_NHAN';
  return 'DANG_XU_LY';
}

// Ngày (00:00 UTC) → cộng ngày lịch / ngày làm việc theo cấu hình.
const plusCalendar = (date, days) => (date && Number.isInteger(days) ? addDays(new Date(date), days) : null);
const plusWorking = (date, days) => (date && Number.isInteger(days) ? addDeadlineDays(new Date(date), days) : null);

// Các hạn tự tính: [trường hạn, trường gốc, khoá cấu hình, cách tính].
// Cấu hình null (chưa quy định số ngày) → không tính, giữ ngày nhập tay.
const COMPUTED = [
  ['hanTrinhNY', 'ngayVao', 'trinhNY', (d, q) => plusWorking(d.ngayVao, q.trinhNY)],
  ['ngayKetThucNY', 'ngayBatDauNY', 'niemYet', (d, q) => plusCalendar(d.ngayBatDauNY, q.niemYet)],
  ['hanTrinhDuThao', 'ngayKetThucNY', 'duThao', (d, q) => plusWorking(d.ngayKetThucNY, q.duThao)],
  ['hanTrinhPCThue', 'ngayTrinhDuThao', 'pcThue', (d, q) => plusWorking(d.ngayTrinhDuThao, q.pcThue)],
  ['hanTrinhGCN', 'ngayNhanKQNVTC', 'trinhGCN', (d, q) => plusWorking(d.ngayNhanKQNVTC, q.trinhGCN)],
];
const COMPUTED_FIELDS = COMPUTED.map(([field]) => field);

/** Hạn trả: Gia hạn → (Ngày hẹn trả theo BN hoặc Ngày nhận + hạn của loại) + thời gian niêm yết. */
function dueDate(d, q) {
  if (d.ngayGiaHan) return d.ngayGiaHan;
  const rule = ruleFor(d.phanLoai);
  const base = d.ngayHenTra || (rule && d.ngayVao ? addDeadlineDays(new Date(d.ngayVao), rule.hetHan) : null);
  return rule?.niemYet ? plusCalendar(base, q.henTraCongNY) : base;
}

/** Bước kế tiếp cần trình và hạn của nó ({ buoc: null } = không chờ trình gì / đã xong). */
function nextStep(d) {
  if (d.trangThai === 'HOAN_THANH' || d.buoc === 'DA_GIAI_QUYET' || d.ngayTrinhRut) return { buoc: null, han: null };
  if (d.buoc === 'TRA_GIAI_TRINH' && d.hanTrinhLaiUB) return { buoc: 'TRINH_LAI', han: d.hanTrinhLaiUB };
  const needsNY = ruleFor(d.phanLoai)?.niemYet !== false;
  if (needsNY && !d.ngayTrinhNY && !d.ngayBatDauNY) return { buoc: 'NY', han: d.hanTrinhNY ?? null };
  if (d.ngayTrinhGCN) return { buoc: null, han: null };
  if (d.ngayNhanKQNVTC) return { buoc: 'GCN', han: d.hanTrinhGCN ?? null };
  if (d.ngayTrinhPCThue) return { buoc: null, han: null }; // đang chờ cơ quan thuế
  if (d.ngayTrinhDuThao) return { buoc: 'PC_THUE', han: d.hanTrinhPCThue ?? null };
  if (!needsNY || d.ngayKetThucNY) return { buoc: 'DU_THAO', han: d.hanTrinhDuThao ?? null };
  return { buoc: null, han: null }; // đã trình NY, đang niêm yết
}

/**
 * Tính lại các hạn của hồ sơ (Mongoose document hoặc object thường).
 * @param {object} options
 *   - changed(field): trường có thay đổi trong lần lưu này không (bản ghi mới: mọi trường đều "đổi").
 *   - explicit(field): người dùng tự gửi giá trị trường này (giữ nguyên, không tính đè).
 *   - force: tính lại mọi hạn theo cấu hình (nút "Tính lại hạn").
 */
function applyWorkflow(d, { changed = () => true, explicit = () => false, force = false } = {}) {
  const q = quyTrinhConfig();
  for (const [field, base, configKey, compute] of COMPUTED) {
    if (q[configKey] === null || q[configKey] === undefined) continue;
    if (explicit(field) && !force) continue;
    // Đã có giá trị (nhập tay / từ file) thì chỉ tính lại khi ngày gốc đổi.
    if (d[field] && !force && !changed(base)) continue;
    d[field] = compute(d, q);
  }
  d.ngayHetHan = dueDate(d, q);
  const next = nextStep(d);
  d.buocKeTiep = next.buoc;
  d.ngayTrinhLanhDao = next.han;
  return d;
}

module.exports = {
  BUOC,
  BUOC_CODES,
  BUOC_KE_TIEP,
  COMPUTED_FIELDS,
  statusForStep,
  applyWorkflow,
  nextStep,
};
