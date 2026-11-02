'use client';

import { CalendarRange, LoaderCircle, RefreshCw, RotateCcw, Search, X } from 'lucide-react';
import { TRANG_THAI_LABELS, dayUnit, getUserName } from '@/lib/dossier';

const selectClass =
  'rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm';

export default function Toolbar({
  search,
  onSearchChange,
  filters,
  onFilterChange,
  meta,
  canBoList,
  currentUser,
  nextWeekActive,
  dueNextWeekCount,
  onToggleNextWeek,
  anyFilterActive,
  onReset,
  density,
  onDensityChange,
  sortText,
  loading,
  onRefresh,
}) {
  const isCanBo = currentUser?.role === 'CAN_BO';
  const phanLoaiRules = meta?.phanLoai ?? [];

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-[280px] flex-1 flex-wrap items-center gap-2.5">
          <div className="relative min-w-[220px] max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Tìm Mã HS, Tên hồ sơ, Đơn vị gửi, Ghi chú…"
              aria-label="Tìm kiếm hồ sơ"
              className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2 pl-9 pr-8 text-xs transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm"
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="Xoá từ khoá"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <select
            value={filters.phanLoai}
            onChange={(event) => onFilterChange('phanLoai', event.target.value)}
            aria-label="Lọc theo phân loại"
            className={selectClass}
          >
            <option value="ALL">📁 Tất cả Phân loại HS</option>
            {phanLoaiRules.map((rule) => (
              <option key={rule.ma} value={rule.ma}>
                {rule.moTa} (hạn {rule.hetHan} {dayUnit(meta?.calendar)})
              </option>
            ))}
          </select>

          <select
            value={isCanBo ? currentUser._id : filters.canBo}
            onChange={(event) => onFilterChange('canBo', event.target.value)}
            disabled={isCanBo}
            aria-label="Lọc theo cán bộ thụ lý"
            className={selectClass}
          >
            {isCanBo ? (
              <option value={currentUser._id}>👤 {getUserName(currentUser)}</option>
            ) : (
              <>
                <option value="ALL">👤 Tất cả Cán bộ thụ lý</option>
                <option value="NONE">⚠️ Chưa phân công</option>
                {canBoList.map((user) => (
                  <option key={user._id} value={user._id}>
                    {getUserName(user)}
                  </option>
                ))}
              </>
            )}
          </select>

          <select
            value={filters.trangThai}
            onChange={(event) => onFilterChange('trangThai', event.target.value)}
            aria-label="Lọc theo trạng thái"
            className={selectClass}
          >
            <option value="ALL">📌 Tất cả Trạng thái</option>
            {Object.entries(TRANG_THAI_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleNextWeek}
            aria-pressed={nextWeekActive}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs transition sm:text-sm ${
              nextWeekActive
                ? 'border-2 border-amber-600 bg-amber-500 font-bold text-white shadow-md'
                : 'border border-amber-300 bg-amber-50 font-semibold text-amber-900 shadow-sm hover:bg-amber-100'
            }`}
          >
            <CalendarRange className={`h-4 w-4 ${nextWeekActive ? 'text-white' : 'text-amber-600'}`} />
            <span>Lọc &amp; Sort: Đến hạn tuần tới</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                nextWeekActive ? 'bg-white/25 text-white' : 'bg-amber-200 text-amber-900'
              }`}
            >
              {dueNextWeekCount}
            </span>
          </button>

          {anyFilterActive && (
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Xóa lọc
            </button>
          )}

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            title="Tải lại dữ liệu"
            aria-label="Tải lại dữ liệu"
            className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>

          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-100 p-1 text-xs font-medium">
            {[
              ['standard', 'Tiêu chuẩn'],
              ['compact', 'Gọn (Dữ liệu lớn)'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => onDensityChange(value)}
                aria-pressed={density === value}
                className={`rounded-md px-2.5 py-1 transition ${
                  density === value ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
        {/* 17 loại thủ tục: thu gọn để không chiếm chỗ, bấm để xem */}
        <details className="group min-w-0 flex-1">
          <summary className="cursor-pointer select-none font-semibold text-slate-600 hover:text-slate-900">
            Hạn mặc định theo loại thủ tục ({phanLoaiRules.length} loại, tính theo {dayUnit(meta?.calendar)}) — dùng
            khi hồ sơ không có Ngày hẹn trả
          </summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {phanLoaiRules.map((rule) => (
              <span
                key={rule.ma}
                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-medium text-slate-700"
              >
                <strong>{rule.moTa}:</strong> Trình +{rule.trinh}d / Hạn +{rule.hetHan}d
              </span>
            ))}
          </div>
        </details>
        <span className="font-medium text-slate-600">
          Đang sắp xếp: <strong className="text-indigo-700">{sortText}</strong>
        </span>
      </div>
    </div>
  );
}
