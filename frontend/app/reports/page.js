'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { BarChart3, FileDown, LoaderCircle, Table2, TriangleAlert } from 'lucide-react';
import UserBar from '@/components/UserBar';
import Toasts from '@/components/Toasts';
import MonthlyChart, { MONTHLY_SERIES } from '@/components/charts/MonthlyChart';
import RateBars from '@/components/charts/RateBars';
import { api } from '@/lib/api';
import { saveBlob } from '@/lib/download';
import { phanLoaiStyle } from '@/lib/dossier';
import { useAuth } from '@/lib/useAuth';

const TOAST_DURATION_MS = 3200;
const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const lastDay = (y, m) => new Date(y, m, 0).getDate();

/** Các kỳ báo cáo nhanh, tính theo ngày trên máy người dùng. */
function presetRange(preset) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  switch (preset) {
    case 'month':
      return { from: iso(y, m, 1), to: iso(y, m, lastDay(y, m)) };
    case 'lastMonth': {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return { from: iso(py, pm, 1), to: iso(py, pm, lastDay(py, pm)) };
    }
    case 'quarter': {
      const qStart = Math.floor((m - 1) / 3) * 3 + 1;
      return { from: iso(y, qStart, 1), to: iso(y, qStart + 2, lastDay(y, qStart + 2)) };
    }
    case 'year':
    default:
      return { from: iso(y, 1, 1), to: iso(y, 12, 31) };
  }
}

const PRESETS = [
  ['month', 'Tháng này'],
  ['lastMonth', 'Tháng trước'],
  ['quarter', 'Quý này'],
  ['year', 'Năm nay'],
];

const fmtDay = (value) => format(parseISO(value), 'dd/MM/yyyy');
const pct = (value) => (value === null || value === undefined ? '—' : `${value}%`);

