// Lưu phiên đăng nhập (JWT + thông tin user) trong trình duyệt.
// - "Ghi nhớ đăng nhập": localStorage (còn sau khi đóng trình duyệt)
// - Không ghi nhớ:       sessionStorage (mất khi đóng tab)
// Mọi truy cập đều bọc try/catch vì storage có thể bị chặn (chế độ ẩn danh, chính sách trình duyệt).

const STORAGE_KEY = 'qlhs.session';

const stores = () => (typeof window === 'undefined' ? [] : [window.localStorage, window.sessionStorage]);

export function getSession() {
  for (const store of stores()) {
    try {
      const raw = store.getItem(STORAGE_KEY);
      const session = raw ? JSON.parse(raw) : null;
      if (session?.token && session?.user) return session;
    } catch {
      // Thử store tiếp theo.
    }
  }
  return null;
}

/** `session.remember` quyết định lưu ở localStorage hay sessionStorage. */
export function saveSession(session) {
  clearSession();
  try {
    const store = session.remember ? window.localStorage : window.sessionStorage;
    store.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Không lưu được thì phiên chỉ sống đến khi tải lại trang.
  }
}

export function clearSession() {
  for (const store of stores()) {
    try {
      store.removeItem(STORAGE_KEY);
    } catch {
      // Bỏ qua: không có gì để xoá.
    }
  }
}

export const getToken = () => getSession()?.token ?? null;
