'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

/** Khung hộp thoại dùng chung cho trang quản trị (header tối, đóng bằng Esc / click nền). */
export default function Modal({ open, title, subtitle, icon: Icon, onClose, children, maxWidth = 'max-w-lg' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-modal-title"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className={`my-10 w-full ${maxWidth} overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl`}>
        <div className="flex items-center justify-between bg-slate-900 px-6 py-4 text-white">
          <div className="flex items-center gap-2.5">
            {Icon && <Icon className="h-5 w-5 text-indigo-300" />}
            <div>
              <h3 id="admin-modal-title" className="text-base font-bold">
                {title}
              </h3>
              {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="p-1 text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
