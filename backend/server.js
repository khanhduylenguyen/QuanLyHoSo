require('dotenv').config({ quiet: true });

const express = require('express');
const cors = require('cors');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { addDays, startOfDay, endOfDay } = require('date-fns');

const {
  User,
  Dossier,
  ROLES,
  TRANG_THAI,
  calculateDeadlines,
  MUC_DO_UU_TIEN,
  PASSWORD_MIN_LENGTH,
  USERNAME_PATTERN,
  EMAIL_PATTERN,
} = require('./models');
const { isMailConfigured, sendWelcomeEmail, sendPasswordResetEmail, APP_URL } = require('./mailer');
const multer = require('multer');
const { readWorkbook, analyzeImport, previewCodes, commitImport, buildTemplate } = require('./importer');

const PORT = Number(process.env.PORT) || 8081;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/quanlyhoso';
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:8080,http://127.0.0.1:8080')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Thiếu JWT_SECRET thì sinh khoá ngẫu nhiên: vẫn chạy được khi dev,
// nhưng mọi token sẽ mất hiệu lực mỗi lần restart server.
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(48).toString('hex');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
if (!process.env.JWT_SECRET) {
  console.warn('[auth] Chưa đặt JWT_SECRET trong .env — đang dùng khoá tạm, token sẽ mất khi restart.');
}

const UPCOMING_WINDOW_DAYS = 7;
const SENSITIVE_FIELDS = Object.freeze(['chiDaoLanhDao', 'mucDoUuTien']);
const ASSIGNEE_FIELDS = 'username hoTen role';

// Trường mà mỗi role được phép ghi khi tạo/sửa hồ sơ.
const OFFICE_WRITABLE_FIELDS = [
  'maHoSo', 'soBienNhan', 'tenHoSo', 'diaChi', 'donViGui', 'phanLoai',
  'ngayVao', 'ngayHenTra', 'ngayGiaHan', 'ngayTrinhThucTe', 'ngayKetThuc',
  'canBoThuLy', 'ghiChuCanBo', 'ghiChu', 'chiDaoLanhDao', 'mucDoUuTien', 'trangThai',
];
const WRITABLE_FIELDS = Object.freeze({
  ADMIN: OFFICE_WRITABLE_FIELDS,
  VAN_THU: OFFICE_WRITABLE_FIELDS,
  CAN_BO: ['trangThai', 'ghiChuCanBo'],
});

// Ngày bắt buộc / ngày tuỳ chọn (gửi '' hoặc null để xoá).
const REQUIRED_DATE_FIELDS = ['ngayVao'];
const OPTIONAL_DATE_FIELDS = ['ngayHenTra', 'ngayGiaHan', 'ngayTrinhThucTe', 'ngayKetThuc'];

// Role được phép thực hiện từng thao tác. Dùng cho cả authorize() lẫn
// ma trận phân quyền trả về trang quản trị, nên hai nơi luôn khớp nhau.
const PERMISSIONS = Object.freeze({
  DOSSIER_CREATE: ['ADMIN', 'VAN_THU'],
  DOSSIER_DELETE: ['ADMIN'],
  DOSSIER_ASSIGN: ['ADMIN', 'VAN_THU'],
  DOSSIER_IMPORT: ['ADMIN', 'VAN_THU'],
  SYSTEM_ADMIN: ['ADMIN'],
});
// Role chỉ thấy hồ sơ mình thụ lý và không thấy cột nhạy cảm.
const ROW_SCOPED_ROLES = Object.freeze(['CAN_BO']);

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const { HttpError, asyncHandler } = require('./http');
const { loginByUser, loginByIp, passwordResetByIp } = require('./rateLimit');
const { DossierLog, diffDossier, logDossier, logMany, redactLog } = require('./audit');
const { loadSettings, getSettings, saveSettings, effectiveRules, validateDeadlineSettings, todayVN } = require('./settings');
const { buildSummary, buildMonthly, buildOldestOverdue, buildDossierWorkbook, buildSummaryWorkbook } = require('./reports');
const { runReminders, runDueReminders, startReminderScheduler, validateReminderSettings } = require('./reminders');
const {
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
} = require('./attachments');

const pickFields = (source, allowed) =>
  allowed.reduce((acc, key) => {
    if (Object.prototype.hasOwnProperty.call(source, key)) acc[key] = source[key];
    return acc;
  }, {});

const normalizeEmpty = (value) => (typeof value === 'string' && value.trim() === '' ? null : value);

/* ------------------------------------------------------------------ */
/* RBAC middleware                                                    */
/* ------------------------------------------------------------------ */

const signToken = (user) =>
  jwt.sign({ role: user.role }, JWT_SECRET, { subject: String(user._id), expiresIn: JWT_EXPIRES_IN });

const toPublicUser = (user) => ({
  _id: user._id,
  username: user.username,
  hoTen: user.hoTen,
  role: user.role,
  mustChangePassword: Boolean(user.mustChangePassword),
});

/**
 * Xác thực bằng JWT trong header `Authorization: Bearer <token>`.
 * Role luôn lấy lại từ DB (không tin role trong token) để đổi quyền có hiệu lực ngay.
 */
const authenticate = asyncHandler(async (req, res, next) => {
  const [scheme, token] = String(req.header('authorization') || '').split(' ');
  if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Chưa đăng nhập');

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (error) {
    const expired = error instanceof jwt.TokenExpiredError;
    throw new HttpError(401, expired ? 'Phiên đăng nhập đã hết hạn' : 'Token không hợp lệ');
  }

  if (!mongoose.isValidObjectId(payload.sub)) throw new HttpError(401, 'Token không hợp lệ');
  const user = await User.findById(payload.sub).select('username hoTen role isActive passwordChangedAt mustChangePassword').lean();
  if (!user || !ROLES.includes(user.role)) throw new HttpError(401, 'Tài khoản không còn tồn tại');
  if (user.isActive === false) throw new HttpError(401, 'Tài khoản đã bị khoá');
  // iat tính bằng giây: token cấp trước lần đổi mật khẩu gần nhất thì hết hiệu lực.
  if (user.passwordChangedAt && Math.floor(user.passwordChangedAt.getTime() / 1000) > payload.iat) {
    throw new HttpError(401, 'Mật khẩu đã được thay đổi, vui lòng đăng nhập lại');
  }

  req.auth = { role: user.role, userId: String(user._id), user };
  return next();
});

const authorize = (...allowedRoles) => (req, res, next) => {
  if (!allowedRoles.includes(req.auth.role)) {
    return next(new HttpError(403, 'Bạn không có quyền thực hiện thao tác này'));
  }
  return next();
};

/** Row-level security: CAN_BO chỉ thấy hồ sơ mình thụ lý. */
const buildRowScope = ({ role, userId }) =>
  ROW_SCOPED_ROLES.includes(role) ? { canBoThuLy: new mongoose.Types.ObjectId(userId) } : {};

/** Column-level security: loại cột nhạy cảm khỏi plain object trước khi trả về. */
const applyColumnSecurity = (record, { role }) => {
  const plain = typeof record.toObject === 'function' ? record.toObject() : { ...record };

  if (ROW_SCOPED_ROLES.includes(role)) {
    SENSITIVE_FIELDS.forEach((field) => {
      delete plain[field];
    });
  } else {
    // Luôn trả key (kể cả null) để FE phân biệt "không có dữ liệu" với "bị ẩn".
    SENSITIVE_FIELDS.forEach((field) => {
      plain[field] = plain[field] ?? null;
    });
  }
  return plain;
};

const sendDossiers = (res, records, auth, meta = {}) =>
  res.json({
    data: records.map((record) => applyColumnSecurity(record, auth)),
    meta: { total: records.length, role: auth.role, ...meta },
  });

/* ------------------------------------------------------------------ */
/* Validation                                                         */
/* ------------------------------------------------------------------ */

