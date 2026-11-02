/**
 * Tệp đính kèm hồ sơ (bản scan biên nhận, tờ trình, kết quả…).
 * Nội dung tệp lưu ngay trong MongoDB bằng GridFS (bucket `attachmentFiles`) để chạy được trên host
 * không có ổ đĩa lâu dài (Render free…); thông tin tệp lưu ở collection Attachment.
 * Bản ghi cũ lưu trên đĩa (có `storedName`, không có `fileId`) vẫn tải / xoá được từ UPLOAD_DIR.
 */
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const multer = require('multer');
const { HttpError } = require('./http');

const { Schema } = mongoose;

const UPLOAD_DIR = path.resolve(__dirname, process.env.UPLOAD_DIR || 'uploads');
const BUCKET_NAME = 'attachmentFiles';
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
    // Id tệp trong GridFS.
    fileId: { type: Schema.Types.ObjectId, default: null },
    // Chỉ có ở bản ghi cũ lưu trên đĩa.
    storedName: { type: String, default: undefined },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    loai: { type: String, enum: Object.keys(ATTACHMENT_TYPES), default: 'KHAC' },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    uploadedByName: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const Attachment = mongoose.models.Attachment || mongoose.model('Attachment', attachmentSchema);

const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET_NAME });

/**
 * Bản trước lưu tệp trên đĩa và có index unique `storedName_1`; với GridFS trường này bỏ trống nên
 * index đó sẽ chặn tệp thứ hai. Gọi một lần khi khởi động.
 */
async function migrateAttachmentIndexes() {
  try {
    await Attachment.collection.dropIndex('storedName_1');
    console.log('[attachments] Đã gỡ index cũ storedName_1');
  } catch (error) {
    if (error.codeName !== 'IndexNotFound' && error.codeName !== 'NamespaceNotFound') {
      console.error('[attachments] Không gỡ được index cũ:', error.message);
    }
  }
}

// multer giải mã tên file theo latin1; đổi lại UTF-8 để giữ tên tiếng Việt.
const decodeName = (name) => Buffer.from(name, 'latin1').toString('utf8').normalize('NFC');

const mimeTypeOf = (fileName) => ALLOWED_EXTENSIONS[path.extname(fileName).toLowerCase()];

// Giữ tệp trong bộ nhớ (tối đa 20 MB) rồi ghi vào GridFS.
const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ATTACHMENT_MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!mimeTypeOf(decodeName(file.originalname))) {
      return cb(new HttpError(400, `Chỉ nhận tệp ${Object.keys(ALLOWED_EXTENSIONS).join(', ')}`));
    }
    return cb(null, true);
  },
});

/** Ghi nội dung tệp vào GridFS, trả về fileId. */
function saveFile(buffer, fileName) {
  return new Promise((resolve, reject) => {
    const upload = bucket().openUploadStream(fileName, { metadata: { contentType: mimeTypeOf(fileName) } });
    upload.once('error', reject);
    upload.once('finish', () => resolve(upload.id));
    upload.end(buffer);
  });
}

/** Stream nội dung tệp (GridFS, hoặc đĩa với bản ghi cũ). Lỗi đọc phát qua sự kiện 'error'. */
function openFile(attachment) {
  if (attachment.fileId) return bucket().openDownloadStream(attachment.fileId);
  return fs.createReadStream(path.join(UPLOAD_DIR, path.basename(String(attachment.storedName))));
}

async function removeFile(attachment) {
  try {
    if (attachment.fileId) await bucket().delete(attachment.fileId);
    else if (attachment.storedName) await fs.promises.unlink(path.join(UPLOAD_DIR, path.basename(attachment.storedName)));
  } catch (error) {
    // Tệp đã mất trước đó: bỏ qua; lỗi khác chỉ ghi log để không chặn thao tác chính.
    if (error.code !== 'ENOENT' && !/File not found/i.test(error.message)) {
      console.error('[attachments] Không xoá được tệp:', attachment._id, error.message);
    }
  }
}

/** Xoá toàn bộ tệp đính kèm của các hồ sơ (khi xoá hồ sơ / hoàn tác lần nhập). */
async function removeAttachmentsFor(dossierIds) {
  if (!dossierIds.length) return 0;
  const attachments = await Attachment.find({ dossier: { $in: dossierIds } }).select('fileId storedName').lean();
  if (!attachments.length) return 0;
  await Attachment.deleteMany({ _id: { $in: attachments.map((a) => a._id) } });
  await Promise.all(attachments.map(removeFile));
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
  mimeTypeOf,
  saveFile,
  openFile,
  removeFile,
  removeAttachmentsFor,
  migrateAttachmentIndexes,
};