function Tile({ label, value, note, tone = 'text-slate-900' }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${tone}`}>{value}</p>
      {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
    </div>
  );
}

function Card({ title, actions, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-bold text-slate-800">{title}</h2>
        {actions}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

const COUNTER_COLUMNS = [
  ['received', 'Tiếp nhận'],
  ['resolved', 'Giải quyết'],
  ['onTime', 'Đúng hạn'],
  ['late', 'Trễ hạn'],
  ['onTimeRate', 'Tỷ lệ đúng hạn'],
  ['pending', 'Tồn cuối kỳ'],
  ['pendingOverdue', 'Tồn quá hạn'],
];

function CounterTable({ rows, nameKey, nameLabel, total, renderName }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-800 uppercase tracking-wider text-slate-100">
          <tr>
            <th className="px-3 py-2.5">{nameLabel}</th>
            {COUNTER_COLUMNS.map(([key, label]) => (
              <th key={key} className="px-3 py-2.5 text-right">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row[nameKey]} className="hover:bg-slate-50">
              <td className="px-3 py-2">{renderName ? renderName(row) : row[nameKey]}</td>
              {COUNTER_COLUMNS.map(([key]) => (
                <td
                  key={key}
                  className={`px-3 py-2 text-right tabular-nums ${
                    (key === 'late' || key === 'pendingOverdue') && row[key] > 0 ? 'font-semibold text-rose-600' : 'text-slate-700'
                  }`}
                >
                  {key === 'onTimeRate' ? pct(row[key]) : row[key]}
                </td>
              ))}
            </tr>
          ))}
          <tr className="bg-slate-50 font-bold">
            <td className="px-3 py-2">Tổng cộng</td>
            {COUNTER_COLUMNS.map(([key]) => (
              <td key={key} className="px-3 py-2 text-right tabular-nums">
                {key === 'onTimeRate' ? pct(total[key]) : total[key]}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function ReportsPage() {
  const { user, error: authError, logout } = useAuth();
  const [preset, setPreset] = useState('year');
  const [range, setRange] = useState(() => presetRange('year'));
  const [summary, setSummary] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [showMonthlyTable, setShowMonthlyTable] = useState(false);
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);
  const year = Number(range.to.slice(0, 4));

  const pushToast = useCallback((message, type = 'info') => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), TOAST_DURATION_MS);
  }, []);

  useEffect(() => {
    if (!user || range.from > range.to) return;
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([api.reportSummary(range.from, range.to), api.reportMonthly(year)])
      .then(([s, m]) => {
        if (!active) return;
        setSummary(s.data);
        setMonthly(m.data);
      })
      .catch((loadError) => active && setError(loadError.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [user, range, year]);

  const officerRates = useMemo(
    () =>
      (summary?.byOfficer ?? [])
        .filter((o) => o.onTime + o.late > 0)
        .map((o) => ({ label: o.name, rate: o.onTimeRate, onTime: o.onTime, total: o.onTime + o.late }))
        .sort((a, b) => b.rate - a.rate || b.total - a.total),
    [summary]
  );

  const exportReport = async () => {
    setExporting(true);
    try {
      saveBlob(await api.reportSummaryXlsx(range.from, range.to), `bao-cao-${range.from}_${range.to}.xlsx`);
      pushToast('Đã xuất báo cáo Excel', 'success');
    } catch (exportError) {
      pushToast(`Không xuất được: ${exportError.message}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-sm text-slate-500">
        <LoaderCircle className="h-5 w-5 animate-spin" /> Đang kiểm tra phiên đăng nhập…
      </div>
    );
  }

  const total = summary?.total;
  const isOfficer = user.role === 'CAN_BO';

  return (
    <>
      <UserBar user={user} onLogout={logout} />

      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-5 px-4 py-5">
        <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5 lg:flex-row lg:items-center">
          <div className="flex items-start gap-3.5">
            <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">Báo cáo &amp; Thống kê</h1>
              <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
                {isOfficer ? 'Số liệu các hồ sơ bạn thụ lý' : 'Kết quả tiếp nhận, giải quyết và tồn đọng hồ sơ theo kỳ'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={exportReport}
            disabled={exporting || !summary}
            className="flex items-center gap-2 self-start rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 sm:text-sm lg:self-auto"
          >
            {exporting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            Xuất báo cáo Excel
          </button>
        </div>

        {/* Bộ lọc kỳ — một hàng phía trên các biểu đồ */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-1 text-xs font-semibold">
            {PRESETS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setPreset(key);
                  setRange(presetRange(key));
                }}
                aria-pressed={preset === key}
                className={`rounded-md px-3 py-1.5 transition ${preset === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            Từ
            <input
              type="date"
              value={range.from}
              onChange={(e) => {
                setPreset('custom');
                setRange((prev) => ({ ...prev, from: e.target.value }));
              }}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            đến
            <input
              type="date"
              value={range.to}
              onChange={(e) => {
                setPreset('custom');
                setRange((prev) => ({ ...prev, to: e.target.value }));
              }}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          {loading && <LoaderCircle className="h-4 w-4 animate-spin text-slate-400" />}
          {range.from > range.to && <span className="text-xs text-rose-600">Ngày bắt đầu phải trước ngày kết thúc</span>}
        </div>

        {(error || authError) && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
            {error || authError}
          </div>
        )}

        {total && (
          <>
            <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
              <Tile label="Tiếp nhận trong kỳ" value={total.received} />
              <Tile
                label="Giải quyết trong kỳ"
                value={total.resolved}
                note={total.resolvedNoDate ? `+${total.resolvedNoDate} hoàn thành không ghi ngày kết thúc` : undefined}
              />
              <Tile
                label="Tỷ lệ đúng hạn"
                value={pct(total.onTimeRate)}
                note={`${total.onTime} đúng hạn · ${total.late} trễ hạn`}
                tone={total.onTimeRate !== null && total.onTimeRate < 80 ? 'text-rose-600' : 'text-slate-900'}
              />
              <Tile
                label="Tồn cuối kỳ"
                value={total.pending}
                note={`${total.pendingOverdue} hồ sơ đã quá hạn`}
                tone={total.pendingOverdue ? 'text-rose-600' : 'text-slate-900'}
              />
            </div>

            <div className="grid gap-5 xl:grid-cols-[3fr_2fr]">
              <Card
                title={`Tiếp nhận & giải quyết theo tháng — năm ${year}`}
                actions={
                  <button
                    type="button"
                    onClick={() => setShowMonthlyTable((v) => !v)}
                    className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    {showMonthlyTable ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
                    {showMonthlyTable ? 'Xem biểu đồ' : 'Xem dạng bảng'}
                  </button>
                }
              >
                <div className="mb-2 flex flex-wrap gap-4 text-xs text-slate-600">
                  {MONTHLY_SERIES.map((s) => (
                    <span key={s.key} className="flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded-sm" style={{ background: s.color }} />
                      {s.label}
                    </span>
                  ))}
                </div>
                {monthly && !showMonthlyTable && <MonthlyChart months={monthly.months} />}
                {monthly && showMonthlyTable && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs tabular-nums">
                      <thead className="text-slate-500">
                        <tr>
                          <th className="px-2 py-1.5 text-left">Tháng</th>
                          {MONTHLY_SERIES.map((s) => (
                            <th key={s.key} className="px-2 py-1.5">
                              {s.label}
                            </th>
                          ))}
                          <th className="px-2 py-1.5">Hoàn thành không ghi ngày</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {monthly.months.map((m) => (
                          <tr key={m.month}>
                            <td className="px-2 py-1.5 text-left">Tháng {m.month}</td>
                            {MONTHLY_SERIES.map((s) => (
                              <td key={s.key} className="px-2 py-1.5">
                                {m[s.key]}
                              </td>
                            ))}
                            <td className="px-2 py-1.5 text-slate-400">{m.resolvedNoDate}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="mt-2 text-[11px] text-slate-400">
                  Hồ sơ hoàn thành không ghi ngày kết thúc (sổ cũ chỉ đánh “x”) không có cột giải quyết vì không biết tháng hoàn thành.
                </p>
              </Card>

              <Card title={isOfficer ? 'Tỷ lệ đúng hạn của bạn' : 'Tỷ lệ giải quyết đúng hạn theo cán bộ'}>
                <RateBars items={officerRates} />
              </Card>
            </div>

            <Card title="Theo loại thủ tục">
              <CounterTable
                rows={summary.byType}
                nameKey="ma"
                nameLabel="Loại thủ tục"
                total={total}
                renderName={(row) => (
                  <span className={`inline-block rounded border px-2 py-0.5 font-medium ${phanLoaiStyle(row.ma)}`}>{row.moTa}</span>
                )}
              />
            </Card>

            {!isOfficer && (
              <Card title="Theo cán bộ thụ lý">
                <CounterTable rows={summary.byOfficer} nameKey="name" nameLabel="Cán bộ" total={total} />
              </Card>
            )}

            <Card title="Hồ sơ quá hạn lâu nhất (hiện tại)">
              {summary.oldestOverdue.length === 0 ? (
                <p className="text-sm text-slate-500">Không có hồ sơ quá hạn.</p>
              ) : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {summary.oldestOverdue.map((d) => (
                    <li key={d._id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="min-w-0">
                        <span className="font-mono text-xs font-bold text-indigo-700">{d.maHoSo}</span>{' '}
                        <span className="text-slate-800">{d.tenHoSo}</span>
                        <span className="block text-xs text-slate-500">
                          {d.loai} · {d.canBo} · hạn {fmtDay(d.ngayHetHan)}
                        </span>
                      </span>
                      <span className="flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700">
                        <TriangleAlert className="h-3.5 w-3.5" /> Quá hạn {d.soNgayQuaHan} ngày
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </main>
      <Toasts items={toasts} />
    </>
  );
}
