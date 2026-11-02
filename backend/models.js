const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { PHAN_LOAI_RULES, PHAN_LOAI } = require('./catalog');
const { addDeadlineDays, ruleFor, todayVN } = require('./settings');

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

/**
 * Tính ngayTrinhLanhDao và ngayHetHan từ ngayVao + phanLoai theo cấu hình đang áp dụng
 * (thời hạn từng loại, ngày làm việc / ngày lịch, ngày lễ — xem settings.js, catalog.js).
 * Hồ sơ có "Ngày hẹn trả" / "Gia hạn" riêng thì hook bên dưới dùng ngày đó thay cho hạn xử lý.
 * Trả về null nếu thiếu dữ liệu hoặc phân loại không hợp lệ.
 */
function calculateDeadlines(ngayVao, phanLoai) {
  const rule = ruleFor(phanLoai);
  const start = ngayVao instanceof Date ? ngayVao : new Date(ngayVao);

  if (!rule || Number.isNaN(start.getTime())) return null;

  return {
    ngayTrinhLanhDao: addDeadlineDays(start, rule.trinh),
    ngayHetHan: addDeadlineDays(start, rule.hetHan),
  };
}

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
dossierSchema.index({ 'nguonNhap.lanNhap': 1 }, { sparse: true });

const DEADLINE_INPUTS = ['ngayVao', 'phanLoai', 'ngayHenTra', 'ngayGiaHan'];

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

dossierSchema.pre('validate', function syncCompletionDate() {
  if (this.isNew || !this.isModified('trangThai') || this.isModified('ngayKetThuc')) return;
  if (this.trangThai === 'HOAN_THANH') {
    if (!this.ngayKetThuc) this.ngayKetThuc = todayVN();
  } else {
    this.ngayKetThuc = null;
  }
});

// Auto-Date: chạy trước validate (tức trước mọi .save()), chỉ tính lại khi một
// trong các trường đầu vào thay đổi để không ghi đè vô ích.
// Hạn xử lý = Gia hạn → Ngày hẹn trả (biên nhận) → Ngày vào + hạn mặc định theo loại.
// Hook đồng bộ (không dùng next) để tương thích cả Mongoose 8 và 9.
dossierSchema.pre('validate', function autoCalculateDates() {
  if (!this.isNew && !DEADLINE_INPUTS.some((field) => this.isModified(field))) {
    return;
  }

  const deadlines = calculateDeadlines(this.ngayVao, this.phanLoai);
  if (deadlines) {
    this.ngayTrinhLanhDao = deadlines.ngayTrinhLanhDao;
    this.ngayHetHan = this.ngayGiaHan || this.ngayHenTra || deadlines.ngayHetHan;
  }
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
  PASSWORD_MIN_LENGTH,
  USERNAME_PATTERN,
  EMAIL_PATTERN,
  calculateDeadlines,
};
