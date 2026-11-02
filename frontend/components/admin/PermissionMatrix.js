'use client';

import { Check, Info, Lock, Minus } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/dossier';

const ROLE_ORDER = ['ADMIN', 'VAN_THU', 'CAN_BO'];

const FIELD_LABELS = {
  maHoSo: 'Mã hồ sơ',
  soBienNhan: 'Số biên nhận',
  tenHoSo: 'Tên hồ sơ',
  diaChi: 'Địa chỉ',
  donViGui: 'Đơn vị gửi',
  phanLoai: 'Loại thủ tục (tự tính lại hạn)',
  ngayVao: 'Ngày vào (tự tính lại hạn)',
  ngayHenTra: 'Ngày hẹn trả (tự tính lại hạn)',
  ngayGiaHan: 'Gia hạn (tự tính lại hạn)',
  ngayTrinhThucTe: 'Ngày trình thực tế',
  lanTrinh: 'Các lần trình LĐ',
  ngayKetThuc: 'Ngày kết thúc',
  canBoThuLy: 'Cán bộ thụ lý',
  ghiChuCanBo: 'Diễn giải / tiến độ',
  ghiChu: 'Ghi chú',
  chiDaoLanhDao: 'Chỉ đạo của Lãnh đạo',
  mucDoUuTien: 'Mức độ ưu tiên nội bộ',
  trangThai: 'Trạng thái xử lý',
};

const ACTION_ROWS = [
  { key: 'DOSSIER_CREATE', label: 'Tiếp nhận / tạo hồ sơ mới' },
  { key: 'DOSSIER_ASSIGN', label: 'Phân công cán bộ thụ lý' },
  { key: 'DOSSIER_IMPORT', label: 'Nhập hồ sơ từ Excel (và hoàn tác)' },
  { key: 'DOSSIER_DELETE', label: 'Xoá hồ sơ' },
  { key: 'SYSTEM_ADMIN', label: 'Quản trị tài khoản & phân quyền' },
];

function Allowed({ value, note }) {
  if (value) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
        <Check className="h-3.5 w-3.5" /> {note ?? 'Có'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-400">
      <Minus className="h-3.5 w-3.5" /> {note ?? 'Không'}
    </span>
  );
}

function MatrixTable({ caption, roles, rows }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-600">
        {caption}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-800 text-xs uppercase tracking-wider text-slate-100">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Quyền</th>
              {roles.map((item) => (
                <th key={item.role} scope="col" className="min-w-[150px] px-4 py-3 font-semibold">
                  {ROLE_LABELS[item.role]} <span className="font-normal normal-case text-slate-400">({item.role})</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.key} className="hover:bg-slate-50">
                <th scope="row" className="px-4 py-2.5 font-medium text-slate-700">
                  <span className="flex items-center gap-1.5">
                    {row.sensitive && <Lock className="h-3.5 w-3.5 text-amber-500" aria-label="Cột nhạy cảm" />}
                    {row.label}
                  </span>
                </th>
                {roles.map((item) => (
                  <td key={item.role} className="px-4 py-2.5">
                    {row.render(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Ma trận phân quyền chỉ đọc, dữ liệu lấy từ GET /api/admin/permissions. */
export default function PermissionMatrix({ data }) {
  if (!data) return <p className="text-sm text-slate-500">Đang tải ma trận phân quyền…</p>;

  const roles = [...data.roles].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
  const sensitive = new Set(data.sensitiveFields);

  const accessRows = [
    {
      key: 'scope',
      label: 'Phạm vi xem hồ sơ (phân quyền dòng)',
      render: (item) => <Allowed value={!item.rowScoped} note={item.rowScoped ? 'Chỉ hồ sơ được giao' : 'Toàn bộ'} />,
    },
    {
      key: 'sensitive',
      label: 'Xem cột nhạy cảm (phân quyền cột)',
      sensitive: true,
      render: (item) => <Allowed value={item.canViewSensitive} note={item.canViewSensitive ? 'Xem & sửa' : 'Bị ẩn khỏi API'} />,
    },
    ...ACTION_ROWS.map((action) => ({
      key: action.key,
      label: action.label,
      render: (item) => <Allowed value={item.actions[action.key]} />,
    })),
  ];

  const fieldRows = data.fields.map((field) => ({
    key: field,
    label: FIELD_LABELS[field] ?? field,
    sensitive: sensitive.has(field),
    render: (item) => {
      if (sensitive.has(field) && !item.canViewSensitive) return <Allowed value={false} note="Bị ẩn" />;
      const writable = item.writableFields.includes(field);
      return <Allowed value={writable} note={writable ? 'Sửa được' : 'Chỉ xem'} />;
    },
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2.5 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-xs text-indigo-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
        <p>
          Ma trận này được sinh trực tiếp từ cấu hình phân quyền mà backend đang áp dụng (<code>PERMISSIONS</code>,{' '}
          <code>WRITABLE_FIELDS</code>, <code>ROW_SCOPED_ROLES</code> trong <code>backend/server.js</code>), nên luôn khớp
          với thực tế. Để cấp quyền cho một người, hãy đổi <strong>vai trò</strong> của họ ở tab Tài khoản.
        </p>
      </div>
      <MatrixTable caption="Quyền truy cập & thao tác" roles={roles} rows={accessRows} />
      <MatrixTable caption="Quyền sửa từng trường hồ sơ" roles={roles} rows={fieldRows} />
    </div>
  );
}
