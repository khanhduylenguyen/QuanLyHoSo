'use client';

import { CircleCheck, FileDown, LoaderCircle, Trash2, UserCog, X } from 'lucide-react';
import { TRANG_THAI_LABELS, getUserName } from '@/lib/dossier';

const selectClass =
  'rounded-lg border border-indigo-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50';

/** Thanh thao tác khi đã chọn hồ sơ: hoàn thành, đổi trạng thái, phân công, xoá. */
export default function BulkActionBar({
  count,
  filteredCount,
  onSelectAllFiltered,
  selectingAll,
  onClear,
  onUpdate,
  onDelete,
  onExport,
  exporting,
  canAssign,
  canDelete,
  canBoList,
  busy,
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs">
      <span className="font-bold text-indigo-900">Đã chọn {count} hồ sơ</span>
      {count < filteredCount && (
        <button type="button" onClick={onSelectAllFiltered} disabled={selectingAll} className="inline-flex items-center gap-1 font-semibold text-indigo-700 underline hover:text-indigo-900 disabled:opacity-60">
          {selectingAll && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
          Chọn tất cả {filteredCount} hồ sơ đang lọc
        </button>
      )}
      <span className="mx-1 h-5 w-px bg-indigo-200" aria-hidden />

      <button
        type="button"
        onClick={() => onUpdate({ trangThai: 'HOAN_THANH' }, 'Đánh dấu hoàn thành')}
        disabled={busy}
        className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <CircleCheck className="h-3.5 w-3.5" />}
        Hoàn thành
      </button>

      <select
        value=""
        onChange={(event) => event.target.value && onUpdate({ trangThai: event.target.value }, `Đổi trạng thái → ${TRANG_THAI_LABELS[event.target.value]}`)}
        disabled={busy}
        aria-label="Đổi trạng thái các hồ sơ đã chọn"
        className={selectClass}
      >
        <option value="">Đổi trạng thái…</option>
        {Object.entries(TRANG_THAI_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      {canAssign && (
        <label className="flex items-center gap-1">
          <UserCog className="h-4 w-4 text-indigo-700" aria-hidden />
          <select
            value=""
            onChange={(event) => {
              const value = event.target.value;
              if (!value) return;
              const officer = canBoList.find((u) => u._id === value);
              onUpdate(
                { canBoThuLy: value === 'NONE' ? null : value },
                value === 'NONE' ? 'Bỏ phân công' : `Phân công cho ${getUserName(officer)}`
              );
            }}
            disabled={busy}
            aria-label="Phân công cán bộ cho các hồ sơ đã chọn"
            className={selectClass}
          >
            <option value="">Phân công cho…</option>
            <option value="NONE">— Chưa phân công —</option>
            {canBoList.map((user) => (
              <option key={user._id} value={user._id}>
                {getUserName(user)}
              </option>
            ))}
          </select>
        </label>
      )}

      <button
        type="button"
        onClick={onExport}
        disabled={busy || exporting}
        className="flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
      >
        {exporting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
        Xuất Excel
      </button>

      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="flex items-center gap-1 rounded-lg border border-rose-300 bg-white px-3 py-1.5 font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> Xoá
        </button>
      )}

      <button
        type="button"
        onClick={onClear}
        disabled={busy}
        className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1.5 font-semibold text-slate-600 hover:bg-white"
      >
        <X className="h-3.5 w-3.5" /> Bỏ chọn
      </button>
    </div>
  );
}
