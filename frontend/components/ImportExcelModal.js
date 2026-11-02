'use client';

import { useCallback, useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  ArrowLeft,
  CircleCheck,
  Download,
  FileSpreadsheet,
  History,
  LoaderCircle,
  TriangleAlert,
  Undo2,
  Upload,
  UserPlus,
} from 'lucide-react';
import Modal from '@/components/admin/Modal';
import { api } from '@/lib/api';
import { TRANG_THAI_LABELS, phanLoaiStyle } from '@/lib/dossier';
import { saveBlob } from '@/lib/download';

// Cùng ngưỡng với backend (UNDO_CONFIRM_MIN): lần nhập từ ngần này hồ sơ phải gõ lại số lượng khi hoàn tác.
const UNDO_CONFIRM_MIN = 20;

const formatDay = (value) => (value ? format(parseISO(value), 'dd/MM/yyyy') : '—');
const formatSize = (bytes) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`);

function Stat({ label, value, tone = 'text-slate-900' }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-0.5 text-xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function SectionTitle({ children }) {
  return <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">{children}</h4>;
}

/** Tải file mẫu: gọi API kèm token rồi tạo link tải từ blob. */
async function downloadTemplate() {
  saveBlob(await api.importTemplate(), 'mau-nhap-ho-so.xlsx');
}

/**
 * Nhập hồ sơ từ Excel: chọn file → xem trước (hồ sơ mới / trùng / cán bộ / vấn đề) → xác nhận.
 * Mỗi lần nhập có thể hoàn tác (xoá đúng các hồ sơ của lần đó).
 */
export default function ImportExcelModal({ open, onClose, onImported, pushToast }) {
  const [step, setStep] = useState('select'); // select | preview | done
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [createNewOfficers, setCreateNewOfficers] = useState(true);
  const [result, setResult] = useState(null);
  const [batches, setBatches] = useState([]);

  const loadBatches = useCallback(() => {
    api.importBatches().then(({ data }) => setBatches(data)).catch(() => setBatches([]));
  }, []);

  useEffect(() => {
    if (!open) return;
    setStep('select');
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setCreateNewOfficers(true);
    loadBatches();
  }, [open, loadBatches]);

  const pickFile = (candidate) => {
    if (!candidate) return;
    if (!/\.xlsx$/i.test(candidate.name)) {
      setError('Chỉ nhận file .xlsx (file .xls cũ: mở bằng Excel rồi Lưu thành .xlsx)');
      return;
    }
    setError(null);
    setFile(candidate);
  };

  const run = async (action) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy(false);
    }
  };

  const handlePreview = () =>
    run(async () => {
      const { data } = await api.importPreview(file);
      setPreview(data);
      setStep('preview');
    });

  const handleCommit = () =>
    run(async () => {
      const { data } = await api.importCommit(preview.importId, { createNewOfficers });
      setResult(data);
      setStep('done');
      onImported?.(data);
    });

  const handleUndo = (batch) => {
    const label = batch.fileName ? `"${batch.fileName}"` : 'này';
    const warning = `Hoàn tác lần nhập ${label} sẽ XOÁ VĨNH VIỄN ${batch.count} hồ sơ đã nhập từ file này (kể cả mọi chỉnh sửa, lần trình, tệp đính kèm sau đó).`;
    // Lần nhập lớn: phải gõ lại đúng số hồ sơ, tránh bấm nhầm xoá cả sổ.
    if (batch.count >= UNDO_CONFIRM_MIN) {
      const typed = window.prompt(`${warning}\n\nGõ số ${batch.count} để xác nhận:`);
      if (typed === null) return;
      if (Number(typed.trim()) !== batch.count) {
        window.alert('Số không khớp — đã huỷ, không xoá gì.');
        return;
      }
    } else if (!window.confirm(`${warning}\n\nTiếp tục?`)) {
      return;
    }
    run(async () => {
      const { data } = await api.importUndo(batch.batchId, batch.count);
      pushToast?.(`Đã hoàn tác: xoá ${data.deleted} hồ sơ`, 'info');
      if (step === 'done') setResult(null);
      loadBatches();
      onImported?.(null);
    });
  };

  const summary = preview?.summary;
  const newOfficerNames = summary?.newOfficerNames ?? [];
  const officersToCreate = (summary?.officers ?? []).filter((o) => o.isNew).length + (createNewOfficers ? newOfficerNames.length : 0);

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      icon={FileSpreadsheet}
      title="Nhập hồ sơ từ Excel"
      subtitle={
        step === 'select'
          ? 'Chọn file .xlsx — hệ thống đọc và cho xem trước, chưa ghi gì cho tới khi bạn xác nhận'
          : step === 'preview'
            ? `Xem trước: ${preview.fileName}`
            : 'Đã nhập xong'
      }
      maxWidth="max-w-4xl"
    >
      <div className="space-y-5 p-6 text-sm">
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {step === 'select' && (
          <>
            <label
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                pickFile(event.dataTransfer.files?.[0]);
              }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
                dragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50/40'
              }`}
            >
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                onChange={(event) => pickFile(event.target.files?.[0])}
              />
              <Upload className="h-8 w-8 text-indigo-500" />
              {file ? (
                <>
                  <span className="font-semibold text-slate-900">{file.name}</span>
                  <span className="text-xs text-slate-500">{formatSize(file.size)} — bấm để chọn file khác</span>
                </>
              ) : (
                <>
                  <span className="font-semibold text-slate-800">Kéo thả file Excel vào đây hoặc bấm để chọn</span>
                  <span className="text-xs text-slate-500">
                    File mẫu của hệ thống hoặc sổ theo dõi cũ (nhiều sheet) — cần cột “Tên hồ sơ” và “Ngày nhận”. Tối đa 15 MB.
                  </span>
                </>
              )}
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => run(downloadTemplate)}
                disabled={busy}
                className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
              >
                <Download className="h-4 w-4" /> Tải file mẫu (có danh sách chọn Loại thủ tục & Cán bộ)
              </button>
              <button
                type="button"
                onClick={handlePreview}
                disabled={!file || busy}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                {busy ? 'Đang đọc file…' : 'Đọc file & xem trước'}
              </button>
            </div>

            {batches.length > 0 && (
              <div className="border-t border-slate-200 pt-4">
                <SectionTitle>
                  <span className="flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5" /> Các lần nhập gần đây
                  </span>
                </SectionTitle>
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {batches.map((batch) => (
                    <li key={batch.batchId} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-slate-800">{batch.fileName || '(không rõ tên file)'}</span>
                        <span className="text-slate-500">
                          {batch.count} hồ sơ · {format(parseISO(batch.importedAt), 'HH:mm dd/MM/yyyy')}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUndo(batch)}
                        disabled={busy}
                        className="flex shrink-0 items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1 font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                      >
                        <Undo2 className="h-3.5 w-3.5" /> Hoàn tác
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {step === 'preview' && summary && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Dòng đọc được" value={summary.totalRows} />
              <Stat label="Hồ sơ mới sẽ nhập" value={summary.newCount} tone="text-emerald-700" />
              <Stat label="Đã có — bỏ qua" value={summary.duplicateCount} tone="text-slate-500" />
              <Stat label="Tài khoản CB mới" value={officersToCreate} tone="text-indigo-700" />
            </div>

            {summary.newCount === 0 && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                Không có hồ sơ mới — mọi dòng trong file đều đã có trong hệ thống hoặc thiếu Tên / Ngày nhận.
              </p>
            )}

            {summary.sheets.length > 1 && (
              <div>
                <SectionTitle>Các sheet</SectionTitle>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-600">
                      <tr>
                        <th className="px-3 py-2">Sheet</th>
                        <th className="px-3 py-2 text-right">Dòng</th>
                        <th className="px-3 py-2 text-right">Gộp vào sheet khác</th>
                        <th className="px-3 py-2 text-right">Hồ sơ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {summary.sheets.map((s) => (
                        <tr key={s.sheet}>
                          <td className="px-3 py-1.5 font-medium text-slate-800">{s.sheet}</td>
                          <td className="px-3 py-1.5 text-right">{s.read}</td>
                          <td className="px-3 py-1.5 text-right text-slate-500">{s.merged}</td>
                          <td className="px-3 py-1.5 text-right font-semibold">{s.added}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {summary.newCount > 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <SectionTitle>Trạng thái</SectionTitle>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(summary.byStatus).map(([status, count]) => (
                      <span key={status} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                        {TRANG_THAI_LABELS[status] ?? status}: <strong>{count}</strong>
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <SectionTitle>Loại thủ tục</SectionTitle>
                  <div className="flex flex-wrap gap-1.5">
                    {summary.byType.map((t) => (
                      <span key={t.ma} className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${phanLoaiStyle(t.ma)}`}>
                        {t.moTa}: <strong>{t.count}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {(summary.officers.length > 0 || newOfficerNames.length > 0) && (
              <div>
                <SectionTitle>Cán bộ thụ lý ({summary.unassigned} hồ sơ chưa phân công)</SectionTitle>
                <div className="flex flex-wrap gap-1.5">
                  {summary.officers.map((o) => (
                    <span
                      key={o.name}
                      title={o.variants.join('\n')}
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                        o.isNew ? 'border-indigo-200 bg-indigo-50 text-indigo-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      }`}
                    >
                      {o.name}: <strong>{o.count}</strong>
                      {o.isNew && ' · tạo mới'}
                    </span>
                  ))}
                </div>

                {newOfficerNames.length > 0 && (
                  <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <input
                      type="checkbox"
                      checked={createNewOfficers}
                      onChange={(event) => setCreateNewOfficers(event.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-indigo-600"
                    />
                    <span>
                      <span className="flex items-center gap-1 font-semibold">
                        <UserPlus className="h-3.5 w-3.5" /> Tạo tài khoản cho {newOfficerNames.length} tên cán bộ chưa có trong hệ thống:
                      </span>
                      <span className="mt-1 block">
                        {newOfficerNames.map((n) => `${n.name} (${n.count} HS → @${n.username})`).join(', ')}
                      </span>
                      <span className="mt-1 block text-amber-700">
                        Bỏ chọn nếu đây không phải tên cán bộ — các hồ sơ đó sẽ để Chưa phân công, tên gốc giữ ở Ghi chú.
                      </span>
                    </span>
                  </label>
                )}
                {officersToCreate > 0 && (
                  <p className="mt-2 text-[11px] text-slate-500">
                    Tài khoản mới chưa có mật khẩu — Quản trị đặt mật khẩu trong trang Quản trị hệ thống để cán bộ đăng nhập.
                  </p>
                )}
              </div>
            )}

            {summary.issueCount > 0 && (
              <details className="rounded-lg border border-slate-200">
                <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-slate-700">
                  <TriangleAlert className="mr-1 inline h-3.5 w-3.5 text-amber-500" />
                  {summary.issueCount} dòng cần lưu ý (đã tự xử lý / bỏ qua) — bấm để xem
                </summary>
                <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto border-t border-slate-200 text-xs">
                  {preview.issues.map((issue, i) => (
                    <li key={`${issue.sheet}-${issue.dong}-${i}`} className="px-3 py-1.5">
                      <span className="text-slate-400">
                        {issue.sheet} · dòng {issue.dong}:
                      </span>{' '}
                      <span className="text-slate-800">{issue.message}</span>
                      {issue.value && <span className="text-slate-500"> — {issue.value}</span>}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {preview.sample.length > 0 && (
              <div>
                <SectionTitle>
                  Hồ sơ mới (xem {preview.sample.length}/{summary.newCount})
                </SectionTitle>
                <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-slate-100 text-slate-600">
                      <tr>
                        <th className="px-3 py-2">Mã (tạm)</th>
                        <th className="px-3 py-2">Tên / Địa chỉ</th>
                        <th className="px-3 py-2">Loại</th>
                        <th className="px-3 py-2">Ngày nhận</th>
                        <th className="px-3 py-2">Hẹn trả</th>
                        <th className="px-3 py-2">Cán bộ</th>
                        <th className="px-3 py-2">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {preview.sample.map((r) => (
                        <tr key={`${r.sheet}-${r.dong}`}>
                          <td className="px-3 py-1.5 font-mono">{r.maHoSo}</td>
                          <td className="px-3 py-1.5">
                            <span className="block font-medium text-slate-900">{r.tenHoSo}</span>
                            <span className="text-slate-500">{r.diaChi}</span>
                          </td>
                          <td className="px-3 py-1.5">
                            <span className={`rounded border px-1.5 py-0.5 ${phanLoaiStyle(r.phanLoai)}`}>
                              {summary.byType.find((t) => t.ma === r.phanLoai)?.moTa ?? r.phanLoai}
                            </span>
                          </td>
                          <td className="px-3 py-1.5">{formatDay(r.ngayVao)}</td>
                          <td className="px-3 py-1.5">{formatDay(r.ngayHenTra)}</td>
                          <td className="px-3 py-1.5">
                            {r.canBo ? (
                              <>
                                {r.canBo}
                                {r.canBoMoi && !createNewOfficers && <span className="text-amber-600"> (sẽ để trống)</span>}
                              </>
                            ) : (
                              <span className="text-amber-600">Chưa phân công</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5">{TRANG_THAI_LABELS[r.trangThai] ?? r.trangThai}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Mã hồ sơ: dùng Số biên nhận; thiếu thì tạo theo sheet + năm + STT. Mã chính thức cấp lúc ghi.
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => setStep('select')}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                <ArrowLeft className="h-4 w-4" /> Chọn file khác
              </button>
              <button
                type="button"
                onClick={handleCommit}
                disabled={busy || summary.newCount === 0}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CircleCheck className="h-4 w-4" />}
                {busy ? 'Đang nhập…' : `Nhập ${summary.newCount} hồ sơ`}
              </button>
            </div>
          </>
        )}

        {step === 'done' && (
          <div className="space-y-4 text-center">
            {result ? (
              <>
                <CircleCheck className="mx-auto h-12 w-12 text-emerald-500" />
                <div>
                  <p className="text-base font-bold text-slate-900">Đã nhập {result.inserted} hồ sơ</p>
                  <p className="text-xs text-slate-500">
                    Từ file {result.fileName}
                    {result.officersCreated > 0 && ` · tạo ${result.officersCreated} tài khoản cán bộ (chưa có mật khẩu)`}
                  </p>
                </div>
                <div className="flex justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleUndo({ batchId: result.batchId, fileName: result.fileName, count: result.inserted })}
                    disabled={busy}
                    className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  >
                    <Undo2 className="h-4 w-4" /> Hoàn tác lần nhập này
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg bg-indigo-600 px-5 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                  >
                    Xong
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="font-semibold text-slate-700">Đã hoàn tác lần nhập.</p>
                <button type="button" onClick={onClose} className="rounded-lg bg-indigo-600 px-5 py-2 text-xs font-semibold text-white">
                  Đóng
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