/** null = chưa phân công (hợp lệ); còn lại phải là cán bộ đang hoạt động. */
const assertAssigneeIsCanBo = async (canBoThuLy) => {
  if (canBoThuLy === null || canBoThuLy === undefined) return;
  if (!mongoose.isValidObjectId(canBoThuLy)) {
    throw new HttpError(400, 'canBoThuLy không hợp lệ');
  }
  const assignee = await User.findById(canBoThuLy).select('role isActive').lean();
  if (!assignee || assignee.role !== 'CAN_BO') {
    throw new HttpError(400, 'canBoThuLy phải là một tài khoản có role CAN_BO');
  }
  if (assignee.isActive === false) {
    throw new HttpError(400, 'Không thể phân công cho tài khoản đã bị khoá');
  }
};

const buildPayload = (body, role) => {
  const payload = pickFields(body || {}, WRITABLE_FIELDS[role]);

  if ('chiDaoLanhDao' in payload) payload.chiDaoLanhDao = normalizeEmpty(payload.chiDaoLanhDao);
  if ('canBoThuLy' in payload) payload.canBoThuLy = normalizeEmpty(payload.canBoThuLy) ?? null;

  for (const field of [...REQUIRED_DATE_FIELDS, ...OPTIONAL_DATE_FIELDS]) {
    if (!(field in payload)) continue;
    const raw = normalizeEmpty(payload[field]);
    if (raw === null || raw === undefined) {
      if (REQUIRED_DATE_FIELDS.includes(field)) throw new HttpError(400, `${field} là bắt buộc`);
      payload[field] = null;
      continue;
    }
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) throw new HttpError(400, `${field} không hợp lệ`);
    payload[field] = date;
  }
  if ('trangThai' in payload && !TRANG_THAI.includes(payload.trangThai)) {
    throw new HttpError(400, `trangThai phải thuộc: ${TRANG_THAI.join(', ')}`);
  }
  if ('mucDoUuTien' in payload && !MUC_DO_UU_TIEN.includes(payload.mucDoUuTien)) {
    throw new HttpError(400, `mucDoUuTien phải thuộc: ${MUC_DO_UU_TIEN.join(', ')}`);
  }
  return payload;
};

const validateIdParam = (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return next(new HttpError(400, 'ID không hợp lệ'));
  }
  return next();
};

/* ------------------------------------------------------------------ */
/* App & routes                                                       */
/* ------------------------------------------------------------------ */

const app = express();
// Chạy sau reverse proxy (Render, Nginx…): đặt TRUST_PROXY (vd. 1) để req.ip là IP người dùng thay vì IP proxy.
if (process.env.TRUST_PROXY) {
  const hops = Number(process.env.TRUST_PROXY);
  app.set('trust proxy', Number.isInteger(hops) ? hops : process.env.TRUST_PROXY === 'true');
}

app.use(
  cors({
    origin: CORS_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: '1mb' }));

// Dịch vụ cron bên ngoài gọi định kỳ (vd. 10 phút / lần) với header "Authorization: Bearer <CRON_SECRET>":
// vừa giữ server không "ngủ" (Render free), vừa gửi nhắc hạn đúng giờ cấu hình (tối đa 1 lần / ngày).
const CRON_SECRET = process.env.CRON_SECRET || '';
const isCronAuthorized = (req) => {
  const given = String(req.header('authorization') || '').replace(/^Bearer\s+/i, '');
  return Boolean(CRON_SECRET) && given.length === CRON_SECRET.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(CRON_SECRET));
};
app.all(
  '/api/cron/reminders',
  asyncHandler(async (req, res) => {
    if (!CRON_SECRET) throw new HttpError(404, 'Chưa bật CRON_SECRET');
    if (!isCronAuthorized(req)) throw new HttpError(401, 'Sai khoá cron');
    res.json({ data: await runDueReminders() });
  })
);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

app.post(
  '/api/auth/login',
  asyncHandler(async (req, res) => {
    const username = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');
    if (!username || !password) throw new HttpError(400, 'Vui lòng nhập tên đăng nhập và mật khẩu');

    // Chống dò mật khẩu: khoá tạm theo tài khoản và theo IP khi sai quá nhiều lần.
    const userKey = username.toLowerCase();
    const LOCKED = 'Bạn đã nhập sai quá nhiều lần.';
    loginByUser.assertAllowed(userKey, LOCKED);
    loginByIp.assertAllowed(req.ip, LOCKED);

    const user = await User.findByCredentials(username, password);
    if (!user) {
      const left = loginByUser.hit(userKey);
      loginByIp.hit(req.ip);
      // Cùng một thông báo cho "sai user" và "sai mật khẩu" để không lộ user nào tồn tại.
      throw new HttpError(
        401,
        left > 0 && left <= 2
          ? `Tên đăng nhập hoặc mật khẩu không đúng (còn ${left} lần thử trước khi bị khoá 15 phút)`
          : left === 0
            ? `${LOCKED} Tài khoản tạm khoá 15 phút.`
            : 'Tên đăng nhập hoặc mật khẩu không đúng'
      );
    }
    loginByUser.reset(userKey);
    // Chỉ báo "bị khoá" khi đã nhập đúng mật khẩu.
    if (user.isActive === false) {
      throw new HttpError(403, 'Tài khoản đã bị khoá, vui lòng liên hệ Quản trị hệ thống');
    }

    res.json({ data: { token: signToken(user), user: toPublicUser(user) } });
  })
);

/* ---------- Quên / đặt lại mật khẩu ---------- */

const RESET_TOKEN_TTL_MINUTES = 30;
const hashResetToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

// Luôn trả cùng một câu (kể cả khi không có tài khoản / không có email) để không lộ tài khoản nào tồn tại.
app.post(
  '/api/auth/forgot',
  asyncHandler(async (req, res) => {
    passwordResetByIp.assertAllowed(req.ip, 'Bạn đã gửi quá nhiều yêu cầu.');
    const identifier = String(req.body?.identifier ?? '').trim().toLowerCase();
    if (!identifier) throw new HttpError(400, 'Vui lòng nhập tên đăng nhập hoặc email');
    passwordResetByIp.hit(req.ip);

    const user = await User.findOne({ $or: [{ username: identifier }, { email: identifier }] });
    if (user && user.isActive !== false && user.email && isMailConfigured()) {
      const token = crypto.randomBytes(32).toString('hex');
      user.resetTokenHash = hashResetToken(token);
      user.resetTokenExpires = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
      await user.save();
      try {
        await sendPasswordResetEmail({
          to: user.email,
          name: user.hoTen || user.username,
          link: `${APP_URL}/reset-password?token=${token}`,
          minutes: RESET_TOKEN_TTL_MINUTES,
        });
      } catch (error) {
        console.error('[mail] Gửi email đặt lại mật khẩu thất bại:', error.code || '', error.message);
      }
    }
    res.json({
      data: {
        message: 'Nếu tài khoản tồn tại và có email, hướng dẫn đặt lại mật khẩu đã được gửi. Vui lòng kiểm tra hộp thư (cả mục Spam).',
      },
    });
  })
);

