'use client';

import { useEffect, useMemo, useState } from 'react';
import { addDays, format, isValid, parseISO } from 'date-fns';
import { CalendarClock, Cpu, FilePlus2, FilePen, KeyRound, Lock, Printer, Save, Send, X } from 'lucide-react';
import DossierHistory from '@/components/DossierHistory';
import DossierAttachments from '@/components/DossierAttachments';
import SubmissionsEditor from '@/components/SubmissionsEditor';
import GcnStepsEditor, { GCN_STEP_DATE_KEYS } from '@/components/GcnStepsEditor';
import {
  BUOC_LABELS,
  MUC_DO_UU_TIEN_LABELS,
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
  ghiChuCanBo: '',
  ghiChu: '',
  chiDaoLanhDao: '',
  mucDoUuTien: 'TRUNG_BINH',
  lanTrinh: [],
  lyDo: '',
  // Quy trình GCN
  ngayChuyen: '',
  to: '',
  ghiChuUuTien: '',
  congNhanThemDat: false,
  capGCN: true,
  buoc: 'DANG_THU_LY',
  soGCN: '',
  giaiTrinh: '',
  ...Object.fromEntries(GCN_STEP_DATE_KEYS.map((key) => [key, ''])),
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
  ghiChuCanBo: dossier.ghiChuCanBo ?? '',
  ghiChu: dossier.ghiChu ?? '',
  chiDaoLanhDao: dossier.chiDaoLanhDao ?? '',
  mucDoUuTien: dossier.mucDoUuTien ?? 'TRUNG_BINH',
  lanTrinh: toSubmissionRows(dossier),
  lyDo: '',
  ngayChuyen: toDateInputValue(dossier.ngayChuyen),
  to: dossier.to ?? '',
  ghiChuUuTien: dossier.ghiChuUuTien ?? '',
  congNhanThemDat: Boolean(dossier.congNhanThemDat),
  capGCN: Boolean(dossier.capGCN),
  buoc: dossier.buoc ?? 'DANG_THU_LY',
  soGCN: dossier.soGCN ?? '',
  giaiTrinh: dossier.giaiTrinh ?? '',
  ...Object.fromEntries(GCN_STEP_DATE_KEYS.map((key) => [key, toDateInputValue(dossier[key])])),
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

  // Cùng quy tắc với backend (gcn.js): hạn trình NY = Ngày vào + N ngày làm việc;
  // hạn trả = Gia hạn → (Ngày hẹn trả hoặc Ngày vào + hạn của loại) + thời gian niêm yết.
  const preview = useMemo(() => {
    const start = parseISO(form.ngayVao);
    const q = meta?.quyTrinh;
    if (!rule || !q || !isValid(start)) return null;
    const henTra = parseISO(form.ngayHenTra);
    const base = isValid(henTra) ? henTra : addDeadlineDays(start, rule.hetHan, meta?.calendar);
    const due = rule.niemYet ? addDays(base, q.henTraCongNY) : base;
    return {
      trinhNY: format(addDeadlineDays(start, q.trinhNY, meta?.calendar), 'dd/MM/yyyy'),
      trinhNYNote: `(+${q.trinhNY} ${dayUnit(meta?.calendar)})`,
      hetHan: formatInputDate(form.ngayGiaHan) ?? format(due, 'dd/MM/yyyy'),
      hetHanNote: formatInputDate(form.ngayGiaHan)
        ? '(theo gia hạn)'
        : `(${isValid(henTra) ? 'hẹn trả theo BN' : `+${rule.hetHan} ${dayUnit(meta?.calendar)}`}${rule.niemYet ? ` + ${q.henTraCongNY} ngày niêm yết` : ''})`,
    };
  }, [rule, meta, form.ngayVao, form.ngayHenTra, form.ngayGiaHan]);

  if (!open) return null;

  // Chuyển hồ sơ đang có người thụ lý / đặt hoặc đổi ngày gia hạn → bắt buộc lý do (backend kiểm tra lại).
  const transferring = isEdit && !progressOnly && Boolean(dossier.canBoThuLy) && form.canBoThuLy !== dossier.canBoThuLy._id;
  const extending = isEdit && !progressOnly && Boolean(form.ngayGiaHan) && form.ngayGiaHan !== toDateInputValue(dossier.ngayGiaHan);
  const needsReason = transferring || extending;

  const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));
  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    // Chỉ gửi các lần trình khi có thay đổi (tránh ghi đè ngày trình của hồ sơ cũ).
    const submissionsChanged = JSON.stringify(form.lanTrinh) !== JSON.stringify(dossier ? toSubmissionRows(dossier) : []);
    const lanTrinh = submissionsChanged ? { lanTrinh: form.lanTrinh.map((item) => ({ ...item, ghiChu: item.ghiChu.trim() })) } : {};
    // Bước quy trình + ngày từng bước: cán bộ thụ lý cũng cập nhật được. Ô trống gửi null.
    const steps = {
      buoc: form.buoc,
      soGCN: form.soGCN.trim(),
      giaiTrinh: form.giaiTrinh.trim(),
      ...Object.fromEntries(GCN_STEP_DATE_KEYS.map((key) => [key, form[key] || null])),
    };
    const body = progressOnly
      ? { ghiChuCanBo: form.ghiChuCanBo.trim(), ...steps, ...lanTrinh }
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
          ngayChuyen: form.ngayChuyen || null,
          to: form.to.trim(),
          ghiChuUuTien: form.ghiChuUuTien.trim(),
          congNhanThemDat: form.congNhanThemDat,
          capGCN: form.capGCN,
          ...steps,
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
      <div className="my-8 w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between bg-slate-900 px-6 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <HeaderIcon className="h-5 w-5 text-emerald-400" />
            <div>
              <h3 id="dossier-form-title" className="text-base font-bold">
                {isEdit ? `Chi tiết / Cập nhật hồ sơ ${dossier.maHoSo}` : 'Tiếp nhận / Nhập Hồ sơ Mới'}
              </h3>
              <p className="text-xs text-slate-400">
                {progressOnly
                  ? 'Cán bộ cập nhật tình trạng, ngày từng bước và tiến độ trên hồ sơ của mình'
                  : 'Nhập Ngày nhận để hệ thống tự tính hạn trình niêm yết và hạn trả hồ sơ'}
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

          <label className="block">
            <Label className="text-amber-800">Ghi chú ưu tiên (Lãnh đạo xem)</Label>
            <input
              value={form.ghiChuUuTien}
              onChange={update('ghiChuUuTien')}
              disabled={progressOnly}
              placeholder="Hồ sơ cần ưu tiên / lưu ý cho Lãnh đạo…"
              className={`${inputClass} border-amber-200 bg-amber-50/40`}
            />
          </label>

          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-700">
              <Cpu className="h-4 w-4" /> Tính hạn tự động theo Loại hồ sơ &amp; Ngày nhận
            </span>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <Label>Loại hồ sơ *</Label>
                <select
                  value={form.phanLoai}
                  onChange={update('phanLoai')}
                  disabled={progressOnly}
                  className={`${inputClass} bg-white font-medium`}
                >
                  {(meta?.phanLoai ?? []).map((item) => (
                    <option key={item.ma} value={item.ma}>
                      {item.moTa} (hạn {item.hetHan} {dayUnit(meta?.calendar)}{item.niemYet ? ' + niêm yết' : ''})
                    </option>
                  ))}
                </select>
                {dossier?.loaiHoSoGoc && (
                  <span className="mt-1 block text-[11px] text-slate-500">Trong sổ: {dossier.loaiHoSoGoc}</span>
                )}
                <span className="mt-1.5 flex gap-4 text-[11px] text-slate-600">
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={form.capGCN} disabled={progressOnly} onChange={(e) => setField('capGCN', e.target.checked)} />
                    Cấp GCN
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={form.congNhanThemDat}
                      disabled={progressOnly}
                      onChange={(e) => setField('congNhanThemDat', e.target.checked)}
                    />
                    Công nhận thêm đất
                  </label>
                </span>
              </label>
              <label className="block">
                <Label>Ngày nhận *</Label>
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
                <Label>Ngày chuyển</Label>
                <input type="date" value={form.ngayChuyen} onChange={update('ngayChuyen')} disabled={progressOnly} className={`${inputClass} bg-white`} />
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
              Để trống Ngày hẹn trả thì hạn trả = Ngày nhận + hạn mặc định của loại; loại có niêm yết cộng thêm thời gian niêm yết.
            </p>

            <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-lg border border-sky-200 bg-sky-50 p-3">
                <div>
                  <span className="block text-[11px] font-semibold uppercase text-sky-700">⚡ Hạn trình niêm yết lên UB</span>
                  <span className="text-base font-bold text-sky-900">{form.hanTrinhNY ? formatInputDate(form.hanTrinhNY) : preview?.trinhNY ?? '--/--/----'}</span>
                  <span className="mt-0.5 block text-[11px] text-sky-700">{form.hanTrinhNY ? '(đã đặt)' : preview?.trinhNYNote ?? ''}</span>
                </div>
                <Send className="h-5 w-5 text-sky-500" />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div>
                  <span className="block text-[11px] font-semibold uppercase text-amber-800">⏰ Hạn trả hồ sơ</span>
                  <span className="text-base font-bold text-amber-900">{preview?.hetHan ?? '--/--/----'}</span>
                  <span className="mt-0.5 block text-[11px] text-amber-800">{preview?.hetHanNote ?? ''}</span>
                </div>
                <CalendarClock className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </div>

          <GcnStepsEditor form={form} onField={setField} steps={meta?.buoc ?? BUOC_LABELS} quyTrinh={meta?.quyTrinh} />

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
              <Label>Tổ</Label>
              <input
                value={form.to}
                onChange={update('to')}
                disabled={progressOnly}
                list="to-options"
                placeholder="VD: TN-MT"
                className={inputClass}
              />
              <datalist id="to-options">
                <option value="TN-MT" />
                <option value="XD-CT" />
              </datalist>
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
