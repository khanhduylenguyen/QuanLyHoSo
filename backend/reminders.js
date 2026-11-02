/**
 * Nhắc hạn qua email mỗi ngày.
 * - Mỗi cán bộ (đang hoạt động, có email): danh sách hồ sơ của mình đã quá hạn và sắp đến hạn (≤ N ngày).
 * - Quản trị (ADMIN có email): bảng tổng hợp theo cán bộ + hồ sơ quá hạn lâu nhất.
 * Bộ hẹn giờ kiểm tra mỗi phút, chạy một lần/ngày khi tới giờ cấu hình (giờ Việt Nam).
 */
const { User, Dossier } = require('./models');
const { PHAN_LOAI_RULES } = require('./catalog');
const { getSettings, saveSettings, todayVN } = require('./settings');
const { isMailConfigured, sendMail, escapeHtml, APP_URL } = require('./mailer');

const CHECK_INTERVAL_MS = 60 * 1000;
const MAX_ROWS_PER_EMAIL = 50;
const VN_OFFSET_MS = 7 * 3600 * 1000;

const day = (value) => new Date(value).toISOString().slice(0, 10);
const fmt = (isoDay) => isoDay.split('-').reverse().join('/');
const daysUntil = (dueDay, today) => Math.round((Date.parse(dueDay) - Date.parse(today)) / 86400000);
const typeName = (code) => PHAN_LOAI_RULES[code]?.moTa ?? code;

/** Giờ hiện tại theo giờ Việt Nam dạng "HH:MM". */
function nowVNTime(now = new Date()) {
  const local = new Date(now.getTime() + VN_OFFSET_MS);
  return `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`;
}

