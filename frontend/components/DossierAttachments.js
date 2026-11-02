'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Download, Eye, FileText, Image as ImageIcon, LoaderCircle, Paperclip, Trash2, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { saveBlob } from '@/lib/download';

const formatSize = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

// Xem nhanh trong tab mới được với PDF / ảnh; định dạng khác thì tải xuống.
const canPreview = (mimeType) => mimeType === 'application/pdf' || mimeType.startsWith('image/');

/** Danh sách + tải lên tệp đính kèm của một hồ sơ (nằm trong form chi tiết). */
export default function DossierAttachments({ dossierId, userId, role, onChanged }) {
  const [items, setItems] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loai, setLoai] = useState('BIEN_NHAN');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const canManageAll = role === 'ADMIN' || role === 'VAN_THU';

  const load = useCallback(() => {
    api
      .getAttachments(dossierId)
      .then(({ data, meta: info }) => {
        setItems(data);
        setMeta(info);
      })
      .catch((loadError) => setError(loadError.message));
  }, [dossierId]);

  useEffect(() => {
    setItems(null);
    setError(null);
    load();
  }, [load]);

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (meta && file.size > meta.maxBytes) {
      setError(`Tệp quá lớn (tối đa ${meta.maxBytes / 1024 / 1024} MB)`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.uploadAttachment(dossierId, file, loai);
      load();
      onChanged?.();
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setBusy(false);
    }
  };

  const open = async (item) => {
    setError(null);
    // Mở tab ngay trong lúc click (sau await trình duyệt sẽ chặn popup), rồi nạp tệp vào.
    const preview = canPreview(item.mimeType) ? window.open('', '_blank') : null;
    try {
      const blob = await api.downloadAttachment(item._id);
      if (preview) {
        const url = URL.createObjectURL(blob);
        preview.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        saveBlob(blob, item.originalName);
      }
    } catch (openError) {
      preview?.close();
      setError(openError.message);
    }
  };

  const download = async (item) => {
    setError(null);
    try {
      saveBlob(await api.downloadAttachment(item._id), item.originalName);
    } catch (downloadError) {
      setError(downloadError.message);
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Gỡ tệp "${item.originalName}" khỏi hồ sơ?`)) return;
    setError(null);
    try {
      await api.deleteAttachment(item._id);
      setItems((prev) => prev.filter((x) => x._id !== item._id));
      onChanged?.();
    } catch (removeError) {
      setError(removeError.message);
    }
  };

  const types = meta?.types ?? { BIEN_NHAN: 'Biên nhận / hồ sơ scan', TO_TRINH: 'Tờ trình', KET_QUA: 'Kết quả giải quyết', KHAC: 'Khác' };

  return (
    <div className="border-t border-slate-200 pt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
          <Paperclip className="h-4 w-4" /> Tệp đính kèm {items && items.length > 0 && `(${items.length})`}
        </h4>
        <div className="flex items-center gap-2">
          <select
            value={loai}
            onChange={(event) => setLoai(event.target.value)}
            aria-label="Loại tệp"
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
          >
            {Object.entries(types).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={(meta?.extensions ?? ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx', '.xls', '.xlsx']).join(',')}
            onChange={handleUpload}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Tải tệp lên
          </button>
        </div>
      </div>

      {error && <p className="mb-2 text-xs text-rose-600">{error}</p>}
      {!items && !error && (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Đang tải…
        </p>
      )}
      {items && items.length === 0 && (
        <p className="text-xs text-slate-500">Chưa có tệp nào. Nhận PDF, ảnh JPG/PNG, Word, Excel — tối đa 20 MB mỗi tệp.</p>
      )}
      {items && items.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {items.map((item) => {
            const Icon = item.mimeType.startsWith('image/') ? ImageIcon : FileText;
            const canRemove = canManageAll || String(item.uploadedBy) === String(userId);
            return (
              <li key={item._id} className="flex items-center gap-2.5 px-3 py-2 text-xs">
                <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => open(item)}
                    className="block max-w-full truncate text-left font-medium text-indigo-700 hover:underline"
                    title={item.originalName}
                  >
                    {item.originalName}
                  </button>
                  <p className="text-slate-500">
                    {types[item.loai] ?? item.loai} · {formatSize(item.size)} · {item.uploadedByName} ·{' '}
                    {format(parseISO(item.createdAt), 'HH:mm dd/MM/yyyy')}
                  </p>
                </div>
                {canPreview(item.mimeType) && (
                  <button type="button" onClick={() => open(item)} title="Xem" aria-label={`Xem ${item.originalName}`} className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-indigo-700">
                    <Eye className="h-4 w-4" />
                  </button>
                )}
                <button type="button" onClick={() => download(item)} title="Tải xuống" aria-label={`Tải xuống ${item.originalName}`} className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-indigo-700">
                  <Download className="h-4 w-4" />
                </button>
                {canRemove && (
                  <button type="button" onClick={() => remove(item)} title="Gỡ tệp" aria-label={`Gỡ ${item.originalName}`} className="rounded p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-700">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
