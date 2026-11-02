'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  BellRing,
  CalendarCog,
  KeyRound,
  LoaderCircle,
  Lock,
  LockOpen,
  Pencil,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import UserBar from '@/components/UserBar';
import Toasts from '@/components/Toasts';
import UserFormModal from '@/components/admin/UserFormModal';
import ResetPasswordModal from '@/components/admin/ResetPasswordModal';
import PermissionMatrix from '@/components/admin/PermissionMatrix';
import DeadlineSettings from '@/components/admin/DeadlineSettings';
import ReminderSettings from '@/components/admin/ReminderSettings';
import { api } from '@/lib/api';
import { ROLE_LABELS, getUserName } from '@/lib/dossier';
import { useAuth } from '@/lib/useAuth';

const TOAST_DURATION_MS = 3200;
const TABS = [
  { id: 'accounts', label: 'Tài khoản', icon: Users },
  { id: 'permissions', label: 'Phân quyền', icon: ShieldCheck },
  { id: 'deadlines', label: 'Cấu hình hạn', icon: CalendarCog },
  { id: 'reminders', label: 'Nhắc hạn email', icon: BellRing },
];

const ROLE_BADGES = {
  ADMIN: 'bg-amber-50 text-amber-800 border-amber-200',
  VAN_THU: 'bg-sky-50 text-sky-800 border-sky-200',
  CAN_BO: 'bg-emerald-50 text-emerald-800 border-emerald-200',
};

const AVATAR_TONES = {
  ADMIN: 'bg-amber-500',
  VAN_THU: 'bg-sky-600',
  CAN_BO: 'bg-emerald-600',
};

/** Chữ cái đầu của từ đầu + từ cuối (bỏ ký tự không phải chữ, vd. "/"). */
const initialsOf = (user) => {
  const words = getUserName(user)
    .split(/\s+/)
    .filter((word) => /\p{L}/u.test(word));
  const picked = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return picked.map((word) => word.match(/\p{L}/u)[0]).join('').toUpperCase();
};

function StatCard({ label, value, tone = 'text-slate-900' }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function IconButton({ label, onClick, disabled, disabledReason, tone = 'hover:bg-indigo-100 hover:text-indigo-700', children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledReason : label}
      aria-label={label}
      className={`rounded-lg bg-slate-100 p-1.5 text-slate-600 transition disabled:cursor-not-allowed disabled:opacity-40 ${disabled ? '' : tone}`}
    >
      {children}
    </button>
  );
}