function dossierRows(items, today) {
  return items
    .slice(0, MAX_ROWS_PER_EMAIL)
    .map((d) => {
      const left = daysUntil(day(d.ngayHetHan), today);
      const state = left < 0 ? `<b style="color:#dc2626">Quá hạn ${-left} ngày</b>` : left === 0 ? '<b style="color:#c2410c">Hết hạn hôm nay</b>' : `Còn ${left} ngày`;
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-family:monospace">${escapeHtml(d.maHoSo)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">${escapeHtml(d.tenHoSo)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">${escapeHtml(typeName(d.phanLoai))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">${fmt(day(d.ngayHetHan))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">${state}</td>
      </tr>`;
    })
    .join('');
}

const table = (rows) =>
  `<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#1e293b;color:#fff;text-align:left">
    <th style="padding:6px 8px">Mã HS</th><th style="padding:6px 8px">Tên hồ sơ</th><th style="padding:6px 8px">Loại</th>
    <th style="padding:6px 8px">Hạn xử lý</th><th style="padding:6px 8px">Tình trạng</th></tr></thead><tbody>${rows}</tbody></table>`;

const wrap = (title, body) => `<div style="font-family:Arial,Helvetica,sans-serif;max-width:760px;margin:0 auto;color:#0f172a">
  <div style="background:#140707;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0">
    <div style="font-size:16px;font-weight:bold">Hệ thống Quản lý Hồ sơ</div>
    <div style="font-size:13px;color:#f2734f;margin-top:2px">${escapeHtml(title)}</div>
  </div>
  <div style="border:1px solid #e2e8f0;border-top:0;padding:20px;border-radius:0 0 12px 12px">${body}
    <p style="margin-top:20px"><a href="${escapeHtml(APP_URL)}" style="background:#dc2626;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold">Mở hệ thống</a></p>
  </div></div>`;

function officerEmail(officer, overdue, dueSoon, today, daysAhead) {
  const sections = [];
  if (overdue.length) {
    sections.push(`<h3 style="color:#dc2626;margin:16px 0 8px">⚠ ${overdue.length} hồ sơ đã quá hạn</h3>${table(dossierRows(overdue, today))}`);
  }
  if (dueSoon.length) {
    sections.push(`<h3 style="color:#b45309;margin:16px 0 8px">📅 ${dueSoon.length} hồ sơ đến hạn trong ${daysAhead} ngày tới</h3>${table(dossierRows(dueSoon, today))}`);
  }
  const more = overdue.length > MAX_ROWS_PER_EMAIL || dueSoon.length > MAX_ROWS_PER_EMAIL ? `<p style="color:#64748b">(Mỗi mục hiển thị tối đa ${MAX_ROWS_PER_EMAIL} hồ sơ — xem đủ trong hệ thống.)</p>` : '';
  const html = wrap(`Nhắc hạn ngày ${fmt(today)}`, `<p>Chào <b>${escapeHtml(officer.hoTen || officer.username)}</b>,</p><p>Danh sách hồ sơ bạn đang thụ lý cần chú ý:</p>${sections.join('')}${more}`);
  const text = [
    `Chào ${officer.hoTen || officer.username},`,
    overdue.length ? `- ${overdue.length} hồ sơ đã quá hạn` : null,
    dueSoon.length ? `- ${dueSoon.length} hồ sơ đến hạn trong ${daysAhead} ngày tới` : null,
    `Xem chi tiết: ${APP_URL}`,
  ]
    .filter(Boolean)
    .join('\n');
  return { subject: `[Nhắc hạn] ${overdue.length} quá hạn, ${dueSoon.length} sắp đến hạn — ${fmt(today)}`, html, text };
}

function summaryEmail(perOfficer, unassigned, oldest, today, daysAhead) {
  const rows = perOfficer
    .filter((o) => o.overdue.length || o.dueSoon.length)
    .sort((a, b) => b.overdue.length - a.overdue.length)
    .map(
      (o) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">${escapeHtml(o.officer.hoTen || o.officer.username)}${o.officer.email ? '' : ' <span style="color:#94a3b8">(chưa có email)</span>'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;color:#dc2626;font-weight:bold">${o.overdue.length}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right">${o.dueSoon.length}</td></tr>`
    )
    .join('');
  const totalOverdue = perOfficer.reduce((s, o) => s + o.overdue.length, 0) + unassigned.overdue.length;
  const totalSoon = perOfficer.reduce((s, o) => s + o.dueSoon.length, 0) + unassigned.dueSoon.length;
  const body = `<p>Tổng hợp ngày <b>${fmt(today)}</b>: <b style="color:#dc2626">${totalOverdue}</b> hồ sơ quá hạn, <b>${totalSoon}</b> hồ sơ đến hạn trong ${daysAhead} ngày tới${
    unassigned.overdue.length + unassigned.dueSoon.length ? ` (trong đó ${unassigned.overdue.length + unassigned.dueSoon.length} hồ sơ chưa phân công)` : ''
  }.</p>
  <table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#1e293b;color:#fff;text-align:left">
    <th style="padding:6px 8px">Cán bộ</th><th style="padding:6px 8px;text-align:right">Quá hạn</th><th style="padding:6px 8px;text-align:right">Sắp đến hạn</th></tr></thead><tbody>${rows}</tbody></table>
  ${oldest.length ? `<h3 style="margin:16px 0 8px">Quá hạn lâu nhất</h3>${table(dossierRows(oldest, today))}` : ''}`;
  return {
    subject: `[Tổng hợp] ${totalOverdue} hồ sơ quá hạn, ${totalSoon} sắp đến hạn — ${fmt(today)}`,
    html: wrap('Tổng hợp tình hình hạn xử lý', body),
    text: `Tổng hợp ${fmt(today)}: ${totalOverdue} quá hạn, ${totalSoon} sắp đến hạn. ${APP_URL}`,
  };
}

/**
 * Chạy nhắc hạn. dryRun = chỉ tính danh sách người nhận, không gửi.
 * Trả về thống kê để hiển thị trong trang quản trị.
 */
async function runReminders({ dryRun = false } = {}) {
  const config = getSettings('reminders');
  const today = day(todayVN());
  const limit = Date.parse(today) + config.daysAhead * 86400000;

  const open = await Dossier.find({ trangThai: { $ne: 'HOAN_THANH' }, ngayHetHan: { $ne: null } })
    .select('maHoSo tenHoSo phanLoai ngayHetHan canBoThuLy')
    .sort({ ngayHetHan: 1 })
    .lean();
  const officers = await User.find({ role: 'CAN_BO', isActive: { $ne: false } }).select('username hoTen email').lean();
  const admins = await User.find({ role: 'ADMIN', isActive: { $ne: false }, email: { $exists: true, $ne: null } }).select('username hoTen email').lean();

  const split = (items) => ({
    overdue: config.includeOverdue ? items.filter((d) => day(d.ngayHetHan) < today) : [],
    dueSoon: items.filter((d) => day(d.ngayHetHan) >= today && Date.parse(day(d.ngayHetHan)) <= limit),
  });
  const perOfficer = officers.map((officer) => ({ officer, ...split(open.filter((d) => String(d.canBoThuLy) === String(officer._id))) }));
  const unassigned = split(open.filter((d) => !d.canBoThuLy));

  const recipients = [];
  const errors = [];
  for (const entry of perOfficer) {
    if (!entry.overdue.length && !entry.dueSoon.length) continue;
    const item = { name: entry.officer.hoTen || entry.officer.username, email: entry.officer.email ?? null, overdue: entry.overdue.length, dueSoon: entry.dueSoon.length, kind: 'officer' };
    recipients.push(item);
    if (dryRun || !entry.officer.email) continue;
    try {
      await sendMail({ to: entry.officer.email, ...officerEmail(entry.officer, entry.overdue, entry.dueSoon, today, config.daysAhead) });
      item.sent = true;
    } catch (error) {
      errors.push(`${item.name}: ${error.message}`);
    }
  }

  if (config.sendSummaryToAdmins) {
    const oldest = open.filter((d) => day(d.ngayHetHan) < today).slice(0, 15);
    const message = summaryEmail(perOfficer, unassigned, oldest, today, config.daysAhead);
    for (const admin of admins) {
      const item = { name: admin.hoTen || admin.username, email: admin.email, kind: 'admin' };
      recipients.push(item);
      if (dryRun) continue;
      try {
        await sendMail({ to: admin.email, ...message });
        item.sent = true;
      } catch (error) {
        errors.push(`${item.name}: ${error.message}`);
      }
    }
  }

  return {
    date: today,
    dryRun,
    mailConfigured: isMailConfigured(),
    recipients,
    sent: recipients.filter((r) => r.sent).length,
    officersWithoutEmail: recipients.filter((r) => r.kind === 'officer' && !r.email).length,
    unassigned: { overdue: unassigned.overdue.length, dueSoon: unassigned.dueSoon.length },
    errors,
  };
}

let running = false;

/**
 * Gửi nhắc hạn nếu đã tới giờ và hôm nay chưa gửi (tối đa một lần / ngày, ghi ở settings.lastRunDate).
 * Dùng chung cho bộ hẹn giờ trong server và API /api/cron/reminders (dịch vụ cron bên ngoài gọi,
 * cần khi host "ngủ" lúc không có người dùng, vd. Render gói free).
 */
async function runDueReminders() {
  const config = getSettings('reminders');
  const today = day(todayVN());
  if (running) return { skipped: 'RUNNING' };
  if (!config.enabled) return { skipped: 'DISABLED' };
  if (!isMailConfigured()) return { skipped: 'MAIL_NOT_CONFIGURED' };
  if (config.lastRunDate === today) return { skipped: 'ALREADY_SENT_TODAY' };
  if (nowVNTime() < config.sendTime) return { skipped: 'BEFORE_SEND_TIME', sendTime: config.sendTime };
  running = true;
  try {
    // Ghi ngày chạy trước để không gửi trùng nếu server khởi động lại giữa chừng.
    await saveSettings('reminders', { ...config, lastRunDate: today });
    const result = await runReminders();
    console.log(`[reminders] ${today}: gửi ${result.sent} email${result.errors.length ? `, lỗi ${result.errors.length}` : ''}`);
    return { sent: result.sent, errors: result.errors.length };
  } finally {
    running = false;
  }
}

/** Bộ hẹn giờ: mỗi phút kiểm tra, tới giờ thì chạy một lần trong ngày. */
function startReminderScheduler() {
  const tick = () => runDueReminders().catch((error) => console.error('[reminders] Lỗi:', error.message));
  const timer = setInterval(tick, CHECK_INTERVAL_MS);
  timer.unref();
  return timer;
}

function validateReminderSettings(input) {
  const errors = [];
  const sendTime = String(input?.sendTime ?? '');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(sendTime)) errors.push('Giờ gửi phải dạng HH:MM (00:00–23:59)');
  const daysAhead = Number(input?.daysAhead);
  if (!Number.isInteger(daysAhead) || daysAhead < 0 || daysAhead > 30) errors.push('Số ngày báo trước phải là số nguyên 0–30');
  return {
    errors,
    value: {
      enabled: Boolean(input?.enabled),
      sendTime,
      daysAhead,
      includeOverdue: input?.includeOverdue !== false,
      sendSummaryToAdmins: input?.sendSummaryToAdmins !== false,
    },
  };
}

module.exports = { runReminders, runDueReminders, startReminderScheduler, validateReminderSettings };
