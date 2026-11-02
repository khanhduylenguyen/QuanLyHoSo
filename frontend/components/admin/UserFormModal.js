'use client';

import { useEffect, useState } from 'react';
import { Mail, Save, TriangleAlert, UserPen, UserPlus, Wand2 } from 'lucide-react';
import Modal from '@/components/admin/Modal';
import PasswordField, { PASSWORD_MIN_LENGTH, generatePassword } from '@/components/admin/PasswordField';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/dossier';

const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_OPTIONS = ['ADMIN', 'VAN_THU', 'CAN_BO'];

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500';

const emptyForm = { username: '', hoTen: '', email: '', role: 'CAN_BO', password: '', confirm: '', sendEmail: true };

/** Kiểm tra phía client trước khi gửi (BE vẫn kiểm tra lại). */
function validate(form, isEdit) {
  if (!isEdit && !USERNAME_PATTERN.test(form.username)) {
    return 'Tên đăng nhập chỉ gồm chữ thường, số, dấu . _ - (3–32 ký tự)';
  }
  if (!form.hoTen.trim()) return 'Họ tên là bắt buộc';
  const email = form.email.trim();
  if (!isEdit && !email) return 'Email là bắt buộc để gửi thông tin đăng nhập';
  if (email && !EMAIL_PATTERN.test(email)) return 'Email không hợp lệ';
  if (!isEdit) {
    if (form.password.length < PASSWORD_MIN_LENGTH) return `Mật khẩu phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự`;
    if (form.password !== form.confirm) return 'Mật khẩu nhập lại không khớp';
  }
  return null;
}

/** Thêm tài khoản mới hoặc sửa họ tên / vai trò của tài khoản có sẵn. */
export default function UserFormModal({ open, user, isSelf, mailConfigured, onClose, onSubmit }) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const isEdit = Boolean(user);

  useEffect(() => {
    if (!open) return;
    setForm(
      user
        ? { ...emptyForm, username: user.username, hoTen: user.hoTen ?? '', email: user.email ?? '', role: user.role }
        : emptyForm
    );
    setError(null);
  }, [open, user]);

  const update = (field) => (event) => {
    const value = field === 'username' ? event.target.value.toLowerCase().trim() : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const fillRandomPassword = () => {
    const password = generatePassword();
    setForm((prev) => ({ ...prev, password, confirm: password }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationError = validate(form, isEdit);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const email = form.email.trim().toLowerCase();
      await onSubmit(
        isEdit
          ? { hoTen: form.hoTen.trim(), email, ...(isSelf ? {} : { role: form.role }) }
          : {
              username: form.username,
              hoTen: form.hoTen.trim(),
              email,
              role: form.role,
              password: form.password,
              sendEmail: form.sendEmail,
            }
      );
    } catch (submitError) {
      const details = submitError.details ? ` (${Object.keys(submitError.details).join(', ')})` : '';
      setError(`${submitError.message}${details}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={isEdit ? UserPen : UserPlus}
      title={isEdit ? `Sửa tài khoản @${user.username}` : 'Thêm tài khoản mới'}
      subtitle={isEdit ? 'Cập nhật họ tên và vai trò' : 'Tạo tài khoản đăng nhập và gán vai trò'}
    >
      <form onSubmit={handleSubmit} className="space-y-4 p-6 text-sm" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block font-semibold text-slate-700">Tên đăng nhập *</span>
            <input
              value={form.username}
              onChange={update('username')}
              disabled={isEdit}
              autoComplete="off"
              placeholder="vd: canbo_c"
              className={`${inputClass} font-mono`}
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-semibold text-slate-700">Họ tên *</span>
            <input value={form.hoTen} onChange={update('hoTen')} placeholder="vd: Lê Hoàng C" className={inputClass} />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block font-semibold text-slate-700">Email (Gmail) {isEdit ? '' : '*'}</span>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              type="email"
              value={form.email}
              onChange={update('email')}
              autoComplete="off"
              placeholder="vd: lehoangc@gmail.com"
              className={`${inputClass} pl-9`}
            />
          </div>
          {!isEdit && (
            <span className="mt-1 block text-[11px] text-slate-500">
              Tên đăng nhập và mật khẩu ban đầu sẽ được gửi tới email này.
            </span>
          )}
        </label>

        <fieldset disabled={isSelf}>
          <legend className="mb-1.5 font-semibold text-slate-700">
            Vai trò {isSelf && <span className="font-normal text-slate-400">(không thể tự đổi vai trò của mình)</span>}
          </legend>
          <div className="grid gap-2">
            {ROLE_OPTIONS.map((role) => (
              <label
                key={role}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                  form.role === role ? 'border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500' : 'border-slate-200 hover:bg-slate-50'
                } ${isSelf ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <input
                  type="radio"
                  name="role"
                  value={role}
                  checked={form.role === role}
                  onChange={update('role')}
                  className="mt-0.5 accent-indigo-600"
                />
                <span>
                  <span className="block font-semibold text-slate-800">
                    {ROLE_LABELS[role]} <code className="ml-1 text-[11px] font-normal text-slate-400">{role}</code>
                  </span>
                  <span className="block text-xs text-slate-500">{ROLE_DESCRIPTIONS[role]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {!isEdit && (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Mật khẩu ban đầu</span>
              <button
                type="button"
                onClick={fillRandomPassword}
                className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
              >
                <Wand2 className="h-3.5 w-3.5" /> Tạo ngẫu nhiên
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <PasswordField id="new-password" label="Mật khẩu *" value={form.password} onChange={update('password')} />
              <PasswordField id="confirm-password" label="Nhập lại *" value={form.confirm} onChange={update('confirm')} />
            </div>
            <p className="text-[11px] text-slate-500">Tối thiểu {PASSWORD_MIN_LENGTH} ký tự.</p>

            <label className="flex cursor-pointer items-center gap-2 border-t border-slate-200 pt-3 text-slate-700">
              <input
                type="checkbox"
                checked={form.sendEmail}
                onChange={(event) => setForm((prev) => ({ ...prev, sendEmail: event.target.checked }))}
                className="h-4 w-4 accent-indigo-600"
              />
              <Mail className="h-4 w-4 text-indigo-600" />
              Gửi tên đăng nhập &amp; mật khẩu tới email người dùng
            </label>
            {form.sendEmail && mailConfigured === false && (
              <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Máy chủ chưa cấu hình SMTP (SMTP_USER / SMTP_PASS trong backend/.env) nên email sẽ không được gửi. Tài
                khoản vẫn được tạo — hãy tự gửi mật khẩu cho người dùng.
              </p>
            )}
          </div>
        )}

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
            <Save className="h-4 w-4" />
            {submitting
              ? isEdit || !form.sendEmail
                ? 'Đang lưu…'
                : 'Đang tạo & gửi email…'
              : isEdit
                ? 'Lưu thay đổi'
                : form.sendEmail
                  ? 'Tạo & gửi email'
                  : 'Tạo tài khoản'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
