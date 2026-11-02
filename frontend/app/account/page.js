'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, KeyRound, Loader2, ShieldAlert } from 'lucide-react';
import UserBar from '@/components/UserBar';
import PasswordField, { PASSWORD_MIN_LENGTH } from '@/components/admin/PasswordField';
import { api } from '@/lib/api';
import { getSession, saveSession } from '@/lib/auth';
import { useAuth } from '@/lib/useAuth';

/** Trang tài khoản: tự đổi mật khẩu (bắt buộc ở lần đăng nhập đầu khi mật khẩu do quản trị đặt). */
export default function AccountPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [forced, setForced] = useState(false);

  useEffect(() => {
    setForced(new URLSearchParams(window.location.search).has('force'));
  }, []);

  if (!user) return null;
  const mustChange = forced || user.mustChangePassword;

  const validationError =
    next && next.length < PASSWORD_MIN_LENGTH
      ? `Mật khẩu mới phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự`
      : confirm && next !== confirm
        ? 'Nhập lại mật khẩu không khớp'
        : next && next === current
          ? 'Mật khẩu mới phải khác mật khẩu hiện tại'
          : '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (validationError) return;
    setSaving(true);
    setError('');
    try {
      const { data } = await api.changePassword(current, next);
      // Token cũ hết hiệu lực sau khi đổi mật khẩu → lưu token mới, giữ lựa chọn "ghi nhớ".
      saveSession({ ...getSession(), token: data.token, user: data.user });
      setDone(true);
      setCurrent('');
      setNext('');
      setConfirm('');
      if (mustChange) setTimeout(() => router.replace('/'), 1200);
    } catch (changeError) {
      setError(changeError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      {!user.mustChangePassword && <UserBar user={user} onLogout={logout} />}

      <main className="mx-auto max-w-md px-4 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <KeyRound className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Đổi mật khẩu</h1>
              <p className="text-xs text-slate-500">
                {user.hoTen || user.username} · @{user.username}
              </p>
            </div>
          </div>

          {user.mustChangePassword && (
            <div className="mt-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>Mật khẩu của bạn do quản trị viên cấp. Vui lòng đặt mật khẩu riêng trước khi tiếp tục sử dụng hệ thống.</span>
            </div>
          )}
          {done && (
            <div role="status" className="mt-5 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>Đã đổi mật khẩu. Các phiên đăng nhập khác đã bị đăng xuất.</span>
            </div>
          )}
          {error && (
            <div role="alert" className="mt-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4 text-sm">
            <PasswordField
              id="current-password"
              label="Mật khẩu hiện tại"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
            <PasswordField id="new-password" label="Mật khẩu mới" value={next} onChange={(e) => setNext(e.target.value)} required />
            <PasswordField
              id="confirm-password"
              label="Nhập lại mật khẩu mới"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
            {validationError && <p className="text-xs font-medium text-red-600">{validationError}</p>}

            <div className="flex items-center justify-between gap-3 pt-2">
              {user.mustChangePassword ? (
                <button type="button" onClick={logout} className="text-sm font-medium text-slate-500 hover:underline">
                  Đăng xuất
                </button>
              ) : (
                <span />
              )}
              <button
                type="submit"
                disabled={saving || !current || !next || !confirm || Boolean(validationError)}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Lưu mật khẩu mới
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
