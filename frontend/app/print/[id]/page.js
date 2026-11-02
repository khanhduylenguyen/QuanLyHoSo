'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { ArrowLeft, LoaderCircle, Printer } from 'lucide-react';
import { ACTIONS, FIELD_LABELS, displayValue } from '@/components/DossierHistory';
import { api } from '@/lib/api';
import { KET_QUA_TRINH_LABELS, TRANG_THAI_LABELS, formatDate, getUserName, isFieldHidden, submissionsOf } from '@/lib/dossier';
import { useAuth } from '@/lib/useAuth';

function Row({ label, children }) {
  return (
    <tr className="align-top">
      <th scope="row" className="w-[34%] border border-slate-400 bg-slate-50 px-2.5 py-1.5 text-left font-semibold print:bg-transparent">
        {label}
      </th>
      <td className="border border-slate-400 px-2.5 py-1.5">{children || <span className="text-slate-400">—</span>}</td>
    </tr>
  );
}

const optionalDate = (value) => (value ? formatDate(value) : '');

/** Phiếu theo dõi xử lý hồ sơ (khổ A4) — mở từ nút "In phiếu", tự mở hộp thoại in khi tải xong. */
export default function PrintDossierPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [dossier, setDossier] = useState(null);
  const [logs, setLogs] = useState([]);
  const [typeLabels, setTypeLabels] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user || !id) return;
    Promise.all([api.getDossier(id), api.getDossierLogs(id), api.getMeta()])
      .then(([one, history, meta]) => {
        setDossier(one.data);
        setLogs([...history.data].reverse()); // cũ → mới cho dễ theo dõi trên giấy
        setTypeLabels(Object.fromEntries(meta.data.phanLoai.map((rule) => [rule.ma, rule.moTa])));
      })
      .catch((loadError) => setError(loadError.message));
  }, [user, id]);

  useEffect(() => {
    if (!dossier) return undefined;
    document.title = `Phiếu theo dõi ${dossier.maHoSo}`;
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, [dossier]);

  if (error) {
    return <p className="m-8 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p>;
  }
  if (!dossier) {
    return (
      <p className="flex items-center justify-center gap-2 p-16 text-sm text-slate-500">
        <LoaderCircle className="h-5 w-5 animate-spin" /> Đang chuẩn bị phiếu…
      </p>
    );
  }

  const loai = [typeLabels[dossier.phanLoai] ?? dossier.phanLoai, dossier.loaiHoSoGoc].filter(Boolean).join(' — ');

  return (
    <div className="min-h-screen bg-slate-200 py-6 print:bg-white print:py-0">
      <style>{'@page { size: A4; margin: 15mm 15mm 15mm 20mm; }'}</style>

      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-2 print:hidden">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? window.history.back() : window.close())}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" /> Quay lại
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Printer className="h-4 w-4" /> In phiếu
        </button>
      </div>

      <article className="mx-auto max-w-[210mm] bg-white p-[15mm] text-[13px] leading-snug text-black shadow-lg print:max-w-none print:p-0 print:shadow-none">
        <header className="text-center">
          <p className="text-[12px] text-slate-600">Hệ thống Quản lý &amp; Theo dõi Hồ sơ</p>
          <h1 className="mt-2 text-lg font-bold uppercase">Phiếu theo dõi quá trình xử lý hồ sơ</h1>
          <p className="mt-1">
            Mã hồ sơ: <strong>{dossier.maHoSo}</strong>
            {dossier.soBienNhan && (
              <>
                {' '}· Số biên nhận: <strong>{dossier.soBienNhan}</strong>
              </>
            )}
          </p>
        </header>

        <h2 className="mb-1.5 mt-5 font-bold uppercase">I. Thông tin hồ sơ</h2>
        <table className="w-full border-collapse">
          <tbody>
            <Row label="Tên hồ sơ / chủ hồ sơ">{dossier.tenHoSo}</Row>
            <Row label="Địa chỉ">{dossier.diaChi}</Row>
            <Row label="Đơn vị gửi">{dossier.donViGui}</Row>
            <Row label="Loại thủ tục">{loai}</Row>
            <Row label="Ngày tiếp nhận">{formatDate(dossier.ngayVao)}</Row>
            <Row label="Ngày hẹn trả (biên nhận)">{optionalDate(dossier.ngayHenTra)}</Row>
            <Row label="Gia hạn đến">{optionalDate(dossier.ngayGiaHan)}</Row>
            <Row label="Hạn trình Lãnh đạo">{optionalDate(dossier.ngayTrinhLanhDao)}</Row>
            <Row label="Hạn xử lý">{optionalDate(dossier.ngayHetHan)}</Row>
            <Row label="Các lần trình Lãnh đạo">
              {submissionsOf(dossier).length > 0 && (
                <ol className="list-decimal pl-4">
                  {submissionsOf(dossier).map((item, index) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <li key={index}>
                      {formatDate(item.ngay)} — {KET_QUA_TRINH_LABELS[item.ketQua ?? '']}
                      {item.ghiChu && `: ${item.ghiChu}`}
                    </li>
                  ))}
                </ol>
              )}
            </Row>
            <Row label="Ngày kết thúc">{optionalDate(dossier.ngayKetThuc)}</Row>
            <Row label="Cán bộ thụ lý">{getUserName(dossier.canBoThuLy) || 'Chưa phân công'}</Row>
            <Row label="Trạng thái">{TRANG_THAI_LABELS[dossier.trangThai] ?? dossier.trangThai}</Row>
            <Row label="Diễn giải / tiến độ">{dossier.ghiChuCanBo}</Row>
            <Row label="Ghi chú">{dossier.ghiChu}</Row>
            {!isFieldHidden(dossier, 'chiDaoLanhDao') && <Row label="Chỉ đạo của Lãnh đạo">{dossier.chiDaoLanhDao}</Row>}
          </tbody>
        </table>

        <h2 className="mb-1.5 mt-5 font-bold uppercase">II. Quá trình xử lý</h2>
        {logs.length === 0 ? (
          <p className="italic text-slate-600">Chưa có thao tác nào được ghi nhận trong hệ thống.</p>
        ) : (
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>
                <th className="w-8 border border-slate-400 px-1.5 py-1">TT</th>
                <th className="w-[92px] border border-slate-400 px-1.5 py-1">Thời gian</th>
                <th className="w-[120px] border border-slate-400 px-1.5 py-1">Người thực hiện</th>
                <th className="border border-slate-400 px-1.5 py-1">Nội dung</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, index) => (
                <tr key={log._id} className="break-inside-avoid align-top">
                  <td className="border border-slate-400 px-1.5 py-1 text-center">{index + 1}</td>
                  <td className="border border-slate-400 px-1.5 py-1">{format(parseISO(log.createdAt), 'HH:mm dd/MM/yyyy')}</td>
                  <td className="border border-slate-400 px-1.5 py-1">{log.userName}</td>
                  <td className="border border-slate-400 px-1.5 py-1">
                    <strong>{ACTIONS[log.action]?.label ?? log.action}</strong>
                    {log.note && <span>{ACTIONS[log.action]?.reason ? ` — Lý do: ${log.note}` : ` — ${log.note}`}</span>}
                    {log.changes.length > 0 && (
                      <ul className="ml-4 list-disc">
                        {log.changes.map((change) => (
                          <li key={change.field}>
                            {FIELD_LABELS[change.field] ?? change.field}: {displayValue(change.field, change.from, typeLabels)} →{' '}
                            {displayValue(change.field, change.to, typeLabels)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="mt-4 text-right italic">Ngày in: {format(new Date(), 'HH:mm dd/MM/yyyy')}</p>
        <div className="mt-3 grid break-inside-avoid grid-cols-3 gap-4 text-center">
          {['Người lập phiếu', 'Cán bộ thụ lý', 'Lãnh đạo duyệt'].map((title, index) => (
            <div key={title}>
              <p className="font-bold">{title}</p>
              <p className="text-[11px] italic">(Ký, ghi rõ họ tên)</p>
              <div className="h-20" />
              <p>{index === 0 ? getUserName(user) : index === 1 ? getUserName(dossier.canBoThuLy) : ''}</p>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}
