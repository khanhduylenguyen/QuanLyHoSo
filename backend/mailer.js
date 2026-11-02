const nodemailer = require('nodemailer');

// Cấu hình SMTP lấy từ .env. Với Gmail:
//   SMTP_HOST=smtp.gmail.com  SMTP_PORT=465  SMTP_SECURE=true
//   SMTP_USER=<gmail gửi đi>  SMTP_PASS=<App Password 16 ký tự, không phải mật khẩu Gmail>
const SMTP = {
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 465,
  secure: String(process.env.SMTP_SECURE ?? 'true').toLowerCase() === 'true',
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
};
const MAIL_FROM = process.env.MAIL_FROM || (SMTP.user ? `Hệ thống Quản lý Hồ sơ <${SMTP.user}>` : undefined);
const APP_URL = (process.env.APP_URL || 'http://localhost:8080').replace(/\/+$/, '');

const ROLE_LABELS = { ADMIN: 'Lãnh đạo / Admin', VAN_THU: 'Văn thư', CAN_BO: 'Cán bộ' };

let transporter = null;

const isMailConfigured = () => Boolean(SMTP.host && SMTP.user && SMTP.pass);

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP.host,
      port: SMTP.port,
      secure: SMTP.secure,
      auth: { user: SMTP.user, pass: SMTP.pass },
    });
  }
  return transporter;
}

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

function buildWelcomeEmail({ hoTen, username, password, role }) {
  const loginUrl = `${APP_URL}/login`;
  const roleLabel = ROLE_LABELS[role] || role;

  const text = [
    `Xin chào ${hoTen},`,
    '',
    'Quản trị viên vừa tạo cho bạn tài khoản trên Hệ thống Quản lý Hồ sơ.',
    '',
    `Tên đăng nhập: ${username}`,
    `Mật khẩu: ${password}`,
    `Vai trò: ${roleLabel}`,
    '',
    `Đăng nhập tại: ${loginUrl}`,
    '',
    'Vì lý do bảo mật, vui lòng không chia sẻ email này và liên hệ quản trị viên nếu bạn không yêu cầu tài khoản này.',
  ].join('\n');

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
    <div style="background:#140707;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
      <div style="font-size:18px;font-weight:bold">Hệ thống Quản lý Hồ sơ</div>
      <div style="font-size:13px;color:#f2734f;margin-top:4px">Thông tin tài khoản mới</div>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:0;padding:24px;border-radius:0 0 12px 12px">
      <p>Xin chào <strong>${escapeHtml(hoTen)}</strong>,</p>
      <p>Quản trị viên vừa tạo cho bạn tài khoản trên Hệ thống Quản lý Hồ sơ.</p>
      <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px;margin:16px 0">
        <tr><td style="padding:10px 14px;color:#64748b">Tên đăng nhập</td><td style="padding:10px 14px;font-family:monospace;font-weight:bold">${escapeHtml(username)}</td></tr>
        <tr><td style="padding:10px 14px;color:#64748b">Mật khẩu</td><td style="padding:10px 14px;font-family:monospace;font-weight:bold">${escapeHtml(password)}</td></tr>
        <tr><td style="padding:10px 14px;color:#64748b">Vai trò</td><td style="padding:10px 14px">${escapeHtml(roleLabel)}</td></tr>
      </table>
      <p style="text-align:center;margin:24px 0">
        <a href="${escapeHtml(loginUrl)}" style="background:#dc2626;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;display:inline-block">Đăng nhập hệ thống</a>
      </p>
      <p style="font-size:12px;color:#94a3b8">Vui lòng không chia sẻ email này. Nếu bạn không yêu cầu tài khoản, hãy liên hệ quản trị viên.</p>
    </div>
  </div>`;

  return { subject: 'Thông tin tài khoản Hệ thống Quản lý Hồ sơ', text, html };
}

/**
 * Gửi email chào mừng kèm thông tin đăng nhập.
 * Không ném lỗi: trả về { sent, reason } để API tạo tài khoản vẫn thành công khi gửi mail thất bại.
 */
async function sendWelcomeEmail({ to, hoTen, username, password, role }) {
  if (!isMailConfigured()) {
    return { sent: false, reason: 'NOT_CONFIGURED' };
  }
  try {
    await getTransporter().sendMail({ from: MAIL_FROM, to, ...buildWelcomeEmail({ hoTen, username, password, role }) });
    return { sent: true };
  } catch (error) {
    // Không log nội dung thư (có mật khẩu), chỉ log lỗi kết nối/xác thực.
    console.error('[mail] Gửi email thất bại:', error.code || '', error.message);
    return { sent: false, reason: 'SEND_FAILED', message: error.message };
  }
}

/** Email đặt lại mật khẩu (link có hạn). */
async function sendPasswordResetEmail({ to, name, link, minutes }) {
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
    <div style="background:#140707;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
      <div style="font-size:18px;font-weight:bold">Hệ thống Quản lý Hồ sơ</div>
      <div style="font-size:13px;color:#f2734f;margin-top:4px">Đặt lại mật khẩu</div>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:0;padding:24px;border-radius:0 0 12px 12px">
      <p>Xin chào <strong>${escapeHtml(name)}</strong>,</p>
      <p>Có yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Bấm nút dưới đây để đặt mật khẩu mới (liên kết hết hạn sau ${minutes} phút):</p>
      <p style="text-align:center;margin:24px 0">
        <a href="${escapeHtml(link)}" style="background:#dc2626;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;display:inline-block">Đặt mật khẩu mới</a>
      </p>
      <p style="font-size:12px;color:#94a3b8">Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu hiện tại vẫn giữ nguyên.</p>
    </div>
  </div>`;
  const text = `Xin chào ${name},\nĐặt lại mật khẩu (hết hạn sau ${minutes} phút): ${link}\nNếu bạn không yêu cầu, hãy bỏ qua email này.`;
  await sendMail({ to, subject: 'Đặt lại mật khẩu — Hệ thống Quản lý Hồ sơ', html, text });
}

/** Gửi một email bất kỳ (ném lỗi nếu chưa cấu hình / gửi thất bại — người gọi tự xử lý). */
async function sendMail({ to, subject, html, text }) {
  if (!isMailConfigured()) throw new Error('Chưa cấu hình SMTP');
  await getTransporter().sendMail({ from: MAIL_FROM, to, subject, html, text });
}

module.exports = { isMailConfigured, sendWelcomeEmail, sendPasswordResetEmail, sendMail, escapeHtml, APP_URL };
