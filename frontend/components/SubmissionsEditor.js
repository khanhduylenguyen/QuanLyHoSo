'use client';

import { format } from 'date-fns';
import { Plus, Send, Trash2 } from 'lucide-react';
import { KET_QUA_TRINH_LABELS, KET_QUA_TRINH_STYLES } from '@/lib/dossier';

export const LAN_TRINH_MAX = 20;

const cellClass =
  'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500';

/**
 * Danh sách các lần trình Lãnh đạo trong form hồ sơ. `value`: [{ ngay: 'yyyy-MM-dd', ketQua, ghiChu }].
 * Lần mới mặc định hôm nay, "Chờ ý kiến". Kết quả lần gần nhất quyết định trạng thái hồ sơ (backend).
 */
export default function SubmissionsEditor({ value, onChange, minDate }) {
  const update = (index, field) => (event) =>
    onChange(value.map((item, i) => (i === index ? { ...item, [field]: event.target.value } : item)));
  const remove = (index) => onChange(value.filter((_, i) => i !== index));
  const add = () => onChange([...value, { ngay: format(new Date(), 'yyyy-MM-dd'), ketQua: 'CHO_Y_KIEN', ghiChu: '' }]);
  const last = value[value.length - 1];

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sky-800">
          <Send className="h-3.5 w-3.5" /> Các lần trình Lãnh đạo {value.length > 0 && `(${value.length})`}
        </span>
        <button
          type="button"
          onClick={add}
          disabled={value.length >= LAN_TRINH_MAX}
          className="flex items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Thêm lần trình
        </button>
      </div>

      {value.length === 0 ? (
        <p className="text-xs text-slate-500">Chưa trình lần nào. Bấm “Thêm lần trình” khi gửi hồ sơ lên Lãnh đạo.</p>
      ) : (
        <ol className="space-y-2">
          {value.map((item, index) => (
            // Danh sách nhỏ, sửa tại chỗ: dùng vị trí làm khoá.
            // eslint-disable-next-line react/no-array-index-key
            <li key={index} className="grid grid-cols-[auto_1fr_auto] items-start gap-2 sm:grid-cols-[auto_140px_170px_1fr_auto]">
              <span className="mt-1.5 w-12 text-xs font-semibold text-slate-500">Lần {index + 1}</span>
              <input
                type="date"
                required
                value={item.ngay}
                min={minDate}
                onChange={update(index, 'ngay')}
                aria-label={`Ngày trình lần ${index + 1}`}
                className={cellClass}
              />
              <select
                value={item.ketQua}
                onChange={update(index, 'ketQua')}
                aria-label={`Kết quả lần trình ${index + 1}`}
                className={`${cellClass} col-start-2 font-semibold sm:col-start-auto ${KET_QUA_TRINH_STYLES[item.ketQua]}`}
              >
                {Object.entries(KET_QUA_TRINH_LABELS)
                  .filter(([key]) => key !== '' || item.ketQua === '')
                  .map(([key, label]) => (
                    <option key={key || 'none'} value={key}>
                      {label}
                    </option>
                  ))}
              </select>
              <input
                value={item.ghiChu}
                onChange={update(index, 'ghiChu')}
                maxLength={500}
                placeholder="Ghi chú (vd. thiếu bản vẽ, sai diện tích…)"
                aria-label={`Ghi chú lần trình ${index + 1}`}
                className={`${cellClass} col-start-2 sm:col-start-auto`}
              />
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={`Xoá lần trình ${index + 1}`}
                title="Xoá lần trình này"
                className="row-start-1 mt-0.5 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 sm:row-start-auto"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ol>
      )}

      <p className="mt-2 text-[11px] text-slate-500">
        {last?.ketQua === 'TRA_LAI'
          ? 'Lần gần nhất bị trả lại → hồ sơ chuyển về “Đang thụ lý” và hiện lại trong danh sách cần trình.'
          : 'Lưu xong, trạng thái hồ sơ tự theo lần trình gần nhất (bị trả lại → Đang thụ lý; chờ ý kiến / đã duyệt → Đã trình LĐ).'}
      </p>
    </div>
  );
}
