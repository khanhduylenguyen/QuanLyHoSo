const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { PHAN_LOAI_RULES, PHAN_LOAI } = require('./catalog');
const { todayVN } = require('./settings');
const { BUOC_CODES, BUOC_KE_TIEP, statusForStep, applyWorkflow } = require('./gcn');

const { Schema } = mongoose;

const ROLES = Object.freeze(['ADMIN', 'CAN_BO', 'VAN_THU']);

const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TRANG_THAI = Object.freeze([
  'MOI_TIEP_NHAN',
  'DANG_XU_LY',
  'CHO_LANH_DAO_DUYET',
  'HOAN_THANH',
]);

const MUC_DO_UU_TIEN = Object.freeze(['THAP', 'TRUNG_BINH', 'CAO', 'KHAN_CAP']);

// Kết quả một lần trình Lãnh đạo. '' = chưa ghi (dữ liệu lấy từ sổ cũ không có kết quả).
const KET_QUA_TRINH = Object.freeze(['CHO_Y_KIEN', 'TRA_LAI', 'DA_DUYET', '']);
const LAN_TRINH_MAX = 20;

// Ngày từng bước quy trình GCN (cột của sheet "DANH SÁCH GCN 2026"). han* có thể tự tính theo cấu hình (gcn.js).
const QUY_TRINH_DATE_FIELDS = Object.freeze([
  'ngayChuyen',
  'hanTrinhNY', 'ngayTrinhNY', 'ngayBatDauNY', 'ngayKetThucNY',
  'hanTrinhDuThao', 'ngayTrinhDuThao',
  'hanTrinhPCThue', 'ngayTrinhPCThue', 'ngayDiThue',
  'ngayNhanKQNVTC', 'hanTrinhGCN', 'ngayTrinhGCN',
  'ngayTrinhRut', 'ngayVBRut',
  'ngayTraTo', 'hanTrinhLaiUB',
]);

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: [true, 'username là bắt buộc'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [USERNAME_PATTERN, 'username chỉ gồm chữ thường, số, dấu . _ - (3–32 ký tự)'],
    },
    hoTen: { type: String, trim: true, default: '' },
    // Không bắt buộc ở schema (tài khoản seed không có email); trang quản trị bắt buộc khi tạo mới.
    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
      match: [EMAIL_PATTERN, 'Email không hợp lệ'],
    },
    role: {
      type: String,
      enum: { values: ROLES, message: 'role không hợp lệ: {VALUE}' },
      required: [true, 'role là bắt buộc'],
    },
    // Tài khoản bị khoá thì không đăng nhập được và token cũ cũng mất hiệu lực.
    isActive: { type: Boolean, default: true },
    // Không bao giờ trả ra ngoài trừ khi .select('+passwordHash').
    passwordHash: { type: String, select: false },
    // Token phát hành trước mốc này bị từ chối (đổi mật khẩu = đăng xuất mọi nơi).
    passwordChangedAt: { type: Date },
    // Mật khẩu do quản trị đặt (tạo mới / đặt lại) → bắt buộc người dùng tự đổi ở lần đăng nhập kế tiếp.
    mustChangePassword: { type: Boolean, default: false },
    // Quên mật khẩu: chỉ lưu hash của mã đặt lại, hết hạn sau RESET_TOKEN_TTL_MS.
    resetTokenHash: { type: String, select: false },
    resetTokenExpires: { type: Date, select: false },
  },
  { timestamps: true }
);

const PASSWORD_SALT_ROUNDS = 10;
const PASSWORD_MIN_LENGTH = 6;

userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, PASSWORD_SALT_ROUNDS);
  this.passwordChangedAt = new Date();
};

// Hash giả để so sánh khi không tìm thấy user, giúp thời gian phản hồi
// như nhau và không đoán được username nào tồn tại.
const DUMMY_HASH = bcrypt.hashSync('dummy-password', PASSWORD_SALT_ROUNDS);

