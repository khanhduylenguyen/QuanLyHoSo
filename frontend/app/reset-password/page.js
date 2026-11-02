'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from 'lucide-react';
import PasswordField, { PASSWORD_MIN_LENGTH } from '@/components/admin/PasswordField';
import { api } from '@/lib/api';
import { clearSession } from '@/lib/auth';

/** Trang mở từ link trong email "Quên mật khẩu" (?token=...). */
export default function ResetPasswordPage() {
  const [token, setToken] = useState(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') || '');
  }, []);

  const validationError =
    password && password.length < PASSWORD_MIN_LENGTH
      ? `Mật khẩu phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự`
      : confirm && password !== confirm
        ? 'Nhập lại mật khẩu không khớp'
        : '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (validationError) return;
    setSaving(true);
    setError('');
    try {
      await api.resetPassword(token, password);
      clearSession();
      setDone(true);
    } catch (resetError) {
      setError(resetError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#140707] px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
            <KeyRound className="h-5 w-5" />
          </span>
          <h1 className="text-lg font-bold text-slate-900">Đặt mật khẩu mới</h1>
        </div>

        {token === '' && (
          <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
            Liên kết không hợp lệ. Vui lòng mở đúng liên kết trong email hoặc gửi lại yêu cầu ở trang đăng nhập.
          </p>
        )}

        {done ? (
          <div className="mt-5 space-y-4">
            <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>Đã đặt mật khẩu mới. Bạn có thể đăng nhập bằng mật khẩu này.</span>
            </div>
            <Link href="/login" className="block rounded-lg bg-red-600 py-2.5 text-center text-sm font-bold text-white hover:bg-red-700">
              Đến trang đăng nhập
            </Link>
          </div>
        ) : (
          token && (
            <form onSubmit={handleSubmit} className="mt-5 space-y-4 text-sm">
              {error && (
                <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>{error}</span>
                </div>
              )}
              <PasswordField id="new-password" label="Mật khẩu mới" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <PasswordField
                id="confirm-password"
                label="Nhập lại mật khẩu mới"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
              {validationError && <p className="text-xs font-medium text-red-600">{validationError}</p>}
              <button
                type="submit"
                disabled={saving || !password || !confirm || Boolean(validationError)}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 py-2.5 font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Lưu mật khẩu mới
              </button>
              <Link href="/login" className="block text-center text-slate-500 hover:underline">
                ← Quay lại đăng nhập
              </Link>
            </form>
          )
        )}
      </div>
    </main>
  );
}
