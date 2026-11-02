/**
 * Danh mục loại thủ tục hành chính và thời hạn MẶC ĐỊNH (đơn vị: ngày kể từ ngày vào).
 * Thời hạn đang áp dụng có thể được Quản trị chỉnh trong trang Quản trị → Cấu hình hạn (xem settings.js);
 * giá trị ở đây chỉ dùng khi chưa có cấu hình.
 *
 * - hetHan: lấy theo trung vị (Ngày hẹn trả − Ngày nhận) trong sổ theo dõi 2026, hoặc theo tiêu đề cột
 *           của sổ (vd. "Hạn (10 ngày)"). Loại đánh dấu (*) chưa có dữ liệu hạn trong sổ nên dùng giá trị tạm.
 * - trinh:  hạn trình lãnh đạo ≈ 70% thời hạn (tối thiểu 1 ngày).
 */
const PHAN_LOAI_RULES = Object.freeze({
  CAP_PHEP_XD: { trinh: 10, hetHan: 14, moTa: 'Cấp phép xây dựng' },
  DIEU_CHINH_GPXD: { trinh: 11, hetHan: 15, moTa: 'Điều chỉnh giấy phép xây dựng' },
  GIA_HAN_GPXD: { trinh: 5, hetHan: 7, moTa: 'Gia hạn giấy phép xây dựng' },
  SUA_CHUA_CAI_TAO: { trinh: 11, hetHan: 15, moTa: 'Sửa chữa, cải tạo' },
  CAP_GCN: { trinh: 20, hetHan: 28, moTa: 'Cấp giấy chứng nhận' },
  CONG_NHAN_THEM_DAT: { trinh: 25, hetHan: 35, moTa: 'Cấp GCN – công nhận thêm đất' },
  DINH_CHINH_GCN: { trinh: 8, hetHan: 12, moTa: 'Đính chính giấy chứng nhận' },
  XAC_NHAN_NHA: { trinh: 7, hetHan: 10, moTa: 'Xác nhận tình trạng nhà' },
  KE_KHAI_THUE: { trinh: 7, hetHan: 10, moTa: 'Kê khai thuế' },
  CAP_DOI_SO_NHA: { trinh: 5, hetHan: 7, moTa: 'Cấp/đổi số nhà' }, // (*)
  THONG_TIN_QUY_HOACH: { trinh: 7, hetHan: 10, moTa: 'Cung cấp thông tin quy hoạch' },
  THONG_BAO_KHOI_CONG: { trinh: 5, hetHan: 7, moTa: 'Thông báo khởi công xây dựng' }, // (*)
  NIEM_YET: { trinh: 11, hetHan: 15, moTa: 'Niêm yết phụ lục 12' },
  THI_CONG_DUONG_BO: { trinh: 6, hetHan: 8, moTa: 'Thi công công trình trên đường bộ' },
  HOA_GIAI_DAT_DAI: { trinh: 21, hetHan: 30, moTa: 'Hòa giải tranh chấp đất đai' },
  RUT_HO_SO: { trinh: 5, hetHan: 7, moTa: 'Rút hồ sơ' }, // (*)
  KHAC: { trinh: 10, hetHan: 15, moTa: 'Thủ tục khác' }, // (*)
});

const PHAN_LOAI = Object.freeze(Object.keys(PHAN_LOAI_RULES));

module.exports = { PHAN_LOAI_RULES, PHAN_LOAI };
