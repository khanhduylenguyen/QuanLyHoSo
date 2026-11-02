/**
 * Giới hạn số lần thử trong một khoảng thời gian (bộ nhớ trong — khởi động lại server thì đếm lại).
 * Dùng cho đăng nhập sai, quên mật khẩu, đặt lại mật khẩu.
 */
const { HttpError } = require('./http');

class AttemptLimiter {
  /**
   * @param {object} opts
   *   - max: số lần tối đa trong cửa sổ
   *   - windowMs: độ dài cửa sổ đếm
   *   - lockMs: thời gian khoá khi vượt quá
   */
  constructor({ max, windowMs, lockMs }) {
    this.max = max;
    this.windowMs = windowMs;
    this.lockMs = lockMs;
    this.entries = new Map();
    // Dọn mục hết hạn định kỳ để Map không phình mãi.
    setInterval(() => this.prune(), 10 * 60 * 1000).unref();
  }

  prune(now = Date.now()) {
    for (const [key, entry] of this.entries) {
      if (entry.lockedUntil < now && now - entry.firstAt > this.windowMs) this.entries.delete(key);
    }
  }

  /** Ném 429 nếu khoá đang bị khoá. */
  assertAllowed(key, message) {
    const entry = this.entries.get(key);
    const now = Date.now();
    if (entry && entry.lockedUntil > now) {
      const minutes = Math.ceil((entry.lockedUntil - now) / 60000);
      throw new HttpError(429, `${message} Vui lòng thử lại sau ${minutes} phút.`);
    }
  }

  /** Ghi nhận một lần (sai). Trả về số lần còn lại trước khi bị khoá. */
  hit(key) {
    const now = Date.now();
    let entry = this.entries.get(key);
    if (!entry || now - entry.firstAt > this.windowMs) entry = { count: 0, firstAt: now, lockedUntil: 0 };
    entry.count++;
    if (entry.count >= this.max) {
      entry.lockedUntil = now + this.lockMs;
      entry.count = 0;
      entry.firstAt = now;
    }
    this.entries.set(key, entry);
    return entry.lockedUntil > now ? 0 : this.max - entry.count;
  }

  reset(key) {
    this.entries.delete(key);
  }
}

const MINUTE = 60 * 1000;

// Đăng nhập sai: theo tài khoản (5 lần / 15 phút → khoá 15 phút) và theo IP (20 lần / 15 phút).
const loginByUser = new AttemptLimiter({ max: 5, windowMs: 15 * MINUTE, lockMs: 15 * MINUTE });
const loginByIp = new AttemptLimiter({ max: 20, windowMs: 15 * MINUTE, lockMs: 15 * MINUTE });
// Quên / đặt lại mật khẩu: theo IP (5 yêu cầu / giờ).
const passwordResetByIp = new AttemptLimiter({ max: 5, windowMs: 60 * MINUTE, lockMs: 60 * MINUTE });

module.exports = { AttemptLimiter, loginByUser, loginByIp, passwordResetByIp };
