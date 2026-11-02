'use client';

import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { BellRing, Eye, Info, LoaderCircle, MailWarning, Save, Send } from 'lucide-react';
import { api } from '@/lib/api';

const inputClass = 'rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

/** Cấu hình & chạy thử nhắc hạn qua email hằng ngày. */
export default function ReminderSettings({ pushToast }) {
  const [config, setConfig] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(null); // 'save' | 'preview' | 'send'
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .adminGetReminderSettings()
      .then(({ data }) => setConfig(data))
      .catch((loadError) => setError(loadError.message));
  }, []);

  const update = (patch) => {
    setConfig((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const run = async (kind, action) => {
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    run('save', async () => {
      const { data } = await api.adminSaveReminderSettings(config);
      setConfig(data);
      setDirty(false);
      pushToast(data.enabled ? `Đã bật nhắc hạn lúc ${data.sendTime} mỗi ngày` : 'Đã lưu (nhắc hạn đang tắt)', 'success');
    });

  const preview = () =>
    run('preview', async () => {
      const { data } = await api.adminRunReminders(true);
      setResult(data);
    });

  const sendNow = () => {
    if (!window.confirm('Gửi email nhắc hạn ngay bây giờ cho tất cả người nhận?')) return;
    run('send', async () => {
      const { data } = await api.adminRunReminders(false);
      setResult(data);
      pushToast(`Đã gửi ${data.sent} email${data.errors.length ? `, ${data.errors.length} lỗi` : ''}`, data.errors.length ? 'error' : 'success');
    });
  };

  if (!config) {
    return error ? (
      <p className="text-sm text-rose-600">{error}</p>
    ) : (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <LoaderCircle className="h-4 w-4 animate-spin" /> Đang tải…
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {!config.mailConfigured && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
          <MailWarning className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Máy chủ chưa cấu hình gửi email (SMTP_USER / SMTP_PASS trong <code>backend/.env</code>) nên chưa gửi được. Vẫn có thể lưu cấu hình
            và xem trước danh sách người nhận.
          </p>
        </div>
      )}
      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="grid gap-5 lg:grid-cols-[400px_1fr]">
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600">
            <BellRing className="h-4 w-4" /> Nhắc hạn hằng ngày
          </h4>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-slate-800">
            <input type="checkbox" checked={config.enabled} onChange={(e) => update({ enabled: e.target.checked })} className="h-4 w-4 accent-indigo-600" />
            Bật gửi email tự động
          </label>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Giờ gửi (giờ VN)</span>
              <input type="time" value={config.sendTime} onChange={(e) => update({ sendTime: e.target.value })} className={`${inputClass} w-full`} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Báo trước (ngày)</span>
              <input
                type="number"
                min={0}
                max={30}
                value={config.daysAhead}
                onChange={(e) => update({ daysAhead: e.target.value === '' ? '' : Number(e.target.value) })}
                className={`${inputClass} w-full`}
              />
            </label>
          </div>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input type="checkbox" checked={config.includeOverdue} onChange={(e) => update({ includeOverdue: e.target.checked })} className="mt-0.5 h-4 w-4 accent-indigo-600" />
            <span>Kèm danh sách hồ sơ <strong>đã quá hạn</strong></span>
          </label>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={config.sendSummaryToAdmins}
              onChange={(e) => update({ sendSummaryToAdmins: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-indigo-600"
            />
            <span>Gửi bản tổng hợp cho Lãnh đạo / Admin (tài khoản có email)</span>
          </label>
          <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Mỗi cán bộ chỉ nhận email khi có hồ sơ quá hạn / sắp đến hạn và tài khoản có email (thêm email trong tab Tài khoản).
            {config.lastRunDate && ` Lần gửi tự động gần nhất: ${format(parseISO(config.lastRunDate), 'dd/MM/yyyy')}.`}
          </p>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || busy !== null}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy === 'save' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Lưu cấu hình
          </button>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">Người nhận hôm nay</h4>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={preview}
                disabled={busy !== null || dirty}
                title={dirty ? 'Lưu cấu hình trước' : undefined}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {busy === 'preview' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                Xem trước
              </button>
              <button
                type="button"
                onClick={sendNow}
                disabled={busy !== null || dirty || !config.mailConfigured}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy === 'send' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Gửi ngay
              </button>
            </div>
          </div>

          {!result && <p className="text-sm text-slate-500">Bấm “Xem trước” để xem ai sẽ nhận email và bao nhiêu hồ sơ.</p>}
          {result && (
            <>
              <p className="text-xs text-slate-600">
                {result.dryRun ? 'Xem trước' : `Đã gửi ${result.sent} email`} · {result.recipients.length} người nhận
                {result.officersWithoutEmail > 0 && (
                  <span className="text-amber-700"> · {result.officersWithoutEmail} cán bộ chưa có email (sẽ không nhận được)</span>
                )}
                {result.unassigned.overdue + result.unassigned.dueSoon > 0 &&
                  ` · ${result.unassigned.overdue + result.unassigned.dueSoon} hồ sơ chưa phân công (chỉ có trong bản tổng hợp)`}
              </p>
              {result.errors.length > 0 && (
                <ul className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {result.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
              <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-100 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Người nhận</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2 text-right">Quá hạn</th>
                      <th className="px-3 py-2 text-right">Sắp đến hạn</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {result.recipients.map((r) => (
                      <tr key={`${r.kind}-${r.name}`}>
                        <td className="px-3 py-1.5 font-medium text-slate-800">
                          {r.name}
                          {r.kind === 'admin' && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">tổng hợp</span>}
                        </td>
                        <td className="px-3 py-1.5">{r.email ?? <span className="italic text-amber-700">chưa có email</span>}</td>
                        <td className="px-3 py-1.5 text-right font-semibold text-rose-600">{r.overdue ?? '—'}</td>
                        <td className="px-3 py-1.5 text-right">{r.dueSoon ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
