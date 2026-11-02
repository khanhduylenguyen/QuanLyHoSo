'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { clearSession, getSession, saveSession } from '@/lib/auth';

/**
 * Bảo vệ trang cần đăng nhập.
 * - Chưa có phiên: chuyển về /login.
 * - Có phiên: hiện ngay user đã lưu, rồi gọi /auth/me lấy role mới nhất
 *   (token hết hạn / tài khoản bị khoá sẽ bị api.js tự đẩy về /login).
 * - `roles`: nếu truyền, user không thuộc các role này bị chuyển về trang chính.
 */
export function useAuth({ roles } = {}) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const rolesKey = roles?.join(',') ?? '';

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace('/login');
      return;
    }

    const allowed = (candidate) => !rolesKey || rolesKey.split(',').includes(candidate.role);
    // Mật khẩu do quản trị đặt: phải tự đổi trước khi dùng các trang khác.
    const mustChange = (candidate) => candidate.mustChangePassword && window.location.pathname !== '/account';
    if (mustChange(session.user)) {
      router.replace('/account?force=1');
      return;
    }
    if (!allowed(session.user)) {
      router.replace('/');
      return;
    }
    setUser(session.user);

    api
      .getMe()
      .then(({ data }) => {
        saveSession({ ...session, user: data });
        if (mustChange(data)) {
          router.replace('/account?force=1');
        } else if (allowed(data)) {
          setUser(data);
        } else {
          router.replace('/');
        }
      })
      .catch((meError) => setError(meError.message));
  }, [router, rolesKey]);

  const logout = useCallback(() => {
    clearSession();
    router.replace('/login');
  }, [router]);

  return { user, error, logout };
}
