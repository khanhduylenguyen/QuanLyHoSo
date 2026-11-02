'use client';

import { CircleAlert, CircleCheck, Info } from 'lucide-react';

const TONES = {
  info: { className: 'border-slate-700 bg-slate-900 text-white', Icon: Info },
  success: { className: 'border-emerald-700 bg-emerald-600 text-white', Icon: CircleCheck },
  amber: { className: 'border-amber-600 bg-amber-500 text-white', Icon: Info },
  error: { className: 'border-rose-700 bg-rose-600 text-white', Icon: CircleAlert },
};

export default function Toasts({ items }) {
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col gap-2" aria-live="polite">
      {items.map((toast) => {
        const { className, Icon } = TONES[toast.type] ?? TONES.info;
        return (
          <div
            key={toast.id}
            role="status"
            className={`flex max-w-sm animate-toast-in items-start gap-2 rounded-lg border px-4 py-3 text-xs font-medium shadow-lg ${className}`}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{toast.message}</span>
          </div>
        );
      })}
    </div>
  );
}