app.post(
  '/api/auth/reset-password',
  asyncHandler(async (req, res) => {
    passwordResetByIp.assertAllowed(req.ip, 'Bạn đã thử quá nhiều lần.');
    const token = String(req.body?.token ?? '');
    const password = parsePassword(req.body?.password);
    const user = token
      ? await User.findOne({ resetTokenHash: hashResetToken(token), resetTokenExpires: { $gt: new Date() } })
      : null;
    if (!user) {
      passwordResetByIp.hit(req.ip);
      throw new HttpError(400, 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn');
    }
    await user.setPassword(password);
    user.mustChangePassword = false;
    user.resetTokenHash = undefined;
    user.resetTokenExpires = undefined;
    await user.save();
    loginByUser.reset(user.username);
    res.json({ data: { message: 'Đã đặt mật khẩu mới. Vui lòng đăng nhập lại.' } });
  })
);

const api = express.Router();
api.use(authenticate);

api.get('/auth/me', (req, res) => {
  res.json({ data: toPublicUser(req.auth.user) });
});

// Người dùng tự đổi mật khẩu (bắt buộc ở lần đăng nhập đầu khi mật khẩu do quản trị đặt).
api.post(
  '/auth/change-password',
  asyncHandler(async (req, res) => {
    const current = String(req.body?.currentPassword ?? '');
    const next = parsePassword(req.body?.newPassword);
    if (current === next) throw new HttpError(400, 'Mật khẩu mới phải khác mật khẩu hiện tại');

    const userKey = req.auth.user.username;
    loginByUser.assertAllowed(userKey, 'Bạn đã nhập sai quá nhiều lần.');
    const verified = await User.findByCredentials(userKey, current);
    if (!verified) {
      loginByUser.hit(userKey);
      throw new HttpError(400, 'Mật khẩu hiện tại không đúng');
    }

    const user = await User.findById(req.auth.userId);
    await user.setPassword(next);
    user.mustChangePassword = false;
    await user.save();
    // Token cũ hết hiệu lực (passwordChangedAt) → cấp token mới cho phiên hiện tại
    // (cùng giây với passwordChangedAt vẫn hợp lệ vì authenticate so sánh theo giây, dùng ">").
    res.json({ data: { token: signToken(user), user: toPublicUser(user) } });
  })
);

api.get('/meta', (req, res) => {
  res.json({
    data: {
      phanLoai: effectiveRules(),
      // Lịch dùng cho phần xem trước hạn ở trình duyệt (cùng quy tắc với backend).
      calendar: (({ useWorkingDays, weekendDays, holidays }) => ({ useWorkingDays, weekendDays, holidays }))(getSettings('deadlines')),
      trangThai: TRANG_THAI,
      mucDoUuTien: MUC_DO_UU_TIEN,
      upcomingWindowDays: UPCOMING_WINDOW_DAYS,
    },
  });
});

// Danh sách người có thể được phân công (chỉ tài khoản đang hoạt động).
api.get(
  '/users',
  authorize(...PERMISSIONS.DOSSIER_ASSIGN),
  asyncHandler(async (req, res) => {
    const filter = { isActive: { $ne: false } };
    if (req.query.role) filter.role = String(req.query.role).toUpperCase();
    const users = await User.find(filter).select(ASSIGNEE_FIELDS).sort({ username: 1 }).lean();
    res.json({ data: users });
  })
);

// Phải khai báo TRƯỚC /dossiers/:id để "upcoming" không bị hiểu là :id.
api.get(
  '/dossiers/upcoming',
  asyncHandler(async (req, res) => {
    const now = new Date();
    const from = startOfDay(now);
    const to = endOfDay(addDays(now, UPCOMING_WINDOW_DAYS));

    const records = await Dossier.find({
      ...buildRowScope(req.auth),
      ngayHetHan: { $gte: from, $lte: to },
    })
      .populate('canBoThuLy', ASSIGNEE_FIELDS)
      .sort({ ngayHetHan: 1 })
      .lean();

    sendDossiers(res, records, req.auth, { from, to });
  })
);

/* ---------- Danh sách hồ sơ: lọc / sắp xếp / phân trang phía server ---------- */

const DAY_MS = 24 * 60 * 60 * 1000;
const URGENT_SUBMIT_DAYS = 2;
const PAGE_SIZE_DEFAULT = 10;
const PAGE_SIZE_MAX = 200;
const SEARCH_MAX_LENGTH = 100;
const SORTABLE_FIELDS = Object.freeze(['maHoSo', 'tenHoSo', 'ngayVao', 'ngayTrinhLanhDao', 'ngayHetHan', 'mucDoUuTien']);
const SEARCH_FIELDS = Object.freeze([
  'maHoSo', 'soBienNhan', 'tenHoSo', 'diaChi', 'donViGui', 'loaiHoSoGoc', 'ghiChu', 'ghiChuCanBo', 'chiDaoLanhDao',
]);
const QUICK_FILTERS = Object.freeze(['ALL', 'NEXT_WEEK', 'OVERDUE', 'URGENT_SUBMIT']);

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const queryText = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * Điều kiện "lọc nhanh" theo ngày Việt Nam (ngày lưu 00:00 UTC), cùng quy tắc với giao diện:
 * - NEXT_WEEK: hạn xử lý trong [hôm nay, hôm nay + 7];
 * - OVERDUE: chưa hoàn thành và hạn xử lý đã qua;
 * - URGENT_SUBMIT: chưa trình / chưa xong và hạn trình LĐ trễ hoặc còn ≤ 2 ngày.
 */
function quickCondition(mode) {
  const today = todayVN();
  switch (mode) {
    case 'NEXT_WEEK':
      return { ngayHetHan: { $gte: today, $lt: new Date(today.getTime() + (UPCOMING_WINDOW_DAYS + 1) * DAY_MS) } };
    case 'OVERDUE':
      return { trangThai: { $ne: 'HOAN_THANH' }, ngayHetHan: { $lt: today } };
    case 'URGENT_SUBMIT':
      return {
        trangThai: { $nin: ['CHO_LANH_DAO_DUYET', 'HOAN_THANH'] },
        ngayTrinhLanhDao: { $lt: new Date(today.getTime() + (URGENT_SUBMIT_DAYS + 1) * DAY_MS) },
      };
    default:
      return null;
  }
}

/** Bộ lọc MongoDB từ query (?q, phanLoai, trangThai, canBo, quick), luôn kèm phạm vi dòng theo quyền. */
async function buildListFilter(auth, query = {}) {
  const and = [buildRowScope(auth)];
  const scoped = ROW_SCOPED_ROLES.includes(auth.role);

  const phanLoai = queryText(query.phanLoai).toUpperCase();
  if (phanLoai && phanLoai !== 'ALL') and.push({ phanLoai });

  const trangThai = queryText(query.trangThai).toUpperCase();
  if (trangThai && trangThai !== 'ALL') {
    if (!TRANG_THAI.includes(trangThai)) throw new HttpError(400, 'trangThai không hợp lệ');
    and.push({ trangThai });
  }

  const canBo = queryText(query.canBo);
  if (!scoped && canBo && canBo !== 'ALL') {
    if (canBo === 'NONE') and.push({ canBoThuLy: null });
    else if (mongoose.isValidObjectId(canBo)) and.push({ canBoThuLy: new mongoose.Types.ObjectId(canBo) });
    else throw new HttpError(400, 'canBo không hợp lệ');
  }

  const quick = queryText(query.quick).toUpperCase() || 'ALL';
  if (!QUICK_FILTERS.includes(quick)) throw new HttpError(400, 'quick không hợp lệ');
  if (quickCondition(quick)) and.push(quickCondition(quick));

  const keyword = queryText(query.q).slice(0, SEARCH_MAX_LENGTH);
  if (keyword) {
    const regex = new RegExp(escapeRegex(keyword), 'i');
    const fields = scoped ? SEARCH_FIELDS.filter((field) => !SENSITIVE_FIELDS.includes(field)) : SEARCH_FIELDS;
    const officers = await User.find({ $or: [{ hoTen: regex }, { username: regex }] }).distinct('_id');
    and.push({
      $or: [...fields.map((field) => ({ [field]: regex })), ...(officers.length ? [{ canBoThuLy: { $in: officers } }] : [])],
    });
  }
  return and.length === 1 ? and[0] : { $and: and };
}

/** Pipeline sắp xếp: mặc định hạn xử lý gần nhất trước; ưu tiên nội bộ sắp theo mức độ (cán bộ không được dùng). */
function buildSortStages(auth, query = {}) {
  let field = SORTABLE_FIELDS.includes(query.sort) ? query.sort : 'ngayHetHan';
  if (field === 'mucDoUuTien' && ROW_SCOPED_ROLES.includes(auth.role)) field = 'ngayHetHan';
  const dir = query.dir === 'desc' ? -1 : 1;
  if (field === 'mucDoUuTien') {
    return [
      { $addFields: { _rank: { $indexOfArray: [MUC_DO_UU_TIEN, '$mucDoUuTien'] } } },
      { $sort: { _rank: dir, ngayHetHan: 1, _id: 1 } },
      { $unset: '_rank' },
    ];
  }
  return [{ $sort: { [field]: dir, createdAt: -1, _id: 1 } }];
}

/** Id các hồ sơ khớp bộ lọc, theo đúng thứ tự sắp xếp (chọn tất cả / xuất Excel theo bộ lọc). */
async function listFilteredIds(auth, query, limit) {
  const rows = await Dossier.aggregate([
    { $match: await buildListFilter(auth, query) },
    ...buildSortStages(auth, query),
    { $limit: limit },
    { $project: { _id: 1 } },
  ]);
  return rows.map((row) => String(row._id));
}

const parsePositiveInt = (value, fallback) => {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number > 0 ? number : fallback;
};

// Tra cứu nhanh theo số biên nhận / mã hồ sơ (khớp đúng, không phân biệt hoa thường).
const LOOKUP_LIMIT = 10;
api.get(
  '/dossiers/lookup',
  asyncHandler(async (req, res) => {
    const keyword = queryText(req.query.q).slice(0, SEARCH_MAX_LENGTH);
    if (!keyword) throw new HttpError(400, 'Nhập số biên nhận hoặc mã hồ sơ');
    const exact = new RegExp(`^${escapeRegex(keyword)}$`, 'i');
    const records = await Dossier.find({ ...buildRowScope(req.auth), $or: [{ soBienNhan: exact }, { maHoSo: exact }] })
      .populate('canBoThuLy', ASSIGNEE_FIELDS)
      .sort({ ngayVao: -1 })
      .limit(LOOKUP_LIMIT)
      .lean();
    sendDossiers(res, records, req.auth);
  })
);

// Số liệu thẻ KPI (toàn bộ hồ sơ trong phạm vi quyền, không phụ thuộc bộ lọc đang chọn).
api.get(
  '/dossiers/stats',
  asyncHandler(async (req, res) => {
    const scope = buildRowScope(req.auth);
    const [total, urgentSubmit, dueNextWeek, overdue] = await Promise.all([
      Dossier.countDocuments(scope),
      Dossier.countDocuments({ ...scope, ...quickCondition('URGENT_SUBMIT') }),
      Dossier.countDocuments({ ...scope, ...quickCondition('NEXT_WEEK') }),
      Dossier.countDocuments({ ...scope, ...quickCondition('OVERDUE') }),
    ]);
    res.json({ data: { total, urgentSubmit, dueNextWeek, overdue } });
  })
);

api.get(
  '/dossiers/ids',
  asyncHandler(async (req, res) => {
    const ids = await listFilteredIds(req.auth, req.query, BULK_MAX + 1);
    res.json({ data: ids.slice(0, BULK_MAX), meta: { truncated: ids.length > BULK_MAX, max: BULK_MAX } });
  })
);

// Không truyền ?page → trả toàn bộ (tương thích cũ). Có ?page → { data: một trang, meta: { total, page, pageSize } }.
api.get(
  '/dossiers',
  asyncHandler(async (req, res) => {
    if (req.query.page === undefined) {
      const records = await Dossier.find(buildRowScope(req.auth))
        .populate('canBoThuLy', ASSIGNEE_FIELDS)
        .sort({ ngayHetHan: 1, createdAt: -1 })
        .lean();
      return sendDossiers(res, records, req.auth);
    }

    const pageSize = Math.min(parsePositiveInt(req.query.pageSize, PAGE_SIZE_DEFAULT), PAGE_SIZE_MAX);
    const page = parsePositiveInt(req.query.page, 1);
    const [result] = await Dossier.aggregate([
      { $match: await buildListFilter(req.auth, req.query) },
      ...buildSortStages(req.auth, req.query),
      { $facet: { data: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }], total: [{ $count: 'n' }] } },
    ]);
    const records = await Dossier.populate(result.data, { path: 'canBoThuLy', select: ASSIGNEE_FIELDS });
    return sendDossiers(res, records, req.auth, { total: result.total[0]?.n ?? 0, page, pageSize });
  })
);

