'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, Eye, EyeOff, Info, Loader2, Lock, User } from 'lucide-react';
import { api } from '@/lib/api';
import { getSession, saveSession } from '@/lib/auth';

// Các điểm nổi bật của hệ thống (đều là tính năng có thật trong app).
const HIGHLIGHTS = [
  { value: '3', label: 'Vai trò phân quyền' },
  { value: 'Auto', label: 'Tính hạn xử lý' },
  { value: '7 ngày', label: 'Cảnh báo sớm' },
];

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-slate-50 py-3 pl-10 text-sm text-slate-900 placeholder:text-slate-400 ' +
  'transition duration-200 focus:border-red-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-red-100 ' +
  'disabled:cursor-not-allowed disabled:opacity-70';

/** Panel giới thiệu bên trái (ẩn trên màn hình nhỏ). */
function HeroPanel() {
  return (
    <section className="relative hidden flex-1 items-center justify-center overflow-hidden bg-[#140707] px-12 lg:flex">
      {/* Quầng sáng đỏ/cam ở hai góc */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 -top-40 h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle,rgba(220,38,38,0.35),transparent_65%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -left-48 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(234,88,12,0.22),transparent_65%)]"
      />

      <div className="relative max-w-md">
        <h1 className="text-4xl font-bold leading-tight tracking-tight text-white">
          Hệ thống quản lý
          <span className="block text-[#f2734f]">hồ sơ &amp; hạn xử lý</span>
        </h1>
        <p className="mt-5 text-[15px] leading-relaxed text-white/60">
          Tiếp nhận hồ sơ, phân công cán bộ thụ lý và theo dõi hạn trình lãnh đạo — toàn bộ trong một nền tảng thống
          nhất.
        </p>

        <dl className="mt-10 flex gap-10">
          {HIGHLIGHTS.map((item) => (
            <div key={item.label}>
              <dt className="sr-only">{item.label}</dt>
              <dd className="text-2xl font-bold text-[#f2734f]">{item.value}</dd>
              <dd className="mt-0.5 text-xs text-white/50">{item.label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function Alert({ tone, icon: Icon, message }) {
  if (!message) return null;
  const styles =
    tone === 'error' ? 'border-red-200 bg-red-50 text-red-600' : 'border-sky-200 bg-sky-50 text-sky-700';
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-lg border px-3.5 py-3 text-sm ${styles}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Đã đăng nhập thì vào thẳng trang chính; bị đá ra do token hết hạn thì báo cho người dùng.
  useEffect(() => {
    if (getSession()) {
      router.replace('/');
      return;
    }
    if (new URLSearchParams(window.location.search).has('expired')) {
      setNotice('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
    }
  }, [router]);

  /** Gõ lại vào ô nào thì ẩn lỗi cũ để người dùng biết đang thử lại. */
  const handleChange = (setter) => (event) => {
    setter(event.target.value);
    if (error) setError('');
  };

  const [forgotMode, setForgotMode] = useState(false);

  /** Quên mật khẩu: gửi link đặt lại tới email của tài khoản (nhập tên đăng nhập hoặc email). */
  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setIsLoading(true);
    try {
      const { data } = await api.forgotPassword(username.trim());
      setNotice(data.message);
      setForgotMode(false);
    } catch (forgotError) {
      setError(forgotError.message || 'Không gửi được yêu cầu');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleForgot = () => {
    setForgotMode((prev) => !prev);
    setError('');
    setNotice('');
  };

  /** Submit form: gọi POST /api/auth/login, lưu JWT rồi chuyển sang trang chính. */
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setIsLoading(true);

    try {
      const { data } = await api.login(username.trim(), password);
      saveSession({ token: data.token, user: data.user, remember });
      router.replace(data.user.mustChangePassword ? '/account?force=1' : '/');
      // Giữ trạng thái loading cho tới khi trang chính hiện lên.
    } catch (loginError) {
      setError(loginError.message || 'Đăng nhập thất bại');
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen bg-[#140707] lg:bg-white">
      <HeroPanel />

      <section className="flex w-full items-center justify-center bg-white px-6 py-12 sm:px-10 lg:w-[460px] lg:shrink-0 lg:shadow-[-24px_0_60px_-30px_rgba(0,0,0,0.6)]">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">{forgotMode ? 'Quên mật khẩu' : 'Đăng nhập'}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {forgotMode
              ? 'Nhập tên đăng nhập hoặc email, hệ thống sẽ gửi liên kết đặt lại mật khẩu vào email của bạn'
              : 'Nhập tài khoản để truy cập hệ thống quản lý hồ sơ'}
          </p>

          {forgotMode ? (
            <form onSubmit={handleForgotPassword} className="mt-8 space-y-5" noValidate>
              <Alert tone="error" icon={AlertCircle} message={error} />
              <div>
                <label htmlFor="identifier" className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Tên đăng nhập hoặc email
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                  <input
                    id="identifier"
                    type="text"
                    autoComplete="username"
                    autoFocus
                    value={username}
                    onChange={handleChange(setUsername)}
                    disabled={isLoading}
                    placeholder="vd. canbo_a hoặc ten@gmail.com"
                    className={`${inputClass} pr-3`}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isLoading || !username.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 py-3 text-sm font-bold text-white shadow-lg shadow-red-600/25 transition hover:bg-red-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Gửi liên kết đặt lại
              </button>
              <button
                type="button"
                onClick={toggleForgot}
                className="w-full text-center text-sm font-medium text-slate-500 hover:text-slate-700 hover:underline"
              >
                ← Quay lại đăng nhập
              </button>
            </form>
          ) : (
          <form onSubmit={handleLogin} className="mt-8 space-y-5" noValidate>
            <Alert tone="info" icon={Info} message={notice} />
            <Alert tone="error" icon={AlertCircle} message={error} />

            {/* Tên đăng nhập */}
            <div>
              <label htmlFor="username" className="mb-1.5 block text-xs font-semibold text-slate-700">
                Tên đăng nhập
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  required
                  value={username}
                  onChange={handleChange(setUsername)}
                  disabled={isLoading}
                  placeholder="Nhập tên đăng nhập"
                  aria-invalid={Boolean(error)}
                  className={`${inputClass} pr-3`}
                />
              </div>
            </div>

            {/* Mật khẩu + nút hiện/ẩn */}
            <div>
              <label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-slate-700">
                Mật khẩu
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={handleChange(setPassword)}
                  disabled={isLoading}
                  placeholder="Nhập mật khẩu"
                  aria-invalid={Boolean(error)}
                  className={`${inputClass} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  aria-pressed={showPassword}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Ghi nhớ + Quên mật khẩu */}
            <div className="flex items-center justify-between text-sm">
              <label className="flex cursor-pointer select-none items-center gap-2 text-slate-600">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  disabled={isLoading}
                  className="h-4 w-4 rounded border-slate-300 accent-red-600"
                />
                Ghi nhớ đăng nhập
              </label>
              <button
                type="button"
                onClick={toggleForgot}
                className="font-medium text-red-600 transition hover:text-red-700 hover:underline focus:outline-none focus-visible:underline"
              >
                Quên mật khẩu?
              </button>
            </div>

            {/* Nút đăng nhập */}
            <button
              type="submit"
              disabled={isLoading || !username || !password}
              className="group flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 py-3 text-sm font-bold text-white shadow-lg shadow-red-600/25 transition duration-200 hover:bg-red-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Đang xử lý...
                </>
              ) : (
                <>
                  Đăng nhập hệ thống
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
                </>
              )}
            </button>
          </form>
          )}
        </div>
      </section>
    </main>
  );
}
