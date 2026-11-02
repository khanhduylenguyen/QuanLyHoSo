'use client';

import { useEffect, useState } from 'react';
import { KeyRound, Wand2 } from 'lucide-react';
import Modal from '@/components/admin/Modal';
import PasswordField, { PASSWORD_MIN_LENGTH, generatePassword } from '@/components/admin/PasswordField';
import { getUserName } from '@/lib/dossier';

/** Quản trị đặt mật khẩu mới cho một tài khoản. */
export default function ResetPasswordModal({ open, user, onClose, onSubmit }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPassword('');
    setConfirm('');
    setError(null);
  }, [open]);

  const fillRandomPassword = () => {
    const generated = generatePassword();
    setPassword(generated);
    setConfirm(generated);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Mật khẩu phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự`);
      return;
    }
    if (password !== confirm) {
      setError('Mật khẩu nhập lại không khớp');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(password);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={KeyRound}
      title="Đặt lại mật khẩu"
      subtitle={`${getUserName(user)} (@${user.username})`}
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 p-6 text-sm" noValidate>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={fillRandomPassword}
            className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
          >
            <Wand2 className="h-3.5 w-3.5" /> Tạo ngẫu nhiên
          </button>
        </div>
        <PasswordField id="reset-password" label="Mật khẩu mới" value={password} onChange={(e) => setPassword(e.target.value)} />
        <PasswordField id="reset-confirm" label="Nhập lại mật khẩu mới" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <p className="text-[11px] text-slate-500">
          Mật khẩu cũ sẽ không dùng được nữa và người này sẽ bị đăng xuất khỏi mọi thiết bị.
        </p>

        {error && (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2.5 border-t border-slate-200 pt-4">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">
            Hủy bỏ
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            <KeyRound className="h-4 w-4" />
            {submitting ? 'Đang lưu…' : 'Đặt mật khẩu'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