api.get(
  '/dossiers/:id',
  validateIdParam,
  asyncHandler(async (req, res) => {
    const record = await Dossier.findOne({ _id: req.params.id, ...buildRowScope(req.auth) })
      .populate('canBoThuLy', ASSIGNEE_FIELDS)
      .lean();

    if (!record) throw new HttpError(404, 'Không tìm thấy hồ sơ');
    res.json({ data: applyColumnSecurity(record, req.auth) });
  })
);

api.post(
  '/dossiers',
  authorize(...PERMISSIONS.DOSSIER_CREATE),
  asyncHandler(async (req, res) => {
    const payload = buildPayload(req.body, req.auth.role);
    await assertAssigneeIsCanBo(payload.canBoThuLy);

    // new + save() để hook pre('validate') tự tính ngayTrinhLanhDao / ngayHetHan.
    const dossier = new Dossier(payload);
    await dossier.save();
    await dossier.populate('canBoThuLy', ASSIGNEE_FIELDS);
    await logDossier(req.auth, dossier, 'CREATE', { note: 'Tiếp nhận hồ sơ' });

    res.status(201).json({ data: applyColumnSecurity(dossier, req.auth) });
  })
);

/* ---------- Chuyển cán bộ / gia hạn: bắt buộc lý do ---------- */

const REASON_MAX_LENGTH = 500;
const parseReason = (value) => String(value ?? '').trim().slice(0, REASON_MAX_LENGTH);
const refId = (value) => (value && typeof value === 'object' && value._id ? String(value._id) : value ? String(value) : null);
const dayKey = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);

/**
 * Loại nhật ký cho một lần sửa (gọi sau dossier.set(), trước save()):
 * - EXTEND: đặt / đổi ngày gia hạn;
 * - TRANSFER: chuyển từ cán bộ đang thụ lý sang người khác (phân công lần đầu không tính).
 * Hai trường hợp này bắt buộc có lý do. Trả về null nếu là sửa thông thường.
 */
function classifyChange(before, dossier, lyDo) {
  const extended = Boolean(dossier.ngayGiaHan) && dayKey(before.ngayGiaHan) !== dayKey(dossier.ngayGiaHan);
  const transferred = Boolean(before.canBoThuLy) && refId(before.canBoThuLy) !== refId(dossier.canBoThuLy);
  if ((extended || transferred) && !lyDo) {
    throw new HttpError(400, extended ? 'Vui lòng nhập lý do gia hạn' : 'Vui lòng nhập lý do chuyển cán bộ thụ lý');
  }
  return extended ? 'EXTEND' : transferred ? 'TRANSFER' : null;
}

/* ---------- Thao tác hàng loạt ---------- */

const BULK_MAX = 3000;
const BULK_CONCURRENCY = 25;
// Trường được đổi hàng loạt theo role (cán bộ: chỉ trạng thái hồ sơ của mình).
const BULK_FIELDS = { ADMIN: ['trangThai', 'canBoThuLy'], VAN_THU: ['trangThai', 'canBoThuLy'], CAN_BO: ['trangThai'] };

const parseIds = (ids) => {
  if (!Array.isArray(ids) || ids.length === 0) throw new HttpError(400, 'Chưa chọn hồ sơ nào');
  if (ids.length > BULK_MAX) throw new HttpError(400, `Tối đa ${BULK_MAX} hồ sơ mỗi lần`);
  const bad = ids.find((id) => !mongoose.isValidObjectId(id));
  if (bad) throw new HttpError(400, `ID không hợp lệ: ${bad}`);
  return [...new Set(ids.map(String))];
};

/** Chạy fn cho từng phần tử, tối đa `limit` việc song song. */
async function mapInChunks(items, limit, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += limit) results.push(...(await Promise.all(items.slice(i, i + limit).map(fn))));
  return results;
}

