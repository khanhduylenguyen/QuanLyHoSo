/**
 * Tệp đính kèm hồ sơ (bản scan biên nhận, tờ trình, kết quả…).
 * Nội dung tệp lưu trên đĩa ở UPLOAD_DIR (tên ngẫu nhiên), thông tin tệp lưu ở collection Attachment.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const multer = require('multer');
const { HttpError } = require('./http');

const { Schema } = mongoose;

const UPLOAD_DIR = path.resolve(__dirname, process.env.UPLOAD_DIR || 'uploads');
const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
const ATTACHMENT_MAX_PER_DOSSIER = 30;

const ATTACHMENT_TYPES = Object.freeze({
  BIEN_NHAN: 'Biên nhận / hồ sơ scan',
  TO_TRINH: 'Tờ trình',
  KET_QUA: 'Kết quả giải quyết',
  KHAC: 'Khác',
});

// Đuôi tệp được phép → MIME trả về khi tải xuống.
const ALLOWED_EXTENSIONS = Object.freeze({
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
});

const attachmentSchema = new Schema(
  {
    dossier: { type: Schema.Types.ObjectId, ref: 'Dossier', required: true, index: true },
    originalName: { type: String, required: true, trim: true },
    storedName: { type: String, required: true, unique: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    loai: { type: String, enum: Object.keys(ATTACHMENT_TYPES), default: 'KHAC' },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    uploadedByName: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const Attachment = mongoose.models.Attachment || mongoose.model('Attachment', attachmentSchema);

// multer giải mã tên file theo latin1; đổi lại UTF-8 để giữ tên tiếng Việt.
const decodeName = (name) => Buffer.from(name, 'latin1').toString('utf8').normalize('NFC');

const attachmentUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdir(UPLOAD_DIR, { recursive: true }, (error) => cb(error, UPLOAD_DIR));
    },
    filename: (req, file, cb) => {
      cb(null, `${crypto.randomUUID()}${path.extname(decodeName(file.originalname)).toLowerCase()}`);
    },
  }),
  limits: { fileSize: ATTACHMENT_MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(decodeName(file.originalname)).toLowerCase();
    if (!ALLOWED_EXTENSIONS[ext]) {
      return cb(new HttpError(400, `Chỉ nhận tệp ${Object.keys(ALLOWED_EXTENSIONS).join(', ')}`));
    }
    return cb(null, true);
  },
});

const filePathOf = (attachment) => path.join(UPLOAD_DIR, path.basename(attachment.storedName));

const removeFile = (storedName) =>
  fs.promises.unlink(path.join(UPLOAD_DIR, path.basename(storedName))).catch((error) => {
    if (error.code !== 'ENOENT') console.error('[attachments] Không xoá được tệp:', storedName, error.message);
  });

/** Xoá toàn bộ tệp đính kèm của các hồ sơ (khi xoá hồ sơ / hoàn tác lần nhập). */
async function removeAttachmentsFor(dossierIds) {
  if (!dossierIds.length) return 0;
  const attachments = await Attachment.find({ dossier: { $in: dossierIds } }).select('storedName').lean();
  if (!attachments.length) return 0;
  await Attachment.deleteMany({ _id: { $in: attachments.map((a) => a._id) } });
  await Promise.all(attachments.map((a) => removeFile(a.storedName)));
  return attachments.length;
}

module.exports = {
  Attachment,
  ATTACHMENT_TYPES,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_PER_DOSSIER,
  ALLOWED_EXTENSIONS,
  attachmentUpload,
  decodeName,
  filePathOf,
  removeFile,
  removeAttachmentsFor,
};
