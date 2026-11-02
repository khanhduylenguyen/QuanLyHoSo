'use client';

import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { CalendarDays, CalendarX2, Info, LoaderCircle, Plus, RefreshCw, Save, X } from 'lucide-react';
import { api } from '@/lib/api';
import { phanLoaiStyle } from '@/lib/dossier';

const WEEKDAYS = [
  [1, 'T2'],
  [2, 'T3'],
  [3, 'T4'],
  [4, 'T5'],
  [5, 'T6'],
  [6, 'T7'],
  [0, 'CN'],
];

const numberInput =
  'w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-center font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500';

/** Trang cấu hình thời hạn: số ngày từng loại thủ tục, ngày làm việc / ngày lịch, ngày nghỉ, ngày lễ. */
export default function DeadlineSettings({ pushToast }) {
  const [config, setConfig] = useState(null);
  const [newHoliday, setNewHoliday] = useState('');
  const [saving, setSaving] = useState(false);
  const [recalc, setRecalc] = useState(null); // { changed, checked } của lần chạy thử
  const [busyRecalc, setBusyRecalc] = useState(false);
  const [error, setError] = useState(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    api
      .adminGetDeadlineSettings()
      .then(({ data }) => setConfig(data))
      .catch((loadError) => setError(loadError.message));
  }, []);

  const update = (patch) => {
    setConfig((prev) => ({ ...prev, ...patch }));
    setDirty(true);
    setRecalc(null);
  };

  const setRule = (code, field, value) =>
    update({ rules: { ...config.rules, [code]: { ...config.rules[code], [field]: value === '' ? '' : Number(value) } } });

  const toggleWeekend = (day) =>
    update({
      weekendDays: config.weekendDays.includes(day) ? config.weekendDays.filter((d) => d !== day) : [...config.weekendDays, day],
    });

  const addHoliday = () => {
    if (!newHoliday || config.holidays.includes(newHoliday)) return;
    update({ holidays: [...config.holidays, newHoliday].sort() });
    setNewHoliday('');
  };

  const holidaysByYear = useMemo(() => {
    const groups = {};
    for (const day of config?.holidays ?? []) (groups[day.slice(0, 4)] ??= []).push(day);
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [config?.holidays]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.adminSaveDeadlineSettings({
        useWorkingDays: config.useWorkingDays,
        weekendDays: config.weekendDays,
        holidays: config.holidays,
        rules: config.rules,
      });
      setConfig(data);
      setDirty(false);
      pushToast('Đã lưu cấu hình hạn — áp dụng cho hồ sơ tiếp nhận / sửa từ bây giờ', 'success');
      const { data: preview } = await api.adminRecalculateDeadlines(true);
      setRecalc(preview);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const runRecalc = async () => {
    if (!window.confirm(`Tính lại hạn cho ${recalc.changed} hồ sơ chưa hoàn thành theo cấu hình mới?`)) return;
    setBusyRecalc(true);
    try {
      const { data } = await api.adminRecalculateDeadlines(false);
      pushToast(`Đã tính lại hạn cho ${data.changed} hồ sơ`, 'success');
      setRecalc({ ...data, done: true });
    } catch (recalcError) {
      setError(recalcError.message);
    } finally {
      setBusyRecalc(false);
    }
  };

  if (!config) {
    return error ? (
      <p className="text-sm text-rose-600">{error}</p>
    ) : (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <LoaderCircle className="h-4 w-4 animate-spin" /> Đang tải cấu hình…
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2.5 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-xs text-indigo-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
        <p>
          Hạn xử lý = <strong>Gia hạn</strong> → <strong>Ngày hẹn trả trên biên nhận</strong> → <strong>Ngày vào + số ngày</strong> của
          loại thủ tục dưới đây. Đếm từ ngày làm việc tiếp theo sau ngày vào. Cấu hình mới áp dụng cho hồ sơ tiếp nhận / sửa từ lúc lưu;
          hồ sơ cũ chỉ đổi khi bấm <em>Tính lại hạn</em>.
        </p>
      </div>

      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* Thời hạn từng loại */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-600">
            Thời hạn theo loại thủ tục ({config.useWorkingDays ? 'ngày làm việc' : 'ngày lịch'})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-800 text-xs uppercase tracking-wider text-slate-100">
                <tr>
                  <th className="px-4 py-2.5">Loại thủ tục</th>
                  <th className="px-4 py-2.5 text-center">Hạn trình LĐ</th>
                  <th className="px-4 py-2.5 text-center">Hạn xử lý</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {config.types.map((type) => (
                  <tr key={type.ma} className="hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <span className={`inline-block rounded-lg border px-2.5 py-1 text-xs font-semibold ${phanLoaiStyle(type.ma)}`}>
                        {type.moTa}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <input
                        type="number"
                        min={1}
                        value={config.rules[type.ma]?.trinh ?? ''}
                        onChange={(e) => setRule(type.ma, 'trinh', e.target.value)}
                        aria-label={`Hạn trình lãnh đạo — ${type.moTa}`}
                        className={numberInput}
                      />
                    </td>
                    <td className="px-4 py-2 text-center">
                      <input
                        type="number"
                        min={1}
                        value={config.rules[type.ma]?.hetHan ?? ''}
                        onChange={(e) => setRule(type.ma, 'hetHan', e.target.value)}
                        aria-label={`Hạn xử lý — ${type.moTa}`}
                        className={`${numberInput} text-amber-800`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-5">
          {/* Cách đếm ngày */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600">
              <CalendarDays className="h-4 w-4" /> Cách đếm ngày
            </h4>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={config.useWorkingDays}
                onChange={(e) => update({ useWorkingDays: e.target.checked })}
                className="mt-0.5 h-4 w-4 accent-indigo-600"
              />
              <span>
                <span className="font-semibold text-slate-800">Tính theo ngày làm việc</span>
                <span className="block text-xs text-slate-500">Bỏ qua ngày nghỉ cuối tuần và ngày lễ bên dưới.</span>
              </span>
            </label>
            <fieldset disabled={!config.useWorkingDays} className="disabled:opacity-50">
              <legend className="mb-1.5 text-xs font-semibold text-slate-600">Ngày nghỉ trong tuần</legend>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map(([day, label]) => {
                  const off = config.weekendDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleWeekend(day)}
                      aria-pressed={off}
                      className={`w-10 rounded-lg border py-1.5 text-xs font-semibold transition ${
                        off ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Ô đỏ = ngày nghỉ.</p>
            </fieldset>
          </div>

          {/* Ngày lễ */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600">
              <CalendarX2 className="h-4 w-4" /> Ngày lễ, nghỉ bù ({config.holidays.length})
            </h4>
            <p className="text-[11px] text-amber-700">
              Đã có sẵn các ngày lễ dương lịch cố định. Hãy thêm <strong>Tết Nguyên đán, Giỗ Tổ Hùng Vương và ngày nghỉ bù</strong> theo
              thông báo hằng năm.
            </p>
            <div className="flex gap-2">
              <input
                type="date"
                value={newHoliday}
                onChange={(e) => setNewHoliday(e.target.value)}
                aria-label="Ngày lễ mới"
                className="flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={addHoliday}
                disabled={!newHoliday}
                className="flex items-center gap-1 rounded-lg bg-slate-800 px-3 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" /> Thêm
              </button>
            </div>
            <div className="max-h-56 space-y-2 overflow-y-auto">
              {holidaysByYear.map(([year, days]) => (
                <div key={year}>
                  <p className="text-[11px] font-bold text-slate-400">{year}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {days.map((day) => (
                      <span key={day} className="inline-flex items-center gap-1 rounded-full bg-rose-50 py-0.5 pl-2.5 pr-1 text-xs text-rose-800">
                        {format(parseISO(day), 'dd/MM')}
                        <button
                          type="button"
                          onClick={() => update({ holidays: config.holidays.filter((d) => d !== day) })}
                          aria-label={`Bỏ ngày lễ ${format(parseISO(day), 'dd/MM/yyyy')}`}
                          className="rounded-full p-0.5 hover:bg-rose-200"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-sm text-slate-600">
          {recalc && !recalc.done && (
            <span>
              Với cấu hình này, <strong>{recalc.changed}</strong> / {recalc.checked} hồ sơ chưa hoàn thành sẽ đổi hạn nếu tính lại
              (hồ sơ có Ngày hẹn trả / Gia hạn chỉ đổi hạn trình LĐ).
            </span>
          )}
          {recalc?.done && <span className="text-emerald-700">Đã tính lại hạn cho {recalc.changed} hồ sơ.</span>}
          {!recalc && dirty && <span className="text-amber-700">Có thay đổi chưa lưu.</span>}
        </div>
        <div className="flex gap-2">
          {recalc && !recalc.done && recalc.changed > 0 && (
            <button
              type="button"
              onClick={runRecalc}
              disabled={busyRecalc || dirty}
              className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            >
              {busyRecalc ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Tính lại hạn {recalc.changed} hồ sơ
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Lưu cấu hình
          </button>
        </div>
      </div>
    </div>
  );
}
