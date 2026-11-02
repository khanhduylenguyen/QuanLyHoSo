'use client';

import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ArrowRightLeft, CalendarPlus, FilePlus2, FileSpreadsheet, History, Layers, LoaderCircle, Paperclip, PenLine, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { MUC_DO_UU_TIEN_LABELS, TRANG_THAI_LABELS } from '@/lib/dossier';

export const FIELD_LABELS = {
  maHoSo: 'Mã hồ sơ',
  soBienNhan: 'Số biên nhận',
  tenHoSo: 'Tên hồ sơ',
  diaChi: 'Địa chỉ',
  donViGui: 'Đơn vị gửi',
  phanLoai: 'Loại thủ tục',
  ngayVao: 'Ngày vào',
  ngayHenTra: 'Ngày hẹn trả',
  ngayGiaHan: 'Gia hạn',
  ngayTrinhLanhDao: 'Hạn trình LĐ',
  ngayHetHan: 'Hạn xử lý',
  ngayTrinhThucTe: 'Ngày trình thực tế',
  lanTrinh: 'Các lần trình LĐ',
  ngayKetThuc: 'Ngày kết thúc',
  canBoThuLy: 'Cán bộ thụ lý',
  trangThai: 'Trạng thái',
  ghiChuCanBo: 'Diễn giải',
  ghiChu: 'Ghi chú',
  chiDaoLanhDao: 'Chỉ đạo LĐ',
  mucDoUuTien: 'Ưu tiên nội bộ',
};

export const ACTIONS = {
  CREATE: { label: 'Tiếp nhận', icon: FilePlus2, tone: 'bg-emerald-100 text-emerald-700' },
  UPDATE: { label: 'Cập nhật', icon: PenLine, tone: 'bg-indigo-100 text-indigo-700' },
  BULK_UPDATE: { label: 'Cập nhật hàng loạt', icon: Layers, tone: 'bg-amber-100 text-amber-700' },
  IMPORT: { label: 'Nhập từ Excel', icon: FileSpreadsheet, tone: 'bg-sky-100 text-sky-700' },
  DELETE: { label: 'Xoá', icon: Trash2, tone: 'bg-rose-100 text-rose-700' },
  TRANSFER: { label: 'Chuyển cán bộ', icon: ArrowRightLeft, tone: 'bg-violet-100 text-violet-700', reason: true },
  EXTEND: { label: 'Gia hạn', icon: CalendarPlus, tone: 'bg-orange-100 text-orange-700', reason: true },
  ATTACH: { label: 'Đính kèm tệp', icon: Paperclip, tone: 'bg-slate-100 text-slate-700' },
  DETACH: { label: 'Gỡ tệp đính kèm', icon: Paperclip, tone: 'bg-slate-100 text-slate-500' },
};

/** Giá trị hiển thị: ngày yyyy-mm-dd → dd/mm/yyyy, mã trạng thái / loại → nhãn. */
export function displayValue(field, value, typeLabels) {
  if (value === null || value === undefined || value === '') return '(trống)';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return format(parseISO(value), 'dd/MM/yyyy');
  if (field === 'trangThai') return TRANG_THAI_LABELS[value] ?? value;
  if (field === 'mucDoUuTien') return MUC_DO_UU_TIEN_LABELS[value] ?? value;
  if (field === 'phanLoai') return typeLabels[value] ?? value;
  const text = String(value);
  const max = field === 'lanTrinh' ? 300 : 80;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Dòng thời gian thao tác trên một hồ sơ (mới nhất trước). */
export default function DossierHistory({ dossierId, meta }) {
  const [logs, setLogs] = useState(null);
  const [error, setError] = useState(null);
  const typeLabels = Object.fromEntries((meta?.phanLoai ?? []).map((rule) => [rule.ma, rule.moTa]));

  useEffect(() => {
    let active = true;
    setLogs(null);
    setError(null);
    api
      .getDossierLogs(dossierId)
      .then(({ data }) => active && setLogs(data))
      .catch((loadError) => active && setError(loadError.message));
    return () => {
      active = false;
    };
  }, [dossierId]);

  return (
    <div className="border-t border-slate-200 pt-4">
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
        <History className="h-4 w-4" /> Lịch sử xử lý
      </h4>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {!logs && !error && (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Đang tải…
        </p>
      )}
      {logs && logs.length === 0 && (
        <p className="text-xs text-slate-500">Chưa có thao tác nào được ghi (hồ sơ có từ trước khi bật nhật ký).</p>
      )}
      {logs && logs.length > 0 && (
        <ol className="max-h-64 space-y-3 overflow-y-auto pr-1">
          {logs.map((log) => {
            const action = ACTIONS[log.action] ?? ACTIONS.UPDATE;
            const Icon = action.icon;
            return (
              <li key={log._id} className="flex gap-2.5">
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${action.tone}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 text-xs">
                  <p className="text-slate-800">
                    <strong>{log.userName}</strong> · {action.label}
                    <span className="text-slate-400"> · {format(parseISO(log.createdAt), 'HH:mm dd/MM/yyyy')}</span>
                  </p>
                  {log.note && (
                    <p className="text-slate-500">
                      {action.reason && <span className="font-semibold text-slate-600">Lý do: </span>}
                      {log.note}
                    </p>
                  )}
                  {log.changes.length > 0 && (
                    <ul className="mt-0.5 space-y-0.5 text-slate-600">
                      {log.changes.map((change) => (
                        <li key={change.field}>
                          {FIELD_LABELS[change.field] ?? change.field}:{' '}
                          <span className="text-slate-400 line-through">{displayValue(change.field, change.from, typeLabels)}</span>
                          {' → '}
                          <span className="font-medium text-slate-800">{displayValue(change.field, change.to, typeLabels)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