export default function SystemAdminPage() {
  const { user: currentUser, error: authError, logout } = useAuth({ roles: ['ADMIN'] });

  const [tab, setTab] = useState('accounts');
  const [users, setUsers] = useState([]);
  const [permissions, setPermissions] = useState(null);
  const [mailConfigured, setMailConfigured] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [formModal, setFormModal] = useState({ open: false, user: null });
  const [passwordModal, setPasswordModal] = useState({ open: false, user: null });
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);

  const pushToast = useCallback((message, type = 'info') => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), TOAST_DURATION_MS);
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, meta } = await api.adminListUsers();
      setUsers(data);
      setMailConfigured(meta?.mailConfigured ?? null);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const isAdmin = currentUser?.role === 'ADMIN';

  useEffect(() => {
    if (!isAdmin) return;
    loadUsers();
    api
      .adminGetPermissions()
      .then(({ data }) => setPermissions(data))
      .catch((error) => setLoadError(error.message));
  }, [isAdmin, loadUsers]);

  const stats = useMemo(
    () => ({
      total: users.length,
      admin: users.filter((user) => user.role === 'ADMIN').length,
      vanThu: users.filter((user) => user.role === 'VAN_THU').length,
      canBo: users.filter((user) => user.role === 'CAN_BO').length,
      locked: users.filter((user) => !user.isActive).length,
    }),
    [users]
  );

  const visibleUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return users.filter(
      (user) =>
        (roleFilter === 'ALL' || user.role === roleFilter) &&
        (statusFilter === 'ALL' || (statusFilter === 'ACTIVE') === user.isActive) &&
        (!keyword || `${user.username} ${user.hoTen ?? ''} ${user.email ?? ''}`.toLowerCase().includes(keyword))
    );
  }, [users, search, roleFilter, statusFilter]);

  const replaceUser = (updated) => setUsers((prev) => prev.map((user) => (user._id === updated._id ? updated : user)));

  /** Báo kết quả gửi email thông tin đăng nhập sau khi tạo tài khoản. */
  const notifyEmailResult = (email, user) => {
    if (!email || email.reason === 'SKIPPED') return;
    if (email.sent) {
      pushToast(`📧 Đã gửi thông tin đăng nhập tới ${user.email}`, 'success');
    } else if (email.reason === 'NOT_CONFIGURED') {
      pushToast('Chưa cấu hình SMTP nên chưa gửi được email — hãy tự gửi mật khẩu cho người dùng', 'amber');
    } else {
      pushToast(`Gửi email tới ${user.email} thất bại — hãy kiểm tra cấu hình SMTP và tự gửi mật khẩu`, 'error');
    }
  };

  const handleSaveUser = async (body) => {
    if (formModal.user) {
      const { data } = await api.adminUpdateUser(formModal.user._id, body);
      replaceUser(data);
      pushToast(`Đã cập nhật tài khoản @${data.username}`, 'success');
    } else {
      const { data, meta } = await api.adminCreateUser(body);
      setUsers((prev) => [...prev, data]);
      pushToast(`Đã tạo tài khoản @${data.username} (${ROLE_LABELS[data.role]})`, 'success');
      notifyEmailResult(meta?.email, data);
    }
    setFormModal({ open: false, user: null });
  };

  const handleResetPassword = async (password) => {
    const target = passwordModal.user;
    await api.adminResetPassword(target._id, password);
    setPasswordModal({ open: false, user: null });
    pushToast(`Đã đặt lại mật khẩu cho @${target.username}`, 'success');
  };

  const handleToggleActive = async (user) => {
    const nextActive = !user.isActive;
    if (!nextActive && !window.confirm(`Khoá tài khoản @${user.username}? Người này sẽ bị đăng xuất và không đăng nhập được.`)) {
      return;
    }
    try {
      const { data } = await api.adminUpdateUser(user._id, { isActive: nextActive });
      replaceUser(data);
      pushToast(`${nextActive ? 'Đã mở khoá' : 'Đã khoá'} tài khoản @${data.username}`, nextActive ? 'success' : 'amber');
    } catch (error) {
      pushToast(error.message, 'error');
    }
  };

  const handleDelete = async (user) => {
    if (!window.confirm(`Xoá vĩnh viễn tài khoản @${user.username}? Thao tác này không thể hoàn tác.`)) return;
    try {
      await api.adminDeleteUser(user._id);
      setUsers((prev) => prev.filter((item) => item._id !== user._id));
      pushToast(`Đã xoá tài khoản @${user.username}`, 'info');
    } catch (error) {
      pushToast(error.message, 'error');
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-sm text-slate-500">
        <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden />
        Đang kiểm tra quyền truy cập…
      </div>
    );
  }

  const errorMessage = loadError || authError;

  return (
    <>
      <UserBar user={currentUser} onLogout={logout} />

      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-5 px-4 py-5">
        <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5 lg:flex-row lg:items-center">
          <div className="flex items-start gap-3.5">
            <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
              <Settings className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">Quản trị hệ thống</h1>
              <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
                Quản lý tài khoản đăng nhập, gán vai trò và xem ma trận phân quyền của hệ thống
              </p>
            </div>
          </div>
          {tab === 'accounts' && (
            <button
              type="button"
              onClick={() => setFormModal({ open: true, user: null })}
              className="flex items-center gap-2 self-start rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 sm:text-sm lg:self-auto"
            >
              <UserPlus className="h-4 w-4" />
              Thêm tài khoản
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Tổng tài khoản" value={stats.total} />
          <StatCard label="Lãnh đạo / Admin" value={stats.admin} tone="text-amber-700" />
          <StatCard label="Văn thư" value={stats.vanThu} tone="text-sky-700" />
          <StatCard label="Cán bộ" value={stats.canBo} tone="text-emerald-700" />
          <StatCard label="Đang khoá" value={stats.locked} tone="text-rose-600" />
        </div>

        <div role="tablist" aria-label="Quản trị" className="flex flex-wrap gap-1 self-start rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                tab === id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {errorMessage && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
            {errorMessage}
          </div>
        )}

        {tab === 'permissions' ? (
          <PermissionMatrix data={permissions} />
        ) : tab === 'deadlines' ? (
          <DeadlineSettings pushToast={pushToast} />
        ) : tab === 'reminders' ? (
          <ReminderSettings pushToast={pushToast} />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-200 p-3.5">
              <div className="relative min-w-[220px] max-w-sm flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Tìm theo tên đăng nhập, họ tên, email…"
                  aria-label="Tìm tài khoản"
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <select
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
                aria-label="Lọc theo vai trò"
                className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">Tất cả vai trò</option>
                {Object.entries(ROLE_LABELS).map(([role, label]) => (
                  <option key={role} value={role}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                aria-label="Lọc theo trạng thái"
                className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="ACTIVE">Đang hoạt động</option>
                <option value="LOCKED">Đã khoá</option>
              </select>
              <button
                type="button"
                onClick={loadUsers}
                disabled={loading}
                title="Tải lại"
                aria-label="Tải lại danh sách tài khoản"
                className="ml-auto rounded-lg border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-800 text-xs uppercase tracking-wider text-slate-100">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Tài khoản</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Vai trò</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Trạng thái</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Hồ sơ thụ lý</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Ngày tạo</th>
                    <th scope="col" className="px-4 py-3 text-center font-semibold">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleUsers.map((user) => {
                    const isSelf = user._id === currentUser._id;
                    const selfReason = 'Không thể thao tác trên tài khoản đang đăng nhập';
                    return (
                      <tr key={user._id} className={`transition hover:bg-slate-50 ${user.isActive ? '' : 'bg-slate-50/70'}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                                user.isActive ? AVATAR_TONES[user.role] : 'bg-slate-400'
                              }`}
                              aria-hidden
                            >
                              {initialsOf(user)}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                                {getUserName(user)}
                                {isSelf && (
                                  <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-indigo-700">
                                    Bạn
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500">
                                <span className="font-mono">@{user.username}</span>
                                {user.email ? (
                                  <span className="ml-1.5 text-slate-400">· {user.email}</span>
                                ) : (
                                  <span className="ml-1.5 italic text-slate-300">· chưa có email</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded-lg border px-2.5 py-1 text-xs font-semibold ${ROLE_BADGES[user.role]}`}>
                            {ROLE_LABELS[user.role]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {user.isActive && !user.hasPassword ? (
                            <span
                              title="Chưa đặt mật khẩu nên chưa đăng nhập được — bấm Đặt lại mật khẩu"
                              className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800"
                            >
                              <KeyRound className="h-3 w-3" /> Chưa có mật khẩu
                            </span>
                          ) : user.isActive ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Hoạt động
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
                              <Lock className="h-3 w-3" /> Đã khoá
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-700">
                          {user.role === 'CAN_BO' ? user.dossierCount : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {user.createdAt ? format(parseISO(user.createdAt), 'dd/MM/yyyy') : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1.5">
                            <IconButton label={`Sửa tài khoản @${user.username}`} onClick={() => setFormModal({ open: true, user })}>
                              <Pencil className="h-4 w-4" />
                            </IconButton>
                            <IconButton
                              label={`Đặt lại mật khẩu cho @${user.username}`}
                              onClick={() => setPasswordModal({ open: true, user })}
                            >
                              <KeyRound className="h-4 w-4" />
                            </IconButton>
                            <IconButton
                              label={user.isActive ? `Khoá tài khoản @${user.username}` : `Mở khoá tài khoản @${user.username}`}
                              onClick={() => handleToggleActive(user)}
                              disabled={isSelf}
                              disabledReason={selfReason}
                              tone={user.isActive ? 'hover:bg-amber-100 hover:text-amber-700' : 'hover:bg-emerald-100 hover:text-emerald-700'}
                            >
                              {user.isActive ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
                            </IconButton>
                            <IconButton
                              label={`Xoá tài khoản @${user.username}`}
                              onClick={() => handleDelete(user)}
                              disabled={isSelf}
                              disabledReason={selfReason}
                              tone="hover:bg-rose-100 hover:text-rose-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {visibleUsers.length === 0 && !loading && (
                <p className="px-4 py-12 text-center text-sm text-slate-500">Không có tài khoản nào khớp bộ lọc.</p>
              )}
            </div>

            <div className="border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
              Hiển thị <strong>{visibleUsers.length}</strong> / {users.length} tài khoản. Cán bộ còn hồ sơ thụ lý cần được
              phân công lại hồ sơ trước khi đổi vai trò hoặc xoá.
            </div>
          </div>
        )}
      </main>

      <UserFormModal
        open={formModal.open}
        user={formModal.user}
        isSelf={formModal.user?._id === currentUser._id}
        mailConfigured={mailConfigured}
        onClose={() => setFormModal({ open: false, user: null })}
        onSubmit={handleSaveUser}
      />
      <ResetPasswordModal
        open={passwordModal.open}
        user={passwordModal.user}
        onClose={() => setPasswordModal({ open: false, user: null })}
        onSubmit={handleResetPassword}
      />
      <Toasts items={toasts} />
    </>
  );
}
