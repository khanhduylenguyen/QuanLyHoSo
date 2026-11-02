/**
 * Nhật ký xử lý hồ sơ: ai làm gì, lúc nào, đổi trường nào từ giá trị nào sang giá trị nào.
 * Ghi ở tầng API (không phải middleware Mongoose) để biết được người thao tác.
 */
const mongoose = require('mongoose');
const { User } = require('./models');

const { Schema } = mongoose;

// TRANSFER = chuyển cán bộ thụ lý, EXTEND = gia hạn (đều kèm lý do trong note); ATTACH/DETACH = tệp đính kèm.
const LOG_ACTIONS = Object.freeze(['CREATE', 'UPDATE', 'DELETE', 'IMPORT', 'BULK_UPDATE', 'TRANSFER', 'EXTEND', 'ATTACH', 'DETACH']);

// Trường được theo dõi khi so sánh trước/sau (gồm cả trường do hệ thống tự tính).
const TRACKED_FIELDS = Object.freeze([
  'maHoSo', 'soBienNhan', 'tenHoSo', 'diaChi', 'donViGui', 'phanLoai',
  'ngayVao', 'ngayHenTra', 'ngayGiaHan', 'ngayTrinhLanhDao', 'ngayHetHan', 'ngayTrinhThucTe', 'ngayKetThuc',
  'canBoThuLy', 'trangThai', 'ghiChuCanBo', 'ghiChu', 'chiDaoLanhDao', 'mucDoUuTien', 'lanTrinh',
]);
const DATE_FIELDS = new Set(['ngayVao', 'ngayHenTra', 'ngayGiaHan', 'ngayTrinhLanhDao', 'ngayHetHan', 'ngayTrinhThucTe', 'ngayKetThuc']);

const dossierLogSchema = new Schema(
  {
    dossier: { type: Schema.Types.ObjectId, ref: 'Dossier', required: true, index: true },
    maHoSo: { type: String, default: '' },
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    userName: { type: String, default: '' },
    action: { type: String, enum: LOG_ACTIONS, required: true },
    changes: {
      type: [new Schema({ field: String, from: Schema.Types.Mixed, to: Schema.Types.Mixed }, { _id: false })],
      default: [],
    },
    note: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
dossierLogSchema.index({ dossier: 1, createdAt: -1 });

const DossierLog = mongoose.models.DossierLog || mongoose.model('DossierLog', dossierLogSchema);

const KET_QUA_TRINH_LABELS = { CHO_Y_KIEN: 'Chờ ý kiến', TRA_LAI: 'Trả lại', DA_DUYET: 'Đã duyệt' };
const dmy = (value) => new Date(value).toISOString().slice(0, 10).split('-').reverse().join('/');

const idOf = (value) => (value && typeof value === 'object' && value._id ? String(value._id) : value ? String(value) : null);

/** Giá trị để so sánh / hiển thị: ngày → yyyy-mm-dd, cán bộ → id (đổi sang tên ở bước sau). */
function normalize(field, value) {
  if (value === undefined || value === null || value === '') return null;
  if (DATE_FIELDS.has(field)) return new Date(value).toISOString().slice(0, 10);
  if (field === 'canBoThuLy') return idOf(value);
  // Các lần trình → một dòng dễ đọc: "05/03/2026 Trả lại; 12/03/2026 Đã duyệt".
  if (field === 'lanTrinh') {
    const text = value.map((l) => [dmy(l.ngay), KET_QUA_TRINH_LABELS[l.ketQua], l.ghiChu].filter(Boolean).join(' ')).join('; ');
    return text || null;
  }
  return value;
}

/** Danh sách thay đổi giữa hai trạng thái hồ sơ (plain object). Cán bộ được đổi id → họ tên. */
async function diffDossier(before, after) {
  const changes = TRACKED_FIELDS.map((field) => ({
    field,
    from: normalize(field, before?.[field]),
    to: normalize(field, after?.[field]),
  })).filter((change) => String(change.from) !== String(change.to));

  const officerIds = changes.filter((c) => c.field === 'canBoThuLy').flatMap((c) => [c.from, c.to]).filter(Boolean);
  if (officerIds.length) {
    const users = await User.find({ _id: { $in: officerIds } }).select('hoTen username').lean();
    const name = (id) => {
      const user = users.find((u) => String(u._id) === id);
      return user ? user.hoTen || user.username : null;
    };
    for (const change of changes) {
      if (change.field !== 'canBoThuLy') continue;
      change.from = change.from ? name(change.from) : null;
      change.to = change.to ? name(change.to) : null;
    }
  }
  return changes;
}

const actorOf = (auth) => ({ user: auth?.userId ?? null, userName: auth?.user?.hoTen || auth?.user?.username || 'Hệ thống' });

/** Ghi một dòng nhật ký (bỏ qua UPDATE không có thay đổi). Lỗi ghi log không làm hỏng thao tác chính. */
async function logDossier(auth, dossier, action, { changes = [], note = '' } = {}) {
  if (action === 'UPDATE' && changes.length === 0) return;
  try {
    await DossierLog.create({ dossier: dossier._id, maHoSo: dossier.maHoSo, action, changes, note, ...actorOf(auth) });
  } catch (error) {
    console.error('[audit] Không ghi được nhật ký:', error.message);
  }
}

/** Ghi nhiều dòng một lúc (nhập Excel, thao tác hàng loạt). */
async function logMany(auth, entries) {
  if (entries.length === 0) return;
  const actor = actorOf(auth);
  try {
    await DossierLog.insertMany(entries.map((entry) => ({ ...entry, ...actor })), { ordered: false });
  } catch (error) {
    console.error('[audit] Không ghi được nhật ký hàng loạt:', error.message);
  }
}

/** Ẩn các thay đổi ở cột nhạy cảm với người không được xem. */
const redactLog = (log, hiddenFields) => ({
  ...log,
  changes: (log.changes ?? []).filter((change) => !hiddenFields.includes(change.field)),
});

module.exports = { DossierLog, diffDossier, logDossier, logMany, redactLog };