api.post(
  '/dossiers/bulk',
  asyncHandler(async (req, res) => {
    const ids = parseIds(req.body?.ids);
    const changes = pickFields(req.body?.changes ?? {}, BULK_FIELDS[req.auth.role] ?? []);
    if (Object.keys(changes).length === 0) throw new HttpError(400, 'Không có thay đổi hợp lệ');
    const payload = buildPayload(changes, req.auth.role);
    if ('canBoThuLy' in payload) await assertAssigneeIsCanBo(payload.canBoThuLy);
    const lyDo = parseReason(req.body?.lyDo);

    const dossiers = await Dossier.find({ _id: { $in: ids }, ...buildRowScope(req.auth) });
    // Kiểm tra lý do cho cả lô trước khi lưu bất kỳ hồ sơ nào (tránh lưu dở dang).
    const prepared = dossiers.map((dossier) => {
      const before = dossier.toObject();
      dossier.set(payload);
      return { dossier, before, action: classifyChange(before, dossier, lyDo) };
    });
    const logs = await mapInChunks(prepared, BULK_CONCURRENCY, async ({ dossier, before, action }) => {
      if (!dossier.isModified()) return null;
      await dossier.save();
      return {
        dossier: dossier._id,
        maHoSo: dossier.maHoSo,
        action: action || 'BULK_UPDATE',
        changes: await diffDossier(before, dossier.toObject()),
        note: lyDo,
      };
    });
    const written = logs.filter(Boolean);
    await logMany(req.auth, written);
    res.json({ data: { requested: ids.length, updated: written.length, unchanged: dossiers.length - written.length, notFound: ids.length - dossiers.length } });
  })
);

api.post(
  '/dossiers/bulk-delete',
  authorize(...PERMISSIONS.DOSSIER_DELETE),
  asyncHandler(async (req, res) => {
    const ids = parseIds(req.body?.ids);
    const dossiers = await Dossier.find({ _id: { $in: ids } }).select('maHoSo tenHoSo').lean();
    await Dossier.deleteMany({ _id: { $in: dossiers.map((d) => d._id) } });
    await removeAttachmentsFor(dossiers.map((d) => d._id));
    await logMany(
      req.auth,
      dossiers.map((d) => ({ dossier: d._id, maHoSo: d.maHoSo, action: 'DELETE', note: `Xoá hàng loạt: ${d.tenHoSo}` }))
    );
    res.json({ data: { deleted: dossiers.length } });
  })
);

// Nhật ký xử lý của một hồ sơ (cùng phạm vi dòng với xem hồ sơ; ẩn thay đổi ở cột nhạy cảm).
api.get(
  '/dossiers/:id/logs',
  validateIdParam,
  asyncHandler(async (req, res) => {
    const exists = await Dossier.exists({ _id: req.params.id, ...buildRowScope(req.auth) });
    if (!exists) throw new HttpError(404, 'Không tìm thấy hồ sơ');
    const logs = await DossierLog.find({ dossier: req.params.id }).sort({ createdAt: -1 }).limit(200).lean();
    const hidden = ROW_SCOPED_ROLES.includes(req.auth.role) ? SENSITIVE_FIELDS : [];
    res.json({ data: logs.map((log) => redactLog(log, hidden)) });
  })
);

/* ---------- Tệp đính kèm ---------- */

const ATTACHMENT_FIELDS = 'originalName mimeType size loai uploadedBy uploadedByName createdAt';
// Văn thư / quản trị gỡ được mọi tệp; cán bộ chỉ gỡ tệp do mình tải lên.
const ATTACHMENT_MANAGERS = ['ADMIN', 'VAN_THU'];

/** Hồ sơ trong phạm vi người dùng (404 nếu không thấy) — chạy trước multer để không ghi tệp vô ích. */
const loadScopedDossier = asyncHandler(async (req, res, next) => {
  const dossier = await Dossier.findOne({ _id: req.params.id, ...buildRowScope(req.auth) }).select('maHoSo').lean();
  if (!dossier) throw new HttpError(404, 'Không tìm thấy hồ sơ');
  req.dossier = dossier;
  next();
});

/** Tệp đính kèm + kiểm tra người dùng có quyền xem hồ sơ chứa nó. */
async function loadScopedAttachment(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'ID không hợp lệ');
  const attachment = await Attachment.findById(req.params.id).lean();
  const dossier =
    attachment && (await Dossier.findOne({ _id: attachment.dossier, ...buildRowScope(req.auth) }).select('maHoSo').lean());
  if (!attachment || !dossier) throw new HttpError(404, 'Không tìm thấy tệp đính kèm');
  return { attachment, dossier };
}

api.get(
  '/dossiers/:id/attachments',
  validateIdParam,
  loadScopedDossier,
  asyncHandler(async (req, res) => {
    const data = await Attachment.find({ dossier: req.params.id }).select(ATTACHMENT_FIELDS).sort({ createdAt: -1 }).lean();
    res.json({ data, meta: { types: ATTACHMENT_TYPES, maxBytes: ATTACHMENT_MAX_BYTES, extensions: Object.keys(ALLOWED_EXTENSIONS) } });
  })
);

api.post(
  '/dossiers/:id/attachments',
  validateIdParam,
  loadScopedDossier,
  asyncHandler(async (req, res, next) => {
    const count = await Attachment.countDocuments({ dossier: req.params.id });
    if (count >= ATTACHMENT_MAX_PER_DOSSIER) {
      throw new HttpError(400, `Mỗi hồ sơ tối đa ${ATTACHMENT_MAX_PER_DOSSIER} tệp đính kèm`);
    }
    next();
  }),
  attachmentUpload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Chưa chọn tệp');
    const loai = Object.hasOwn(ATTACHMENT_TYPES, req.body?.loai) ? req.body.loai : 'KHAC';
    const originalName = decodeName(req.file.originalname);
    const fileId = await saveFile(req.file.buffer, originalName);
    let attachment;
    try {
      attachment = await Attachment.create({
        dossier: req.dossier._id,
        originalName,
        fileId,
        mimeType: mimeTypeOf(originalName),
        size: req.file.size,
        loai,
        uploadedBy: req.auth.userId,
        uploadedByName: req.auth.user.hoTen || req.auth.user.username,
      });
    } catch (error) {
      await removeFile({ fileId });
      throw error;
    }
    await logDossier(req.auth, req.dossier, 'ATTACH', { note: `${ATTACHMENT_TYPES[loai]}: ${originalName}` });
    const { fileId: _fileId, storedName, ...data } = attachment.toObject();
    res.status(201).json({ data });
  })
);

api.get(
  '/attachments/:id/download',
  asyncHandler(async (req, res) => {
    const { attachment } = await loadScopedAttachment(req);
    const stream = openFile(attachment);
    stream.once('error', () => {
      if (!res.headersSent) res.status(404).json({ message: 'Tệp không còn trên máy chủ' });
      else res.destroy();
    });
    res.attachment(attachment.originalName);
    res.type(attachment.mimeType);
    res.setHeader('Content-Length', attachment.size);
    stream.pipe(res);
  })
);

api.delete(
  '/attachments/:id',
  asyncHandler(async (req, res) => {
    const { attachment, dossier } = await loadScopedAttachment(req);
    const isOwner = String(attachment.uploadedBy) === req.auth.userId;
    if (!isOwner && !ATTACHMENT_MANAGERS.includes(req.auth.role)) {
      throw new HttpError(403, 'Bạn chỉ gỡ được tệp do mình tải lên');
    }
    await Attachment.deleteOne({ _id: attachment._id });
    await removeFile(attachment);
    await logDossier(req.auth, dossier, 'DETACH', { note: `${ATTACHMENT_TYPES[attachment.loai] ?? ''}: ${attachment.originalName}` });
    res.json({ data: { _id: attachment._id } });
  })
);

api.put(
  '/dossiers/:id',
  validateIdParam,
  asyncHandler(async (req, res) => {
    const dossier = await Dossier.findOne({ _id: req.params.id, ...buildRowScope(req.auth) });
    if (!dossier) throw new HttpError(404, 'Không tìm thấy hồ sơ');

    const payload = buildPayload(req.body, req.auth.role);
    if (Object.keys(payload).length === 0) {
      throw new HttpError(400, 'Không có trường hợp lệ nào để cập nhật');
    }
    if ('canBoThuLy' in payload) await assertAssigneeIsCanBo(payload.canBoThuLy);

    // Không cho phép client tự ghi ngày tính toán.
    const before = dossier.toObject();
    dossier.set(payload);
    const lyDo = parseReason(req.body?.lyDo);
    const action = classifyChange(before, dossier, lyDo) || 'UPDATE';
    await dossier.save();
    await logDossier(req.auth, dossier, action, { changes: await diffDossier(before, dossier.toObject()), note: lyDo });
    await dossier.populate('canBoThuLy', ASSIGNEE_FIELDS);

    res.json({ data: applyColumnSecurity(dossier, req.auth) });
  })
);