/** Trả về user (không kèm passwordHash) nếu đúng tài khoản, ngược lại null. */
userSchema.statics.findByCredentials = async function findByCredentials(username, plain) {
  const user = await this.findOne({ username: String(username).trim().toLowerCase() }).select('+passwordHash');
  const ok = await bcrypt.compare(plain, user?.passwordHash || DUMMY_HASH);
  if (!user || !user.passwordHash || !ok) return null;

  const plainUser = user.toObject();
  delete plainUser.passwordHash;
  return plainUser;
};

const dossierSchema = new Schema(
  {
    maHoSo: {
      type: String,
      required: [true, 'maHoSo là bắt buộc'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    // Số biên nhận một cửa (có thể trống / trùng trong sổ cũ nên không ràng buộc unique).
    soBienNhan: { type: String, trim: true, default: '' },
    tenHoSo: {
      type: String,
      required: [true, 'tenHoSo là bắt buộc'],
      trim: true,
    },
    diaChi: { type: String, trim: true, default: '' },
    donViGui: { type: String, trim: true, default: '' },
    phanLoai: {
      type: String,
      required: [true, 'phanLoai là bắt buộc'],
      enum: { values: PHAN_LOAI, message: 'phanLoai không hợp lệ: {VALUE}' },
      uppercase: true,
      trim: true,
    },
    // Tên thủ tục nguyên văn khi nhập từ sổ Excel (vd. "CẤP GIẤY CHỨNG NHẬN (Ghi nợ tiền sử dụng đất)").
    loaiHoSoGoc: { type: String, trim: true, default: '' },
    ngayVao: {
      type: Date,
      required: [true, 'ngayVao là bắt buộc'],
    },
    // Hạn ghi trên biên nhận và ngày gia hạn (nếu có) — ưu tiên hơn hạn mặc định theo loại.
    ngayHenTra: { type: Date, default: null },
    ngayGiaHan: { type: Date, default: null },
    ngayTrinhLanhDao: { type: Date },
    ngayHetHan: { type: Date },
    // Mốc thực tế. ngayTrinhThucTe = ngày của lần trình gần nhất (tự đồng bộ từ lanTrinh).
    ngayTrinhThucTe: { type: Date, default: null },
    // Các lần trình Lãnh đạo (một hồ sơ có thể bị trả lại và trình nhiều lần), sắp theo ngày tăng dần.
    lanTrinh: {
      type: [
        new Schema(
          {
            ngay: { type: Date, required: [true, 'Ngày trình là bắt buộc'] },
            ketQua: { type: String, enum: { values: KET_QUA_TRINH, message: 'Kết quả trình không hợp lệ: {VALUE}' }, default: 'CHO_Y_KIEN' },
            ghiChu: { type: String, trim: true, default: '', maxlength: [500, 'Ghi chú lần trình tối đa 500 ký tự'] },
          },
          { _id: false }
        ),
      ],
      default: [],
      validate: { validator: (list) => list.length <= LAN_TRINH_MAX, message: `Tối đa ${LAN_TRINH_MAX} lần trình` },
    },
    ngayKetThuc: { type: Date, default: null },

    // --- Quy trình GCN ---
    ...Object.fromEntries(QUY_TRINH_DATE_FIELDS.map((field) => [field, { type: Date, default: null }])),
    // Bước hiện tại (cột "Tình trạng"); trangThai chung tự suy ra từ bước.
    buoc: { type: String, enum: { values: BUOC_CODES, message: 'Bước không hợp lệ: {VALUE}' }, default: 'DANG_THU_LY' },
    // Bước kế tiếp cần trình (tự tính) — hạn của nó lưu ở ngayTrinhLanhDao.
    buocKeTiep: { type: String, enum: [...Object.keys(BUOC_KE_TIEP), null], default: null },
    // Tổ chuyên môn (TN-MT, XD-CT…), số GCN đã cấp, nội dung giải trình khi bị trả.
    to: { type: String, trim: true, default: '' },
    soGCN: { type: String, trim: true, default: '' },
    giaiTrinh: { type: String, trim: true, default: '' },
    // Ghi chú ưu tiên để Lãnh đạo xem (cột "GHI CHÚ (ƯU TIÊN)").
    ghiChuUuTien: { type: String, trim: true, default: '' },
    congNhanThemDat: { type: Boolean, default: false },
    capGCN: { type: Boolean, default: false },

    // Không bắt buộc: hồ sơ mới tiếp nhận có thể chưa phân công.
    canBoThuLy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Báo cáo tiến độ của cán bộ thụ lý (cột "Diễn giải" trong sổ).
    ghiChuCanBo: { type: String, trim: true, default: '' },
    // Ghi chú chung (cột "GHI CHÚ" trong sổ).
    ghiChu: { type: String, trim: true, default: '' },
    // Đánh giá đúng/trễ hạn ghi trong sổ (cột "Trễ hạn (ĐÁNH X)") cho hồ sơ nhập từ Excel:
    // true = sổ đánh trễ hạn, false = sổ không đánh. Báo cáo ưu tiên giá trị này hơn so sánh ngày,
    // vì "Ngày kết thúc" trong sổ có thể là mốc muộn hơn ngày giải quyết. Tự xoá khi trạng thái / các
    // ngày hạn, kết thúc được sửa trong hệ thống (khi đó so sánh ngày mới là đúng).
    treHanTheoSo: { type: Boolean, default: undefined },
    // Truy vết bản ghi nhập từ Excel: tệp, lần nhập (để hoàn tác), sheet + dòng.
    nguonNhap: {
      type: new Schema({ tep: String, lanNhap: String, sheet: String, dong: Number }, { _id: false }),
      default: undefined,
    },
    // Cột nhạy cảm: chỉ ADMIN / VAN_THU được xem và ghi.
    chiDaoLanhDao: { type: String, default: null, trim: true },
    mucDoUuTien: {
      type: String,
      enum: { values: MUC_DO_UU_TIEN, message: 'mucDoUuTien không hợp lệ: {VALUE}' },
      default: 'TRUNG_BINH',
    },
    trangThai: {
      type: String,
      enum: { values: TRANG_THAI, message: 'trangThai không hợp lệ: {VALUE}' },
      default: 'MOI_TIEP_NHAN',
    },
  },
  { timestamps: true }
);

dossierSchema.index({ canBoThuLy: 1, ngayHetHan: 1 });
dossierSchema.index({ ngayHetHan: 1 });

dossierSchema.index({ soBienNhan: 1 });
dossierSchema.index({ buoc: 1 });
dossierSchema.index({ 'nguonNhap.lanNhap': 1 }, { sparse: true });

// Ngày kết thúc đi theo trạng thái khi cập nhật: chuyển sang Hoàn thành mà chưa có ngày → hôm nay;
// mở lại hồ sơ → xoá ngày kết thúc (trừ khi người dùng tự nhập). Bỏ qua bản ghi mới để không
// ghi đè dữ liệu nhập từ sổ (hồ sơ đã xong nhưng sổ không ghi ngày).
// Đánh giá theo sổ chỉ còn đúng khi chưa ai sửa trạng thái / hạn / ngày kết thúc trong hệ thống.
const REGISTER_FLAG_INPUTS = ['trangThai', 'ngayKetThuc', 'ngayHetHan', 'ngayHenTra', 'ngayGiaHan', 'ngayVao', 'phanLoai'];
dossierSchema.pre('validate', function clearRegisterLateFlag() {
  if (this.isNew || this.treHanTheoSo === undefined || this.isModified('treHanTheoSo')) return;
  if (REGISTER_FLAG_INPUTS.some((field) => this.isModified(field))) this.treHanTheoSo = undefined;
});

/**
 * Các lần trình → ngày trình thực tế + trạng thái (khi người dùng không tự đổi trạng thái):
 * lần gần nhất bị trả lại → "Đang thụ lý" (cần trình lại); đang chờ ý kiến / đã duyệt → "Đã trình LĐ".
 * Hồ sơ đã hoàn thành giữ nguyên trạng thái.
 */
dossierSchema.pre('validate', function syncSubmissions() {
  if (!this.isModified('lanTrinh')) return;
  this.lanTrinh.sort((a, b) => new Date(a.ngay) - new Date(b.ngay));
  const last = this.lanTrinh[this.lanTrinh.length - 1];
  this.ngayTrinhThucTe = last ? last.ngay : null;
  if (this.isNew || this.isModified('trangThai') || this.trangThai === 'HOAN_THANH') return;
  if (!last) {
    if (this.trangThai === 'CHO_LANH_DAO_DUYET') this.trangThai = 'DANG_XU_LY';
  } else {
    this.trangThai = last.ketQua === 'TRA_LAI' ? 'DANG_XU_LY' : 'CHO_LANH_DAO_DUYET';
  }
});

/**
 * Bước ↔ trạng thái chung: đổi bước → trạng thái theo bước; đổi trạng thái (nút Hoàn thành, mở lại,
 * thao tác hàng loạt) → bước "Đã giải quyết" / quay về "Đang thụ lý".
 */
dossierSchema.pre('validate', function syncStep() {
  const hasOfficer = Boolean(this.canBoThuLy);
  if (this.isNew) {
    if (this.trangThai === 'HOAN_THANH' && this.buoc === 'DANG_THU_LY') this.buoc = 'DA_GIAI_QUYET';
    else this.trangThai = statusForStep(this.buoc, hasOfficer);
  } else if (this.isModified('buoc')) {
    this.trangThai = statusForStep(this.buoc, hasOfficer);
  } else if (this.isModified('trangThai')) {
    if (this.trangThai === 'HOAN_THANH') this.buoc = 'DA_GIAI_QUYET';
    else if (this.buoc === 'DA_GIAI_QUYET') this.buoc = 'DANG_THU_LY';
  } else if (this.isModified('canBoThuLy') && this.buoc === 'DANG_THU_LY') {
    this.trangThai = statusForStep(this.buoc, hasOfficer);
  }
});

dossierSchema.pre('validate', function syncCompletionDate() {
  if (this.isNew || !this.isModified('trangThai') || this.isModified('ngayKetThuc')) return;
  if (this.trangThai === 'HOAN_THANH') {
    if (!this.ngayKetThuc) this.ngayKetThuc = todayVN();
  } else {
    this.ngayKetThuc = null;
  }
});

// Hạn tự động (gcn.js): hạn các bước theo cấu hình, hạn trả, bước kế tiếp + hạn (ngayTrinhLanhDao).
// Ngày người dùng tự nhập / có trong file được giữ nguyên. Hook đồng bộ (không dùng next).
dossierSchema.pre('validate', function autoCalculateDates() {
  applyWorkflow(this, {
    changed: (field) => this.isNew || this.isModified(field),
    explicit: (field) => (this.isNew ? this[field] !== null && this[field] !== undefined : this.isModified(field)),
  });
});

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Dossier = mongoose.models.Dossier || mongoose.model('Dossier', dossierSchema);

module.exports = {
  User,
  Dossier,
  ROLES,
  TRANG_THAI,
  PHAN_LOAI,
  PHAN_LOAI_RULES,
  MUC_DO_UU_TIEN,
  KET_QUA_TRINH,
  LAN_TRINH_MAX,
  QUY_TRINH_DATE_FIELDS,
  PASSWORD_MIN_LENGTH,
  USERNAME_PATTERN,
  EMAIL_PATTERN,
};
