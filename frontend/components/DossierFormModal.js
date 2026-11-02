'use client';

import { useEffect, useMemo, useState } from 'react';
import { format, isValid, parseISO } from 'date-fns';
import { CalendarClock, Cpu, FilePlus2, FilePen, KeyRound, Lock, Printer, Save, Send, X } from 'lucide-react';
import DossierHistory from '@/components/DossierHistory';
import DossierAttachments from '@/components/DossierAttachments';
import SubmissionsEditor from '@/components/SubmissionsEditor';
import {
  MUC_DO_UU_TIEN_LABELS,
  TRANG_THAI_LABELS,
  addDeadlineDays,
  dayUnit,
  getUserName,
  openPrintForm,
  submissionsOf,
  toDateInputValue,
} from '@/lib/dossier';

const emptyForm = (defaultLoai = '') => ({
  maHoSo: '',
  soBienNhan: '',
  tenHoSo: '',
  diaChi: '',
  phanLoai: defaultLoai,
  ngayVao: format(new Date(), 'yyyy-MM-dd'),
  ngayHenTra: '',
  ngayGiaHan: '',
  canBoThuLy: '',
  trangThai: 'MOI_TIEP_NHAN',
  ghiChuCanBo: '',
  ghiChu: '',
  chiDaoLanhDao: '',
  mucDoUuTien: 'TRUNG_BINH',
  lanTrinh: [],
  lyDo: '',
});

const toSubmissionRows = (dossier) =>
  submissionsOf(dossier).map((item) => ({ ngay: toDateInputValue(item.ngay), ketQua: item.ketQua ?? '', ghiChu: item.ghiChu ?? '' }));

const toFormState = (dossier) => ({
  maHoSo: dossier.maHoSo ?? '',
  soBienNhan: dossier.soBienNhan ?? '',
  tenHoSo: dossier.tenHoSo ?? '',
  diaChi: dossier.diaChi ?? '',
  phanLoai: dossier.phanLoai ?? '',
  ngayVao: toDateInputValue(dossier.ngayVao),
  ngayHenTra: toDateInputValue(dossier.ngayHenTra),
  ngayGiaHan: toDateInputValue(dossier.ngayGiaHan),
  canBoThuLy: dossier.canBoThuLy?._id ?? '',
  trangThai: dossier.trangThai ?? 'MOI_TIEP_NHAN',
  ghiChuCanBo: dossier.ghiChuCanBo ?? '',
  ghiChu: dossier.ghiChu ?? '',
  chiDaoLanhDao: dossier.chiDaoLanhDao ?? '',
  mucDoUuTien: dossier.mucDoUuTien ?? 'TRUNG_BINH',
  lanTrinh: toSubmissionRows(dossier),
  lyDo: '',
});

const formatInputDate = (value) => {
  const date = parseISO(value);
  return isValid(date) ? format(date, 'dd/MM/yyyy') : null;
};

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500';

function Label({ children, className = 'text-slate-700' }) {
  return <span className={`mb-1 flex items-center gap-1 font-semibold ${className}`}>{children}</span>;
}

/**
 * Form tiếp nhận / chỉnh sửa hồ sơ. Ngày trình & hạn xử lý chỉ là bản xem trước:
 * giá trị thật do backend tính lại trước khi .save().
 */