api.delete(
  '/dossiers/:id',
  authorize(...PERMISSIONS.DOSSIER_DELETE),
  validateIdParam,
  asyncHandler(async (req, res) => {
    const deleted = await Dossier.findByIdAndDelete(req.params.id).lean();
    if (!deleted) throw new HttpError(404, 'Không tìm thấy hồ sơ');
    await removeAttachmentsFor([deleted._id]);
    await logDossier(req.auth, deleted, 'DELETE', { note: `Xoá hồ sơ: ${deleted.tenHoSo}` });
    res.json({ data: { _id: deleted._id } });
  })
);

/* ------------------------------------------------------------------ */
/* Quản trị hệ thống: tài khoản & phân quyền (chỉ ADMIN)              */
/* ------------------------------------------------------------------ */

const admin = express.Router();
admin.use(authorize(...PERMISSIONS.SYSTEM_ADMIN));

const ADMIN_USER_FIELDS = 'username hoTen email role isActive createdAt updatedAt';
const HO_TEN_MAX_LENGTH = 100;

const parseRole = (value) => {
  const role = String(value ?? '').trim().toUpperCase();
  if (!ROLES.includes(role)) throw new HttpError(400, `role phải thuộc: ${ROLES.join(', ')}`);
  return role;
};

const parseHoTen = (value) => {
  const hoTen = String(value ?? '').trim();
  if (!hoTen) throw new HttpError(400, 'Họ tên là bắt buộc');
  if (hoTen.length > HO_TEN_MAX_LENGTH) throw new HttpError(400, `Họ tên tối đa ${HO_TEN_MAX_LENGTH} ký tự`);
  return hoTen;
};

/** Trả về email đã chuẩn hoá; chuỗi rỗng → null (khi sửa, nghĩa là xoá email). */
const parseEmail = (value, { required = false } = {}) => {
  const email = String(value ?? '').trim().toLowerCase();
  if (!email) {
    if (required) throw new HttpError(400, 'Email là bắt buộc');
    return null;
  }
  if (!EMAIL_PATTERN.test(email)) throw new HttpError(400, 'Email không hợp lệ');
  return email;
};

const parsePassword = (value) => {
  const password = String(value ?? '');
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new HttpError(400, `Mật khẩu phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự`);
  }
  return password;
};

const countAssignedDossiers = (userId) => Dossier.countDocuments({ canBoThuLy: userId });

/**
 * Chặn các thay đổi làm hệ thống mất quyền quản trị hoặc làm "mồ côi" hồ sơ:
 * - Không tự đổi role / tự khoá / tự xoá chính mình.
 * - Luôn còn ít nhất 1 ADMIN đang hoạt động.
 * - Cán bộ còn hồ sơ thụ lý thì không đổi role / xoá được (phải chuyển hồ sơ trước).
 */
async function assertSafeUserChange(target, actorId, { nextRole, nextActive, deleting = false }) {
  const isSelf = String(target._id) === actorId;
  const roleChanging = nextRole !== undefined && nextRole !== target.role;
  const locking = nextActive === false && target.isActive !== false;

  if (isSelf && (roleChanging || locking || deleting)) {
    throw new HttpError(409, 'Không thể tự đổi quyền, tự khoá hoặc tự xoá tài khoản đang đăng nhập');
  }

  const losesAdmin = target.role === 'ADMIN' && target.isActive !== false && (roleChanging || locking || deleting);
  if (losesAdmin) {
    const otherAdmins = await User.countDocuments({ _id: { $ne: target._id }, role: 'ADMIN', isActive: { $ne: false } });
    if (otherAdmins === 0) throw new HttpError(409, 'Hệ thống phải còn ít nhất 1 tài khoản ADMIN đang hoạt động');
  }

  if (target.role === 'CAN_BO' && (roleChanging || deleting)) {
    const assigned = await countAssignedDossiers(target._id);
    if (assigned > 0) {
      throw new HttpError(
        409,
        `Cán bộ đang thụ lý ${assigned} hồ sơ — hãy phân công lại các hồ sơ này trước khi ${deleting ? 'xoá' : 'đổi quyền'}`
      );
    }
  }
}

const loadTargetUser = async (id) => {
  // Lấy kèm passwordHash chỉ để biết "đã có mật khẩu chưa"; toAdminUser sẽ bỏ nó đi.
  const user = await User.findById(id).select('+passwordHash');
  if (!user) throw new HttpError(404, 'Không tìm thấy tài khoản');
  return user;
};

const toAdminUser = (user, dossierCount = 0) => {
  const plain = typeof user.toObject === 'function' ? user.toObject() : { ...user };
  const hasPassword = Boolean(plain.passwordHash);
  delete plain.passwordHash;
  delete plain.passwordChangedAt;
  delete plain.__v;
  return { ...plain, isActive: plain.isActive !== false, hasPassword, dossierCount };
};

admin.get(
  '/users',
  asyncHandler(async (req, res) => {
    const [users, counts] = await Promise.all([
      User.find().select(`${ADMIN_USER_FIELDS} +passwordHash`).sort({ role: 1, username: 1 }).lean(),
      Dossier.aggregate([{ $group: { _id: '$canBoThuLy', count: { $sum: 1 } } }]),
    ]);
    const countByUser = new Map(counts.map((item) => [String(item._id), item.count]));
    res.json({
      data: users.map((user) => toAdminUser(user, countByUser.get(String(user._id)) ?? 0)),
      meta: { mailConfigured: isMailConfigured() },
    });
  })
);

admin.post(
  '/users',
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const username = String(body.username ?? '').trim().toLowerCase();
    if (!USERNAME_PATTERN.test(username)) {
      throw new HttpError(400, 'Tên đăng nhập chỉ gồm chữ thường, số, dấu . _ - (3–32 ký tự)');
    }
    const password = parsePassword(body.password);

    const user = new User({
      username,
      hoTen: parseHoTen(body.hoTen),
      email: parseEmail(body.email, { required: true }),
      role: parseRole(body.role),
      mustChangePassword: true, // mật khẩu do quản trị đặt → người dùng phải tự đổi
    });
    await user.setPassword(password);
    await user.save();

    // Gửi mail sau khi đã lưu: gửi lỗi thì tài khoản vẫn được tạo, FE báo để quản trị gửi thủ công.
    const email =
      body.sendEmail === false
        ? { sent: false, reason: 'SKIPPED' }
        : await sendWelcomeEmail({ to: user.email, hoTen: user.hoTen, username, password, role: user.role });

    res.status(201).json({ data: toAdminUser(user), meta: { email } });
  })
);

admin.put(
  '/users/:id',
  validateIdParam,
  asyncHandler(async (req, res) => {
    const user = await loadTargetUser(req.params.id);
    const body = req.body ?? {};

    const changes = {};
    if ('hoTen' in body) changes.hoTen = parseHoTen(body.hoTen);
    // null → xoá email (set undefined để Mongoose $unset, giữ đúng chỉ mục sparse).
    if ('email' in body) changes.email = parseEmail(body.email) ?? undefined;
    if ('role' in body) changes.role = parseRole(body.role);
    if ('isActive' in body) {
      if (typeof body.isActive !== 'boolean') throw new HttpError(400, 'isActive phải là true/false');
      changes.isActive = body.isActive;
    }
    if (Object.keys(changes).length === 0) throw new HttpError(400, 'Không có trường hợp lệ nào để cập nhật');

    await assertSafeUserChange(user, req.auth.userId, { nextRole: changes.role, nextActive: changes.isActive });

    user.set(changes);
    await user.save();
    res.json({ data: toAdminUser(user, await countAssignedDossiers(user._id)) });
  })
);

admin.put(
  '/users/:id/password',
  validateIdParam,
  asyncHandler(async (req, res) => {
    const user = await loadTargetUser(req.params.id);
    await user.setPassword(parsePassword(req.body?.password));
    // Quản trị tự đặt lại mật khẩu của chính mình thì không cần ép đổi.
    user.mustChangePassword = String(user._id) !== req.auth.userId;
    await user.save();
    res.json({ data: { _id: user._id } });
  })
);

