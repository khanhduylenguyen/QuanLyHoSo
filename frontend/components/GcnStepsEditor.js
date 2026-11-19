'use client';

import { ListChecks } from 'lucide-react';

// Nhóm ô theo đúng nhóm cột của sheet "DANH SÁCH GCN 2026". auto = khoá cấu hình số ngày (Quản trị → Cấu hình hạn):
// khi đã cấu hình, ô hạn để trống sẽ được hệ thống tự tính lúc lưu.
export const GCN_STEP_GROUPS = [
  {
    title: 'Trình Lãnh đạo phòng',
    fields: [{ key: 'ngayTrinhLDP', label: 'Ngày trình LĐP' }],
  },
  {
    title: 'Niêm yết (15 ngày liên tục)',
    fields: [
      { key: 'hanTrinhNY', label: 'Hạn trình NY lên UB', auto: 'trinhNY' },
      { key: 'ngayTrinhNY', label: 'Ngày trình NY (VPUB)' },
      { key: 'ngayBatDauNY', label: 'Ngày bắt đầu NY' },
      { key: 'ngayKetThucNY', label: 'Ngày kết thúc NY', auto: 'niemYet' },
    ],
  },
  {
    title: 'Trình dự thảo cấp GCN',
    fields: [
      { key: 'hanTrinhDuThao', label: 'Hạn trình dự thảo', auto: 'duThao' },
      { key: 'ngayTrinhDuThao', label: 'Ngày trình dự thảo' },
    ],
  },
  {
    title: 'Thuế',
    fields: [
      { key: 'hanTrinhPCThue', label: 'Hạn trình PC thuế', auto: 'pcThue' },
      { key: 'ngayTrinhPCThue', label: 'Ngày trình PC thuế (VPUB)' },
      { key: 'ngayDiThue', label: 'Ngày đi thuế' },
    ],
  },
  {
    title: 'Cấp GCN',
    fields: [
      { key: 'ngayNhanKQNVTC', label: 'Nhận KQ đã thực hiện NVTC' },
      { key: 'hanTrinhGCN', label: 'Hạn trình GCN', auto: 'trinhGCN' },
      { key: 'ngayTrinhGCN', label: 'Ngày trình UB cấp GCN' },
      { key: 'soGCN', label: 'Số GCN', text: true },
    ],
  },
  {
    title: 'Hồ sơ rút / điều chỉnh',
    fields: [
      { key: 'ngayTrinhRut', label: 'Ngày trình UB' },
      { key: 'ngayVBRut', label: 'Ngày văn bản' },
    ],
  },
  {
    title: 'Trả tổ / giải trình',
    fields: [
      { key: 'ngayTraTo', label: 'Ngày trả tổ' },
      { key: 'hanTrinhLaiUB', label: 'Hạn trình lại UB' },
    ],
  },
];

export const GCN_STEP_DATE_KEYS = GCN_STEP_GROUPS.flatMap((group) => group.fields.filter((f) => !f.text).map((f) => f.key));

const cellClass =
  'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500';

/** Các bước quy trình GCN trong form hồ sơ: chọn tình trạng + ngày từng bước. */
export default function GcnStepsEditor({ form, onField, steps, quyTrinh }) {
  const isAuto = (field) => field.auto && quyTrinh?.[field.auto] !== null && quyTrinh?.[field.auto] !== undefined;

  return (
    <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-800">
          <ListChecks className="h-4 w-4" /> Quy trình GCN
        </span>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          Tình trạng
          <select
            value={form.buoc}
            onChange={(event) => onField('buoc', event.target.value)}
            className="rounded-md border border-emerald-300 bg-white px-2 py-1.5 text-xs font-semibold text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {Object.entries(steps ?? {}).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {GCN_STEP_GROUPS.map((group) => (
          <fieldset key={group.title} className="rounded-lg border border-slate-200 bg-white p-3">
            <legend className="px-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">{group.title}</legend>
            <div className="grid grid-cols-2 gap-2">
              {group.fields.map((field) => (
                <label key={field.key} className="block">
                  <span className="mb-0.5 block text-[11px] font-semibold text-slate-600">
                    {field.label}
                    {isAuto(field) && <span className="font-normal text-emerald-700"> · tự tính</span>}
                  </span>
                  <input
                    type={field.text ? 'text' : 'date'}
                    value={form[field.key]}
                    onChange={(event) => onField(field.key, event.target.value)}
                    placeholder={isAuto(field) ? 'Để trống = tự tính' : undefined}
                    title={isAuto(field) ? 'Để trống thì hệ thống tự tính khi lưu' : undefined}
                    className={cellClass}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <label className="block">
        <span className="mb-0.5 block text-[11px] font-semibold text-slate-600">Giải trình (khi bị trả)</span>
        <textarea rows={2} value={form.giaiTrinh} onChange={(event) => onField('giaiTrinh', event.target.value)} className={cellClass} />
      </label>
    </div>
  );
}
