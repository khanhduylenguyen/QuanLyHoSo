/**
 * Danh mục hồ sơ GCN và thời hạn MẶC ĐỊNH (đơn vị: ngày kể từ ngày nhận).
 * Hệ thống chỉ quản lý hồ sơ Giấy chứng nhận (theo sheet "DANH SÁCH GCN 2026"); thời hạn đang áp dụng
 * chỉnh ở Quản trị → Cấu hình hạn (xem settings.js), giá trị ở đây chỉ dùng khi chưa có cấu hình.
 *
 * - hetHan: hạn trả theo biên nhận khi ô "Ngày hẹn trả" trống.
 * - niemYet: loại hồ sơ có niêm yết công khai → hạn trả cộng thêm thời gian niêm yết (xem quyTrinh trong settings).
 */
const PHAN_LOAI_RULES = Object.freeze({
  CAP_GCN: { hetHan: 28, niemYet: true, moTa: 'Cấp giấy chứng nhận' },
  CONG_NHAN_THEM_DAT: { hetHan: 35, niemYet: true, moTa: 'Công nhận thêm đất' },
  DINH_CHINH_GCN: { hetHan: 12, niemYet: false, moTa: 'Đính chính giấy chứng nhận' },
  KHAC: { hetHan: 28, niemYet: true, moTa: 'Khác' },
});

const PHAN_LOAI = Object.freeze(Object.keys(PHAN_LOAI_RULES));

module.exports = { PHAN_LOAI_RULES, PHAN_LOAI };