admin.delete(
  '/users/:id',
  validateIdParam,
  asyncHandler(async (req, res) => {
    const user = await loadTargetUser(req.params.id);
    await assertSafeUserChange(user, req.auth.userId, { deleting: true });
    await user.deleteOne();
    res.json({ data: { _id: user._id } });
  })
);

/** Ma trận phân quyền, sinh trực tiếp từ các hằng số mà middleware đang dùng. */
/* ---------- Cấu hình hạn xử lý ---------- */

admin.get('/settings/deadlines', (req, res) => {
  res.json({ data: { ...getSettings('deadlines'), types: effectiveRules() } });
});

admin.put(
  '/settings/deadlines',
  asyncHandler(async (req, res) => {
    const { value, errors } = validateDeadlineSettings(req.body);
    if (errors.length) throw new HttpError(400, errors[0], errors);
    const saved = await saveSettings('deadlines', value);
    res.json({ data: { ...saved, types: effectiveRules() } });
  })
);

/**
 * Tính lại hạn cho hồ sơ CHƯA hoàn thành theo cấu hình hiện tại.
 * Hồ sơ có Ngày hẹn trả / Gia hạn giữ nguyên hạn xử lý (chỉ tính lại hạn trình LĐ).
 * dryRun=true: chỉ đếm số hồ sơ sẽ thay đổi.
 */
admin.post(
  '/settings/deadlines/recalculate',
  asyncHandler(async (req, res) => {
    const dryRun = req.body?.dryRun === true;
    const open = await Dossier.find({ trangThai: { $ne: 'HOAN_THANH' } })
      .select('maHoSo ngayVao phanLoai ngayHenTra ngayGiaHan ngayTrinhLanhDao ngayHetHan')
      .lean();

    const sameDay = (a, b) => (a ? new Date(a).getTime() : null) === (b ? new Date(b).getTime() : null);
    const updates = [];
    for (const d of open) {
      const deadlines = calculateDeadlines(d.ngayVao, d.phanLoai);
      if (!deadlines) continue;
      const next = { ngayTrinhLanhDao: deadlines.ngayTrinhLanhDao, ngayHetHan: d.ngayGiaHan || d.ngayHenTra || deadlines.ngayHetHan };
      if (!sameDay(next.ngayTrinhLanhDao, d.ngayTrinhLanhDao) || !sameDay(next.ngayHetHan, d.ngayHetHan)) updates.push({ before: d, next });
    }

    if (!dryRun && updates.length) {
      await Dossier.bulkWrite(updates.map(({ before, next }) => ({ updateOne: { filter: { _id: before._id }, update: { $set: next } } })));
      await logMany(
        req.auth,
        updates.map(({ before, next }) => ({
          dossier: before._id,
          maHoSo: before.maHoSo,
          action: 'BULK_UPDATE',
          note: 'Tính lại hạn theo cấu hình mới',
          changes: ['ngayTrinhLanhDao', 'ngayHetHan']
            .map((field) => ({
              field,
              from: before[field] ? new Date(before[field]).toISOString().slice(0, 10) : null,
              to: next[field].toISOString().slice(0, 10),
            }))
            .filter((c) => c.from !== c.to),
        }))
      );
    }
    res.json({ data: { checked: open.length, changed: updates.length, dryRun } });
  })
);

/* ---------- Nhắc hạn qua email ---------- */

admin.get('/settings/reminders', (req, res) => {
  res.json({ data: { ...getSettings('reminders'), mailConfigured: isMailConfigured() } });
});

admin.put(
  '/settings/reminders',
  asyncHandler(async (req, res) => {
    const { value, errors } = validateReminderSettings(req.body);
    if (errors.length) throw new HttpError(400, errors[0], errors);
    const saved = await saveSettings('reminders', { ...getSettings('reminders'), ...value });
    res.json({ data: { ...saved, mailConfigured: isMailConfigured() } });
  })
);

// Xem trước (dryRun) hoặc gửi ngay.
admin.post(
  '/settings/reminders/run',
  asyncHandler(async (req, res) => {
    const dryRun = req.body?.dryRun !== false;
    if (!dryRun && !isMailConfigured()) throw new HttpError(400, 'Chưa cấu hình SMTP trong backend/.env nên chưa gửi được email');
    res.json({ data: await runReminders({ dryRun }) });
  })
);

admin.get('/permissions', (req, res) => {
  const hoSoFields = [...new Set(Object.values(WRITABLE_FIELDS).flat())];
  res.json({
    data: {
      fields: hoSoFields,
      sensitiveFields: SENSITIVE_FIELDS,
      roles: ROLES.map((role) => ({
        role,
        rowScoped: ROW_SCOPED_ROLES.includes(role),
        canViewSensitive: !ROW_SCOPED_ROLES.includes(role),
        writableFields: WRITABLE_FIELDS[role] ?? [],
        actions: Object.fromEntries(Object.entries(PERMISSIONS).map(([action, roles]) => [action, roles.includes(role)])),
      })),
    },
  });
});

api.use('/admin', admin);

/* ------------------------------------------------------------------ */
/* Nhập hồ sơ từ Excel (ADMIN, VAN_THU): xem trước → xác nhận → hoàn tác */
/* ------------------------------------------------------------------ */

const importRouter = express.Router();
importRouter.use(authorize(...PERMISSIONS.DOSSIER_IMPORT));

const IMPORT_MAX_BYTES = 15 * 1024 * 1024;
const IMPORT_TTL_MS = 15 * 60 * 1000;
const IMPORT_SAMPLE_SIZE = 15;
const IMPORT_ISSUE_LIMIT = 200;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMPORT_MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const ok = /\.xlsx$/i.test(file.originalname);
    cb(ok ? null : new HttpError(400, 'Chỉ nhận file Excel .xlsx (file .xls cũ: mở bằng Excel rồi Lưu thành .xlsx)'), ok);
  },
});

// Kết quả phân tích chờ xác nhận, giữ trong bộ nhớ 15 phút (mất khi restart server → tải lại file).
const pendingImports = new Map();
const prunePendingImports = () => {
  const now = Date.now();
  for (const [id, entry] of pendingImports) if (entry.expiresAt < now) pendingImports.delete(id);
};

const day = (date) => (date ? date.toISOString().slice(0, 10) : null);

importRouter.get(
  '/template',
  asyncHandler(async (req, res) => {
    const buffer = await buildTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="mau-nhap-ho-so.xlsx"');
    res.send(Buffer.from(buffer));
  })
);

importRouter.post(
  '/preview',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Chưa chọn file Excel');
    prunePendingImports();

    let workbook;
    try {
      workbook = await readWorkbook(req.file.buffer);
    } catch {
      throw new HttpError(400, 'Không đọc được file — hãy kiểm tra đúng định dạng .xlsx');
    }
    const { records, issues, summary } = await analyzeImport(workbook);
    previewCodes(records);

    // multer giải mã tên file theo latin1; đổi lại UTF-8 để giữ tên tiếng Việt.
    const fileName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const importId = crypto.randomUUID();
    const expiresAt = Date.now() + IMPORT_TTL_MS;
    pendingImports.set(importId, { records, fileName, userId: req.auth.userId, expiresAt });

    res.json({
      data: {
        importId,
        expiresAt: new Date(expiresAt),
        fileName,
        summary,
        issues: issues.slice(0, IMPORT_ISSUE_LIMIT),
        sample: records.slice(0, IMPORT_SAMPLE_SIZE).map((r) => ({
          maHoSo: r.maHoSo,
          tenHoSo: r.tenHoSo,
          diaChi: r.diaChi,
          phanLoai: r.phanLoai,
          loaiHoSoGoc: r.loaiHoSoGoc,
          ngayVao: day(r.ngayVao),
          ngayHenTra: day(r.ngayGiaHan || r.ngayHenTra),
          canBo: r.officer ?? r.newOfficerName,
          canBoMoi: !r.officer && Boolean(r.newOfficerName),
          trangThai: r.trangThai,
          sheet: r.sheet,
          dong: r.dong,
        })),
      },
    });
  })
);

