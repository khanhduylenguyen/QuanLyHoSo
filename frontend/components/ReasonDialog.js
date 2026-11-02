'use client';

import { useCallback, useState } from 'react';
import { MessageSquareText } from 'lucide-react';
import Modal from '@/components/admin/Modal';

const REASON_MAX_LENGTH = 500;

/** Hộp thoại nhập lý do (và ngày, nếu là gia hạn). Lý do được ghi vào Lịch sử xử lý của hồ sơ. */
function ReasonDialog({ title, subtitle, label = 'Lý do', confirmLabel = 'Xác nhận', required = true, withDate, dateLabel, initialDate = '', minDate, onDone }) {
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(initialDate);
  const close = useCallback(() => onDone(null), [onDone]);
  const canSubmit = (!required || reason.trim()) && (!withDate || date);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (canSubmit) onDone({ lyDo: reason.trim(), date });
  };

  return (
    <Modal open title={title} subtitle={subtitle} icon={MessageSquareText} onClose={close} maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4 p-6 text-sm">
        {withDate && (
          <label className="block">
            <span className="mb-1 block font-semibold text-slate-700">{dateLabel}</span>
            <input
              type="date"
              value={date}
              min={minDate}
              onChange={(event) => setDate(event.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
        )}
        <label className="block">
          <span className="mb-1 block font-semibold text-slate-700">
            {label} {required ? <span className="text-rose-600">*</span> : <span className="font-normal text-slate-400">(không bắt buộc)</span>}
          </span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={REASON_MAX_LENGTH}
            rows={3}
            autoFocus={!withDate}
            placeholder="vd. Cán bộ nghỉ phép; chờ bổ sung hồ sơ địa chính…"
            className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <span className="mt-1 block text-[11px] text-slate-500">Lý do được lưu vào Lịch sử xử lý của hồ sơ.</span>
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={close} className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50">
            Huỷ
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * `const [dialog, askReason] = useReasonDialog();` — render `{dialog}`, rồi
 * `const result = await askReason({ title, ... })` → `{ lyDo, date }` hoặc null nếu huỷ.
 */
export function useReasonDialog() {
  const [request, setRequest] = useState(null);
  const askReason = useCallback((options) => new Promise((resolve) => setRequest({ ...options, resolve })), []);
  const onDone = useCallback(
    (value) => {
      setRequest((current) => {
        current?.resolve(value);
        return null;
      });
    },
    []
  );
  const dialog = request ? <ReasonDialog key={request.title} {...request} onDone={onDone} /> : null;
  return [dialog, askReason];
}
