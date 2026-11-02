'use client';

import { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';

export const PASSWORD_MIN_LENGTH = 6;

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** Sinh mật khẩu ngẫu nhiên dễ đọc (bỏ các ký tự dễ nhầm như 0/O, 1/l). */
export function generatePassword(length = 10) {
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => PASSWORD_ALPHABET[value % PASSWORD_ALPHABET.length]).join('');
}

/** Ô mật khẩu có icon khoá và nút hiện/ẩn. */
export default function PasswordField({ id, label, value, onChange, autoComplete = 'new-password', ...rest }) {
  const [visible, setVisible] = useState(false);
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1 block font-semibold text-slate-700">{label}</span>
      <div className="relative">
        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-10 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((prev) => !prev)}
          aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </label>
  );
}