importRouter.post(
  '/:importId/commit',
  asyncHandler(async (req, res) => {
    prunePendingImports();
    const entry = pendingImports.get(req.params.importId);
    if (!entry) throw new HttpError(410, 'Phiên xem trước đã hết hạn — hãy tải file lên lại');
    if (entry.userId !== req.auth.userId) throw new HttpError(403, 'Phiên nhập này của người dùng khác');
    if (entry.records.length === 0) throw new HttpError(400, 'Không có hồ sơ mới nào để nhập');

    pendingImports.delete(req.params.importId); // không cho xác nhận hai lần
    const batchId = req.params.importId;
    const result = await commitImport(entry.records, {
      batchId,
      fileName: entry.fileName,
      createNewOfficers: req.body?.createNewOfficers !== false,
      auth: req.auth,
    });
    res.status(201).json({ data: { batchId, fileName: entry.fileName, ...result } });
  })
);

// Các lần nhập qua web gần đây (để hoàn tác).
importRouter.get(
  '/batches',
  asyncHandler(async (req, res) => {
    const batches = await Dossier.aggregate([
      { $match: { 'nguonNhap.lanNhap': { $type: 'string' } } },
      {
        $group: {
          _id: '$nguonNhap.lanNhap',
          tep: { $first: '$nguonNhap.tep' },
          count: { $sum: 1 },
          importedAt: { $min: '$createdAt' },
        },
      },
      { $sort: { importedAt: -1 } },
      { $limit: 10 },
    ]);
    res.json({ data: batches.map((b) => ({ batchId: b._id, fileName: b.tep, count: b.count, importedAt: b.importedAt })) });
  })
);

importRouter.delete(
  '/batches/:batchId',
  asyncHandler(async (req, res) => {
    const batchFilter = { 'nguonNhap.lanNhap': String(req.params.batchId) };
    const batchIds = await Dossier.find(batchFilter).distinct('_id');
    const { deletedCount } = await Dossier.deleteMany({ _id: { $in: batchIds } });
    await removeAttachmentsFor(batchIds);
    if (deletedCount === 0) throw new HttpError(404, 'Không tìm thấy lần nhập này');
    res.json({ data: { deleted: deletedCount } });
  })
);

api.use('/import', importRouter);

/* ------------------------------------------------------------------ */
/* Xuất Excel & báo cáo (mọi role; cán bộ chỉ thấy hồ sơ của mình)    */
/* ------------------------------------------------------------------ */

const REPORT_FIELDS =
  'maHoSo soBienNhan tenHoSo diaChi phanLoai loaiHoSoGoc ngayVao ngayTrinhLanhDao ngayTrinhThucTe ngayHetHan ngayKetThuc treHanTheoSo trangThai canBoThuLy ghiChuCanBo ghiChu chiDaoLanhDao mucDoUuTien';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const parsePeriod = (query) => {
  const from = String(query.from ?? '');
  const to = String(query.to ?? '');
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) throw new HttpError(400, 'Kỳ báo cáo cần from, to dạng yyyy-mm-dd');
  if (from > to) throw new HttpError(400, 'Ngày bắt đầu phải trước ngày kết thúc');
  return { from, to };
};

const EXPORT_MAX = 20000;
const loadReportDossiers = (auth, extra = {}) =>
  Dossier.find({ ...buildRowScope(auth), ...extra })
    .select(REPORT_FIELDS)
    .populate('canBoThuLy', 'hoTen username')
    .lean();

const sendXlsx = (res, buffer, fileName) => {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  // Tên file có dấu: dùng filename* (RFC 5987) kèm bản ASCII dự phòng.
  res.setHeader('Content-Disposition', `attachment; filename="${fileName.normalize('NFD').replace(/[^\x20-\x7e]/g, '')}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  res.send(Buffer.from(buffer));
};

// Xuất các hồ sơ đang xem (ids) hoặc toàn bộ trong phạm vi quyền.
api.post(
  '/export/dossiers',
  asyncHandler(async (req, res) => {
    // Theo danh sách id đã chọn, hoặc theo bộ lọc đang áp dụng (body.filters, cùng tham số với GET /dossiers).
    const ids = Array.isArray(req.body?.ids)
      ? parseIds(req.body.ids)
      : req.body?.filters && typeof req.body.filters === 'object'
        ? await listFilteredIds(req.auth, req.body.filters, EXPORT_MAX)
        : null;
    const records = await loadReportDossiers(req.auth, ids ? { _id: { $in: ids } } : {});
    // Giữ đúng thứ tự đang hiển thị ở bảng.
    const order = ids ? new Map(ids.map((id, i) => [id, i])) : null;
    if (order) records.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id)));
    const includeSensitive = !ROW_SCOPED_ROLES.includes(req.auth.role);
    const buffer = await buildDossierWorkbook(records, { includeSensitive });
    sendXlsx(res, buffer, `ho-so-${new Date().toISOString().slice(0, 10)}.xlsx`);
  })
);

api.get(
  '/reports/summary',
  asyncHandler(async (req, res) => {
    const { from, to } = parsePeriod(req.query);
    const records = await loadReportDossiers(req.auth);
    res.json({ data: { ...buildSummary(records, from, to), oldestOverdue: buildOldestOverdue(records) } });
  })
);

api.get(
  '/reports/summary.xlsx',
  asyncHandler(async (req, res) => {
    const { from, to } = parsePeriod(req.query);
    const records = await loadReportDossiers(req.auth);
    const scopeLabel = ROW_SCOPED_ROLES.includes(req.auth.role) ? `Cán bộ: ${req.auth.user.hoTen || req.auth.user.username}` : '';
    const buffer = await buildSummaryWorkbook(buildSummary(records, from, to), buildOldestOverdue(records, 500), scopeLabel);
    sendXlsx(res, buffer, `bao-cao-${from}_${to}.xlsx`);
  })
);

api.get(
  '/reports/monthly',
  asyncHandler(async (req, res) => {
    const year = Number(req.query.year) || new Date().getFullYear();
    const records = await loadReportDossiers(req.auth);
    res.json({ data: buildMonthly(records, year) });
  })
);

app.use('/api', api);

app.use((req, res) => {
  res.status(404).json({ message: `Không tìm thấy route ${req.method} ${req.originalUrl}` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message, details: err.details });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.fromEntries(
      Object.entries(err.errors).map(([field, error]) => [field, error.message])
    );
    return res.status(400).json({ message: 'Dữ liệu không hợp lệ', details });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ message: `Giá trị không hợp lệ cho trường ${err.path}` });
  }
  if (err && err.code === 11000) {
    return res.status(409).json({ message: 'Dữ liệu bị trùng', details: err.keyValue });
  }
  if (err instanceof multer.MulterError) {
    const maxMb = req.path.includes('/attachments') ? ATTACHMENT_MAX_BYTES / 1024 / 1024 : IMPORT_MAX_BYTES / 1024 / 1024;
    const message = err.code === 'LIMIT_FILE_SIZE' ? `File quá lớn (tối đa ${maxMb} MB)` : `Lỗi tải file: ${err.message}`;
    return res.status(400).json({ message });
  }
  if (err && Number.isInteger(err.status) && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ message: err.message });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Body JSON không hợp lệ' });
  }

  console.error(err);
  return res.status(500).json({ message: 'Lỗi máy chủ' });
});

async function start() {
  try {
    await mongoose.connect(MONGO_URI);
    await loadSettings();
    await migrateAttachmentIndexes();
    startReminderScheduler();
    // Che user:password khi in log.
    console.log(`MongoDB connected: ${MONGO_URI.replace(/\/\/[^@/]+@/, '//***@')}`);
    // 0.0.0.0: host như Render yêu cầu lắng nghe trên mọi địa chỉ.
    app.listen(PORT, '0.0.0.0', () => console.log(`API listening on http://localhost:${PORT}`));
  } catch (error) {
    console.error('Không thể kết nối MongoDB:', error.message);
    process.exit(1);
  }
}

if (require.main === module) start();

module.exports = { app, start };
