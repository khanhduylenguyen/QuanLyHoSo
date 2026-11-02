'use client';

import { CalendarClock, Files, Send, TriangleAlert } from 'lucide-react';

export const QUICK_FILTERS = Object.freeze({
  ALL: 'ALL',
  NEXT_WEEK: 'NEXT_WEEK',
  URGENT_SUBMIT: 'URGENT_SUBMIT',
  OVERDUE: 'OVERDUE',
});

function Card({ active, onClick, className, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group relative overflow-hidden rounded-xl p-4 text-left shadow-sm transition ${className} ${
        active ? 'ring-4 ring-indigo-300/60' : ''
      }`}
    >
      {children}
    </button>
  );
}

export default function KpiCards({ stats, scopeText, quickFilter, onSelect }) {
  const nextWeekActive = quickFilter === QUICK_FILTERS.NEXT_WEEK;

  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
      <Card
        active={quickFilter === QUICK_FILTERS.ALL}
        onClick={() => onSelect(QUICK_FILTERS.ALL)}
        className="border border-slate-200 bg-white hover:border-indigo-400"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tổng hồ sơ (theo quyền)</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">{stats.total}</span>
              <span className="text-xs font-medium text-slate-500">hồ sơ</span>
            </div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition group-hover:bg-indigo-50 group-hover:text-indigo-600">
            <Files className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-2.5 flex items-center justify-between text-xs text-slate-500">
          <span>{scopeText}</span>
          <span className="font-medium text-indigo-600 group-hover:underline">Xem tất cả →</span>
        </div>
      </Card>

      <Card
        active={quickFilter === QUICK_FILTERS.URGENT_SUBMIT}
        onClick={() => onSelect(QUICK_FILTERS.URGENT_SUBMIT)}
        className="border border-blue-200 bg-white hover:border-blue-500"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Cần trình LĐ gấp (≤ 2 ngày)</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-blue-700">{stats.urgentSubmit}</span>
              <span className="text-xs font-medium text-blue-600">hồ sơ chưa trình</span>
            </div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Send className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-2.5 flex items-center justify-between text-xs text-slate-500">
          <span>Tự động tính từ Ngày vào HS</span>
          <span className="font-semibold text-blue-600 group-hover:underline">Lọc hồ sơ cần trình →</span>
        </div>
      </Card>

      <Card
        active={false}
        onClick={() => onSelect(nextWeekActive ? QUICK_FILTERS.ALL : QUICK_FILTERS.NEXT_WEEK)}
        className={`animate-pulse-amber border-2 border-amber-400 bg-gradient-to-br from-amber-50 via-orange-50/70 to-amber-100/60 hover:shadow-md ${
          nextWeekActive ? 'ring-4 ring-amber-400/50' : ''
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 animate-ping rounded-full bg-amber-500" />
              <p className="text-xs font-bold uppercase tracking-wider text-amber-900">Đến hạn tuần tới (≤ 7 ngày)</p>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-amber-700">{stats.dueNextWeek}</span>
              <span className="text-xs font-semibold text-amber-800">hồ sơ cần ưu tiên</span>
            </div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500 text-white shadow-sm">
            <CalendarClock className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-2.5 flex items-center justify-between text-xs">
          <span className="font-medium text-amber-900">Click để lọc &amp; sort hạn gần nhất</span>
          <span className="rounded bg-amber-600 px-2 py-0.5 text-[11px] font-semibold text-white">
            {nextWeekActive ? 'Đang lọc ✓' : 'Sort ngay ⚡'}
          </span>
        </div>
      </Card>

      <Card
        active={quickFilter === QUICK_FILTERS.OVERDUE}
        onClick={() => onSelect(QUICK_FILTERS.OVERDUE)}
        className="border border-rose-200 bg-white hover:border-rose-500"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-rose-700">Quá hạn xử lý</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-rose-600">{stats.overdue}</span>
              <span className="text-xs font-medium text-rose-600">cần đôn đốc ngay</span>
            </div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
            <TriangleAlert className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-2.5 flex items-center justify-between text-xs text-slate-500">
          <span>Chưa hoàn thành sau ngày hết hạn</span>
          <span className="font-semibold text-rose-600 group-hover:underline">Lọc quá hạn →</span>
        </div>
      </Card>
    </div>
  );
}