export default function DossierFormModal({ open, dossier, role, userId, meta, canBoList, onClose, onSubmit }) {
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  // Đổi key để tải lại Lịch sử xử lý sau khi đính kèm / gỡ tệp.
  const [historyKey, setHistoryKey] = useState(0);

  const isEdit = Boolean(dossier);
  const progressOnly = role === 'CAN_BO';
  const canSeeRestricted = role !== 'CAN_BO';

  useEffect(() => {
    if (!open) return;
    setForm(dossier ? toFormState(dossier) : emptyForm(meta?.phanLoai?.[0]?.ma ?? ''));
    setError(null);
  }, [open, dossier, meta]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const rule = useMemo(() => meta?.phanLoai?.find((item) => item.ma === form.phanLoai), [meta, form.phanLoai]);

  // Cùng quy tắc với backend: Gia hạn → Ngày hẹn trả → Ngày vào + hạn mặc định.
  const preview = useMemo(() => {
    const start = parseISO(form.ngayVao);
    if (!rule || !isValid(start)) return null;
    const override = formatInputDate(form.ngayGiaHan) ?? formatInputDate(form.ngayHenTra);
    return {
      trinh: format(addDeadlineDays(start, rule.trinh, meta?.calendar), 'dd/MM/yyyy'),
      hetHan: override ?? format(addDeadlineDays(start, rule.hetHan, meta?.calendar), 'dd/MM/yyyy'),
      hetHanNote: formatInputDate(form.ngayGiaHan)
        ? '(theo gia hạn)'
        : formatInputDate(form.ngayHenTra)
          ? '(theo biên nhận)'
          : `(+${rule.hetHan} ${dayUnit(meta?.calendar)})`,
    };
  }, [rule, meta, form.ngayVao, form.ngayHenTra, form.ngayGiaHan]);

  if (!open) return null;

  // Chuyển hồ sơ đang có người thụ lý / đặt hoặc đổi ngày gia hạn → bắt buộc lý do (backend kiểm tra lại).
  const transferring = isEdit && !progressOnly && Boolean(dossier.canBoThuLy) && form.canBoThuLy !== dossier.canBoThuLy._id;
  const extending = isEdit && !progressOnly && Boolean(form.ngayGiaHan) && form.ngayGiaHan !== toDateInputValue(dossier.ngayGiaHan);
  const needsReason = transferring || extending;

  const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    // Chỉ gửi các lần trình khi có thay đổi (tránh ghi đè ngày trình của hồ sơ cũ).
    const submissionsChanged = JSON.stringify(form.lanTrinh) !== JSON.stringify(dossier ? toSubmissionRows(dossier) : []);
    const lanTrinh = submissionsChanged ? { lanTrinh: form.lanTrinh.map((item) => ({ ...item, ghiChu: item.ghiChu.trim() })) } : {};
    const body = progressOnly
      ? { trangThai: form.trangThai, ghiChuCanBo: form.ghiChuCanBo.trim(), ...lanTrinh }
      : {
          maHoSo: form.maHoSo.trim(),
          soBienNhan: form.soBienNhan.trim(),
          tenHoSo: form.tenHoSo.trim(),
          diaChi: form.diaChi.trim(),
          phanLoai: form.phanLoai,
          ngayVao: form.ngayVao,
          ngayHenTra: form.ngayHenTra || null,
          ngayGiaHan: form.ngayGiaHan || null,
          canBoThuLy: form.canBoThuLy || null,
          trangThai: form.trangThai,
          ghiChuCanBo: form.ghiChuCanBo.trim(),
          ghiChu: form.ghiChu.trim(),
          chiDaoLanhDao: form.chiDaoLanhDao.trim() || null,
          mucDoUuTien: form.mucDoUuTien,
          ...lanTrinh,
          ...(needsReason && { lyDo: form.lyDo.trim() }),
        };

    try {
      await onSubmit(body);
    } catch (submitError) {
      const details = submitError.details ? Object.values(submitError.details).join('; ') : '';
      setError(details ? `${submitError.message}: ${details}` : submitError.message);
    } finally {
      setSubmitting(false);
    }
  };

  const HeaderIcon = isEdit ? FilePen : FilePlus2;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dossier-form-title"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="my-8 w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between bg-slate-900 px-6 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <HeaderIcon className="h-5 w-5 text-emerald-400" />
            <div>
              <h3 id="dossier-form-title" className="text-base font-bold">
                {isEdit ? `Chi tiết / Cập nhật hồ sơ ${dossier.maHoSo}` : 'Tiếp nhận / Nhập Hồ sơ Mới'}
              </h3>
              <p className="text-xs text-slate-400">
                {progressOnly
                  ? 'Cán bộ chỉ cập nhật Trạng thái & Ghi chú tiến độ trên hồ sơ của mình'
                  : 'Nhập Ngày vào hồ sơ để hệ thống tự động tính hạn trình LĐ và ngày hết hạn'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="p-1 text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6 text-xs sm:text-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="block">
              <Label>Mã Hồ sơ *</Label>
              <input
                required
                value={form.maHoSo}
                onChange={update('maHoSo')}
                disabled={progressOnly}
                className={`${inputClass} bg-slate-50 font-mono font-semibold text-slate-800`}
              />
            </label>
            <label className="block sm:col-span-2">
              <Label>Số biên nhận</Label>
              <input
                value={form.soBienNhan}
                onChange={update('soBienNhan')}
                disabled={progressOnly}
                placeholder="VD: H29.200-260106-17327"
                className={`${inputClass} font-mono`}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <Label>Tên hồ sơ (người nộp) *</Label>
              <input
                required
                value={form.tenHoSo}
                onChange={update('tenHoSo')}
                disabled={progressOnly}
                placeholder="VD: Nguyễn Văn A"
                className={inputClass}
              />
            </label>
            <label className="block">
              <Label>Địa chỉ</Label>
              <input
                value={form.diaChi}
                onChange={update('diaChi')}
                disabled={progressOnly}
                placeholder="VD: 245/1F Chu Văn An"
                className={inputClass}
              />
            </label>
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-700">
              <Cpu className="h-4 w-4" /> Tính toán hạn tự động theo Loại thủ tục &amp; Ngày vào
            </span>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <Label>Loại thủ tục *</Label>
                <select
                  value={form.phanLoai}
                  onChange={update('phanLoai')}
                  disabled={progressOnly}
                  className={`${inputClass} bg-white font-medium`}
                >
                  {(meta?.phanLoai ?? []).map((item) => (
                    <option key={item.ma} value={item.ma}>
                      {item.moTa} (hạn {item.hetHan} {dayUnit(meta?.calendar)})
                    </option>
                  ))}
                </select>
                {dossier?.loaiHoSoGoc && (
                  <span className="mt-1 block text-[11px] text-slate-500">Trong sổ: {dossier.loaiHoSoGoc}</span>
                )}
              </label>
              <label className="block">
                <Label>Ngày vào Hồ sơ *</Label>
                <input
                  type="date"
                  required
                  value={form.ngayVao}
                  onChange={update('ngayVao')}
                  disabled={progressOnly}
                  className={`${inputClass} bg-white font-semibold text-indigo-700`}
                />
              </label>
              <label className="block">
                <Label>Ngày hẹn trả (theo biên nhận)</Label>
                <input
                  type="date"
                  value={form.ngayHenTra}
                  onChange={update('ngayHenTra')}
                  disabled={progressOnly}
                  className={`${inputClass} bg-white`}
                />
              </label>
              <label className="block">
                <Label>Gia hạn (nếu có)</Label>
                <input
                  type="date"
                  value={form.ngayGiaHan}
                  onChange={update('ngayGiaHan')}
                  disabled={progressOnly}
                  className={`${inputClass} bg-white`}
                />
              </label>
            </div>
            <p className="text-[11px] text-slate-500">
              Để trống Ngày hẹn trả / Gia hạn thì hạn xử lý = Ngày vào + hạn mặc định của loại thủ tục.
            </p>

            <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-lg border border-sky-200 bg-sky-50 p-3">
                <div>
                  <span className="block text-[11px] font-semibold uppercase text-sky-700">⚡ Ngày phải trình Lãnh đạo</span>
                  <span className="text-base font-bold text-sky-900">{preview?.trinh ?? '--/--/----'}</span>
                  <span className="mt-0.5 block text-[11px] text-sky-700">{rule ? `(+${rule.trinh} ${dayUnit(meta?.calendar)})` : ''}</span>
                </div>
                <Send className="h-5 w-5 text-sky-500" />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div>
                  <span className="block text-[11px] font-semibold uppercase text-amber-800">⏰ Ngày hết hạn xử lý</span>
                  <span className="text-base font-bold text-amber-900">{preview?.hetHan ?? '--/--/----'}</span>
                  <span className="mt-0.5 block text-[11px] text-amber-800">{preview?.hetHanNote ?? ''}</span>
                </div>
                <CalendarClock className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </div>

          <SubmissionsEditor
            value={form.lanTrinh}
            onChange={(lanTrinh) => setForm((prev) => ({ ...prev, lanTrinh }))}
            minDate={form.ngayVao || undefined}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <Label>Phân công Cán bộ thụ lý</Label>
              {progressOnly ? (
                <input value={getUserName(dossier?.canBoThuLy)} disabled className={inputClass} />
              ) : (
                <select value={form.canBoThuLy} onChange={update('canBoThuLy')} className={`${inputClass} bg-white`}>
                  <option value="">— Chưa phân công —</option>
                  {canBoList.map((user) => (
                    <option key={user._id} value={user._id}>
                      {getUserName(user)}
                    </option>
                  ))}
                </select>
              )}
              <span className="mt-1 block text-[11px] text-slate-500">
                Cán bộ nào được phân công chỉ xem &amp; sửa được hồ sơ của mình.
              </span>
            </label>
            <label className="block">
              <Label>Trạng thái xử lý</Label>
              <select value={form.trangThai} onChange={update('trangThai')} className={`${inputClass} bg-white`}>
                {Object.entries(TRANG_THAI_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <Label>Diễn giải / Báo cáo tiến độ của Cán bộ</Label>
            <textarea
              rows={2}
              value={form.ghiChuCanBo}
              onChange={update('ghiChuCanBo')}
              placeholder="VD: Tờ trình số 14 ngày 17/01/2026…"
              className={inputClass}
            />
          </label>

          {!progressOnly && (
            <label className="block">
              <Label>Ghi chú</Label>
              <input value={form.ghiChu} onChange={update('ghiChu')} className={inputClass} />
            </label>
          )}

          {canSeeRestricted ? (
            <div className="grid grid-cols-1 gap-4 border-t border-slate-200 pt-2 sm:grid-cols-2">
              <label className="block">
                <Label className="text-indigo-900">
                  <Lock className="h-3.5 w-3.5 text-amber-500" /> Chỉ đạo của Lãnh đạo (Giới hạn quyền)
                </Label>
                <input
                  value={form.chiDaoLanhDao}
                  onChange={update('chiDaoLanhDao')}
                  placeholder="Nhập chỉ đạo của Lãnh đạo…"
                  className={`${inputClass} border-indigo-200 bg-indigo-50/40`}
                />
              </label>
              <label className="block">
                <Label className="text-rose-900">
                  <KeyRound className="h-3.5 w-3.5 text-rose-500" /> Mức độ ưu tiên nội bộ (Cột Mật)
                </Label>
                <select
                  value={form.mucDoUuTien}
                  onChange={update('mucDoUuTien')}
                  className={`${inputClass} border-rose-200 bg-rose-50/40 focus:ring-rose-500`}
                >
                  {(meta?.mucDoUuTien ?? Object.keys(MUC_DO_UU_TIEN_LABELS)).map((value) => (
                    <option key={value} value={value}>
                      {MUC_DO_UU_TIEN_LABELS[value] || value}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              <Lock className="h-4 w-4 shrink-0 text-amber-500" />
              Chỉ đạo của Lãnh đạo và Mức độ ưu tiên nội bộ bị giới hạn với tài khoản của bạn.
            </div>
          )}

          {needsReason && (
            <label className="block rounded-lg border border-violet-200 bg-violet-50/60 p-3">
              <Label className="text-violet-900">
                Lý do {extending ? 'gia hạn' : 'chuyển cán bộ thụ lý'} <span className="text-rose-600">*</span>
              </Label>
              <textarea
                rows={2}
                required
                maxLength={500}
                value={form.lyDo}
                onChange={update('lyDo')}
                placeholder="Lý do được ghi vào Lịch sử xử lý của hồ sơ"
                className={`${inputClass} bg-white`}
              />
            </label>
          )}

          {isEdit && (
            <DossierAttachments dossierId={dossier._id} userId={userId} role={role} onChanged={() => setHistoryKey((k) => k + 1)} />
          )}
          {isEdit && <DossierHistory key={historyKey} dossierId={dossier._id} meta={meta} />}

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700" role="alert">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 pt-3">
            {isEdit && (
              <button
                type="button"
                onClick={() => openPrintForm(dossier)}
                className="mr-auto flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                <Printer className="h-4 w-4" />
                In phiếu theo dõi
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={submitting || (needsReason && !form.lyDo.trim())}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {submitting ? 'Đang lưu…' : 'Lưu Hồ sơ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
