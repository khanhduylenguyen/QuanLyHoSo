import { clearSession, getToken } from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081/api';

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/**
 * Gọi API backend kèm `Authorization: Bearer <token>`.
 * Gặp 401 trên request cần đăng nhập thì xoá phiên và chuyển về /login.
 */
async function request(path, { method = 'GET', body, auth = true, responseType = 'json' } = {}) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers = { Accept: 'application/json' };
  // FormData: để trình duyệt tự đặt Content-Type (kèm boundary).
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';

  const token = auth ? getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, `Không kết nối được tới API (${API_BASE}). Backend đã chạy chưa?`);
  }

  if (responseType === 'blob' && response.ok) return response.blob();
  const payload = await response.json().catch(() => ({}));

  if (response.status === 401 && auth) {
    clearSession();
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.replace('/login?expired=1');
    }
  }
  if (!response.ok) {
    throw new ApiError(response.status, payload.message || `Lỗi HTTP ${response.status}`, payload.details);
  }
  return payload;
}

/** Bỏ tham số rỗng / undefined rồi ghép thành query string. */
const toSearchParams = (query = {}) =>
  new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== '')).toString();

export const api = {
  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: { username, password }, auth: false }),
  getMe: () => request('/auth/me'),
  changePassword: (currentPassword, newPassword) =>
    request('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }),
  forgotPassword: (identifier) => request('/auth/forgot', { method: 'POST', body: { identifier }, auth: false }),
  resetPassword: (token, password) =>
    request('/auth/reset-password', { method: 'POST', body: { token, password }, auth: false }),
  getMeta: () => request('/meta'),
  getCanBo: () => request('/users?role=CAN_BO'),
  // query: { q, quick, phanLoai, trangThai, canBo, sort, dir } (+ page, pageSize cho danh sách)
  listDossiers: (query) => request(`/dossiers?${toSearchParams(query)}`),
  getDossierIds: (query) => request(`/dossiers/ids?${toSearchParams(query)}`),
  getDossierStats: () => request('/dossiers/stats'),
  lookupDossier: (q) => request(`/dossiers/lookup?${toSearchParams({ q })}`),
  getDossier: (id) => request(`/dossiers/${id}`),
  createDossier: (body) => request('/dossiers', { method: 'POST', body }),
  updateDossier: (id, body) => request(`/dossiers/${id}`, { method: 'PUT', body }),
  deleteDossier: (id) => request(`/dossiers/${id}`, { method: 'DELETE' }),
  getDossierLogs: (id) => request(`/dossiers/${id}/logs`),
  getAttachments: (id) => request(`/dossiers/${id}/attachments`),
  uploadAttachment: (id, file, loai) => {
    const form = new FormData();
    form.append('loai', loai);
    form.append('file', file);
    return request(`/dossiers/${id}/attachments`, { method: 'POST', body: form });
  },
  downloadAttachment: (attachmentId) => request(`/attachments/${attachmentId}/download`, { responseType: 'blob' }),
  deleteAttachment: (attachmentId) => request(`/attachments/${attachmentId}`, { method: 'DELETE' }),
  bulkUpdate: (ids, changes, lyDo) => request('/dossiers/bulk', { method: 'POST', body: { ids, changes, lyDo } }),
  bulkDelete: (ids) => request('/dossiers/bulk-delete', { method: 'POST', body: { ids } }),

  // Xuất Excel & báo cáo
  exportDossiers: (ids) => request('/export/dossiers', { method: 'POST', body: { ids }, responseType: 'blob' }),
  exportDossiersByFilter: (filters) => request('/export/dossiers', { method: 'POST', body: { filters }, responseType: 'blob' }),
  reportSummary: (from, to) => request(`/reports/summary?from=${from}&to=${to}`),
  reportSummaryXlsx: (from, to) => request(`/reports/summary.xlsx?from=${from}&to=${to}`, { responseType: 'blob' }),
  reportMonthly: (year) => request(`/reports/monthly?year=${year}`),

  // Nhập hồ sơ từ Excel (ADMIN, VAN_THU)
  importPreview: (file) => {
    const form = new FormData();
    form.append('file', file);
    return request('/import/preview', { method: 'POST', body: form });
  },
  importCommit: (importId, options) => request(`/import/${importId}/commit`, { method: 'POST', body: options }),
  importBatches: () => request('/import/batches'),
  // confirm: số hồ sơ người dùng gõ lại (bắt buộc với lần nhập lớn).
  importUndo: (batchId, confirm) =>
    request(`/import/batches/${batchId}?${toSearchParams({ confirm })}`, { method: 'DELETE' }),
  importTemplate: () => request('/import/template', { responseType: 'blob' }),

  // Quản trị hệ thống (chỉ ADMIN)
  adminListUsers: () => request('/admin/users'),
  adminCreateUser: (body) => request('/admin/users', { method: 'POST', body }),
  adminUpdateUser: (id, body) => request(`/admin/users/${id}`, { method: 'PUT', body }),
  adminResetPassword: (id, password) => request(`/admin/users/${id}/password`, { method: 'PUT', body: { password } }),
  adminDeleteUser: (id) => request(`/admin/users/${id}`, { method: 'DELETE' }),
  adminGetPermissions: () => request('/admin/permissions'),
  adminGetDeadlineSettings: () => request('/admin/settings/deadlines'),
  adminSaveDeadlineSettings: (body) => request('/admin/settings/deadlines', { method: 'PUT', body }),
  adminGetReminderSettings: () => request('/admin/settings/reminders'),
  adminSaveReminderSettings: (body) => request('/admin/settings/reminders', { method: 'PUT', body }),
  adminRunReminders: (dryRun) => request('/admin/settings/reminders/run', { method: 'POST', body: { dryRun } }),
  adminRecalculateDeadlines: (dryRun) =>
    request('/admin/settings/deadlines/recalculate', { method: 'POST', body: { dryRun } }),
};
