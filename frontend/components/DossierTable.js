'use client';

import { useEffect, useMemo, useState } from 'react';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarPlus,
  CircleCheck,
  Clock,
  ExternalLink,
  FileDown,
  FolderSearch,
  LoaderCircle,
  KeyRound,
  Lock,
  MapPin,
  PenLine,
  Printer,
  ShieldOff,
  Sparkles,
  Trash2,
  UserCog,
} from 'lucide-react';
import { InlineDate, InlineSelect, InlineText } from '@/components/InlineFields';
import BulkActionBar from '@/components/BulkActionBar';
import {
  MUC_DO_UU_TIEN_LABELS,
  MUC_DO_UU_TIEN_RANK,
  MUC_DO_UU_TIEN_STYLES,
  TRANG_THAI_LABELS,
  TRANG_THAI_STYLES,
  dayUnit,
  deadlineSource,
  formatDate,
  getDeadlineStatus,
  getRecordId,
  openPrintForm,
  getSubmitStatus,
  getUserName,
  isFieldHidden,
  phanLoaiStyle,
  toDateInputValue,
} from '@/lib/dossier';

const columnHelper = createColumnHelper();

export const PAGE_SIZE_OPTIONS = [15, 30, 100];

// Màu dòng theo hạn xử lý; ô sticky cần nền đặc để không lộ chữ khi cuộn ngang.
const ROW_TONES = {
  overdue: { row: 'bg-rose-50/40 hover:bg-rose-50/80', sticky: 'bg-rose-50' },
  today: { row: 'bg-amber-50/60 hover:bg-amber-50', sticky: 'bg-amber-50' },
  upcoming: { row: 'bg-yellow-50/60 hover:bg-yellow-50', sticky: 'bg-yellow-50' },
  normal: { row: 'bg-white hover:bg-slate-50/90', sticky: 'bg-white group-hover:bg-slate-50' },
  done: { row: 'bg-white hover:bg-slate-50/90', sticky: 'bg-white group-hover:bg-slate-50' },
};

// Hai cột đầu chỉ dính từ md trở lên: màn hẹp mà dính thì chúng che gần hết bảng.
// Cột 1 rộng 150px để chứa số biên nhận dạng "H29.200-251231-14998".
const STICKY_1 = 'md:sticky md:left-0 w-[150px] min-w-[150px] max-w-[150px] border-r';
const STICKY_2 =
  'md:sticky md:left-[150px] min-w-[270px] max-w-[300px] border-r md:shadow-[4px_0_8px_-4px_rgba(15,23,42,0.12)]';

const toTime = (value) => (value ? new Date(value).getTime() : 0);

const pill = 'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px]';

function SubmitPill({ record }) {
  const { status, daysLeft } = getSubmitStatus(record);
  if (status === 'submitted') {
    return (
      <span className={`${pill} border border-emerald-200 bg-emerald-50 font-semibold text-emerald-700`}>
        <CircleCheck className="h-3 w-3" /> Đã trình LĐ
      </span>
    );
  }
  if (status === 'late') {
    return <span className={`${pill} border border-rose-300 bg-rose-100 font-bold text-rose-700`}>Trễ trình {-daysLeft} ngày!</span>;
  }
  if (status === 'today') {
    return <span className={`${pill} border border-amber-300 bg-amber-100 font-bold text-amber-800`}>Phải trình hôm nay</span>;
  }
  if (status === 'urgent') {
    return <span className={`${pill} border border-blue-200 bg-blue-100 font-semibold text-blue-800`}>Còn {daysLeft} ngày trình</span>;
  }
  return <span className={`${pill} bg-slate-100 font-medium text-slate-600`}>Còn {daysLeft ?? '?'} ngày</span>;
}

function DuePill({ record }) {
  const { status, daysLeft } = getDeadlineStatus(record);
  const round = `${pill} rounded-full`;
  if (status === 'done') {
    return (
      <span className="inline-flex flex-col items-start gap-0.5">
        <span className={`${round} bg-emerald-100 font-semibold text-emerald-800`}>
          ✓ Hoàn thành{record.ngayKetThuc ? ` ${formatDate(record.ngayKetThuc).slice(0, 5)}` : ''}
        </span>
        {record.treHanTheoSo === true && (
          <span className={`${pill} border border-orange-200 bg-orange-50 font-semibold text-orange-800`}>Trễ hạn (theo sổ)</span>
        )}
      </span>
    );
  }
  if (status === 'overdue') return <span className={`${round} bg-rose-600 font-bold text-white`}>🚨 Quá hạn {-daysLeft} ngày</span>;
  if (status === 'today') return <span className={`${round} bg-rose-500 font-bold text-white`}>🔥 Hết hạn hôm nay!</span>;
  if (status === 'upcoming') {
    return (
      <span className={`${round} border border-amber-400 bg-amber-100 font-bold text-amber-900`}>
        📅 Còn {daysLeft} ngày (Tuần tới)
      </span>
    );
  }
  return <span className={`${round} bg-slate-100 font-medium text-slate-600`}>Còn {daysLeft ?? '?'} ngày</span>;
}

function RestrictedMask({ note }) {
  return (
    <div className="inline-flex select-none flex-col items-center justify-center rounded-lg border border-slate-300 bg-slate-200/70 px-3 py-1.5 text-slate-500">
      <span className="flex items-center gap-1 text-xs font-semibold text-slate-600">
        <ShieldOff className="h-3.5 w-3.5 text-rose-500" /> Giới hạn quyền
      </span>
      <span className="text-[10px] text-slate-400">{note}</span>
    </div>
  );
}

function SortIcon({ direction }) {
  if (direction === 'asc') return <ArrowUp className="h-3.5 w-3.5 text-amber-400" aria-label="Tăng dần" />;
  if (direction === 'desc') return <ArrowDown className="h-3.5 w-3.5 text-amber-400" aria-label="Giảm dần" />;
  return <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" aria-hidden />;
}

/** Danh sách số trang rút gọn: 1 … 4 5 6 … 20 */
function buildPageList(current, total) {
  const pages = new Set([0, total - 1, current - 1, current, current + 1]);
  const sorted = [...pages].filter((page) => page >= 0 && page < total).sort((a, b) => a - b);
  return sorted.flatMap((page, index) => (index > 0 && page - sorted[index - 1] > 1 ? ['gap', page] : [page]));
}

export default function DossierTable({
  data,
  role,
  meta,
  canBoList,
  total,
  pagination,
  onPaginationChange,
  filterKey,
  loading,
  sorting,
  onSortingChange,
  density,
  showLockedAsMasked,
  onInlineUpdate,
  onOpenDetail,
  onExtend,
  onDelete,
  onResetFilters,
  onBulkUpdate,
  onBulkDelete,
  onExport,
  onExportFiltered,
  onSelectAllFiltered,
}) {
  // Lựa chọn lưu theo id nên giữ nguyên khi chuyển trang; đổi bộ lọc / tìm kiếm thì bỏ chọn.
  const [rowSelection, setRowSelection] = useState({});
  const [selectingAll, setSelectingAll] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const canEditIntake = role === 'ADMIN' || role === 'VAN_THU';
  const canDelete = role === 'ADMIN';

  const ruleByLoai = useMemo(
    () => Object.fromEntries((meta?.phanLoai ?? []).map((rule) => [rule.ma, rule])),
    [meta]
  );

  // Cột nhạy cảm bị khoá khi BE không trả key trong bất kỳ bản ghi nào.
  const lockedColumns = useMemo(() => {
    const fields = ['chiDaoLanhDao', 'mucDoUuTien'];
    if (data.length === 0) return new Set(role === 'CAN_BO' ? fields : []);
    return new Set(fields.filter((field) => data.every((record) => isFieldHidden(record, field))));
  }, [data, role]);

  useEffect(() => {
    setRowSelection({});
  }, [filterKey]);

  const columns = useMemo(
    () => [
      columnHelper.accessor('maHoSo', {
        // Ô chọn nằm chung cột Mã HS để không làm lệch 2 cột dính bên trái.
        header: ({ table: t }) => (
          <span className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={t.getIsAllPageRowsSelected()}
              ref={(el) => el && (el.indeterminate = t.getIsSomePageRowsSelected())}
              onChange={t.getToggleAllPageRowsSelectedHandler()}
              onClick={(event) => event.stopPropagation()}
              aria-label="Chọn tất cả hồ sơ trên trang"
              className="h-4 w-4 cursor-pointer accent-indigo-500"
            />
            Mã HS
          </span>
        ),
        meta: { th: `${STICKY_1} z-30 bg-slate-800 border-slate-700`, td: `${STICKY_1} z-20 border-slate-200`, sticky: true },
        cell: ({ row }) => (
          <div className="flex flex-col gap-1 font-mono text-xs font-bold text-indigo-700">
            <span className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={row.getIsSelected()}
                onChange={row.getToggleSelectedHandler()}
                aria-label={`Chọn hồ sơ ${row.original.maHoSo}`}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-indigo-600"
              />
              <span className="break-all">{row.original.maHoSo}</span>
            </span>
            <span className="font-sans text-[10px] font-normal text-slate-400">
              {row.original.soBienNhan && row.original.soBienNhan.toUpperCase() !== row.original.maHoSo
                ? `BN: ${row.original.soBienNhan}`
                : row.original.canBoThuLy
                  ? 'Đã phân công'
                  : 'Chưa giao'}
            </span>
          </div>
        ),
      }),
      columnHelper.accessor('tenHoSo', {
        header: 'Tên / Trích yếu Hồ sơ',
        meta: { th: `${STICKY_2} z-30 bg-slate-800 border-slate-700`, td: `${STICKY_2} z-20 border-slate-200`, sticky: true },
        cell: ({ row }) => (
          <div>
            <div className="line-clamp-2 text-xs font-semibold leading-snug text-slate-900 sm:text-sm" title={row.original.tenHoSo}>
              {row.original.tenHoSo}
            </div>
            {(row.original.diaChi || row.original.donViGui) && (
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
                <span className="truncate" title={row.original.diaChi || row.original.donViGui}>
                  {row.original.diaChi || row.original.donViGui}
                </span>
              </div>
            )}
          </div>
        ),
      }),
      columnHelper.accessor('phanLoai', {
        header: 'Phân loại HS',
        enableSorting: false,
        meta: { th: 'min-w-[190px]' },
        cell: ({ row }) => {
          const { phanLoai, loaiHoSoGoc } = row.original;
          const style = phanLoaiStyle(phanLoai);
          const label = ruleByLoai[phanLoai]?.moTa ?? phanLoai;
          // Tên thủ tục gốc trong sổ, chỉ hiện khi khác tên loại chuẩn.
          const original =
            loaiHoSoGoc && loaiHoSoGoc.toLowerCase() !== label.toLowerCase() ? (
              <div className="mt-1 line-clamp-2 text-[10px] text-slate-400" title={loaiHoSoGoc}>
                {loaiHoSoGoc}
              </div>
            ) : null;
          if (!canEditIntake) {
            return (
              <>
                <span className={`inline-block rounded-lg border px-2.5 py-1 text-xs font-semibold ${style}`}>{label}</span>
                {original}
              </>
            );
          }
          return (
            <>
              <InlineSelect
                value={phanLoai}
                onCommit={(value) => onInlineUpdate(row.original, { phanLoai: value })}
                aria-label={`Phân loại hồ sơ ${row.original.maHoSo}`}
                className={`max-w-[200px] rounded-lg border px-2 py-1 text-xs font-semibold ${style}`}
              >
                {(meta?.phanLoai ?? []).map((rule) => (
                  <option key={rule.ma} value={rule.ma}>
                    {rule.moTa} (hạn {rule.hetHan} {dayUnit(meta?.calendar)})
                  </option>
                ))}
              </InlineSelect>
              {original}
            </>
          );
        },
      }),
      columnHelper.accessor((row) => toTime(row.ngayVao), {
        id: 'ngayVao',
        header: 'Ngày vào HS',
        meta: { th: 'min-w-[145px]' },
        cell: ({ row }) =>
          canEditIntake ? (
            <div className="flex flex-col">
              <InlineDate
                value={toDateInputValue(row.original.ngayVao)}
                onCommit={(value) => onInlineUpdate(row.original, { ngayVao: value })}
                aria-label={`Ngày vào hồ sơ ${row.original.maHoSo}`}
                className="rounded border border-indigo-200 bg-indigo-50/50 px-2 py-1 text-xs font-semibold text-indigo-700"
              />
              <span className="mt-0.5 text-[10px] text-slate-400">Đổi ngày → Tự nhảy hạn</span>
            </div>
          ) : (
            <div>
              <div className="font-medium text-slate-800">{formatDate(row.original.ngayVao)}</div>
              <span className="text-[10px] text-slate-400">Chỉ Văn thư/LĐ sửa</span>
            </div>
          ),
      }),
      columnHelper.accessor((row) => toTime(row.ngayTrinhLanhDao), {
        id: 'ngayTrinhLanhDao',
        header: () => (
          <span className="flex items-center gap-1 text-sky-300">
            <Sparkles className="h-3.5 w-3.5" /> Ngày trình LĐ
          </span>
        ),
        meta: { th: 'min-w-[165px]', td: 'bg-sky-50/20' },
        cell: ({ row }) => (
          <>
            <div className="text-xs font-bold text-slate-900 sm:text-sm">{formatDate(row.original.ngayTrinhLanhDao)}</div>
            <div className="mt-1">
              <SubmitPill record={row.original} />
            </div>
            {ruleByLoai[row.original.phanLoai] && (
              <div className="mt-0.5 text-[10px] text-slate-400">(= Ngày vào + {ruleByLoai[row.original.phanLoai].trinh} {dayUnit(meta?.calendar)})</div>
            )}
          </>
        ),
      }),
      columnHelper.accessor((row) => toTime(row.ngayHetHan), {
        id: 'ngayHetHan',
        header: () => (
          <span className="flex items-center gap-1 text-amber-300">
            <Clock className="h-3.5 w-3.5" /> Ngày hết hạn
          </span>
        ),
        meta: { th: 'min-w-[185px] bg-slate-900', td: 'bg-amber-50/20' },
        cell: ({ row }) => (
          <>
            <div className="text-xs font-extrabold text-slate-900 sm:text-sm">{formatDate(row.original.ngayHetHan)}</div>
            <div className="mt-1">
              <DuePill record={row.original} />
            </div>
            {deadlineSource(row.original) ? (
              <div className="mt-0.5 text-[10px] text-slate-400">({deadlineSource(row.original)})</div>
            ) : (
              ruleByLoai[row.original.phanLoai] && (
                <div className="mt-0.5 text-[10px] text-slate-400">(= Ngày vào + {ruleByLoai[row.original.phanLoai].hetHan} {dayUnit(meta?.calendar)})</div>
              )
            )}
          </>
        ),
      }),
      columnHelper.accessor((row) => getUserName(row.canBoThuLy), {
        id: 'canBoThuLy',
        enableSorting: false,
        header: () => (
          <span className="flex items-center gap-1.5">
            <UserCog className="h-3.5 w-3.5 text-emerald-400" /> Cán bộ thụ lý
          </span>
        ),
        meta: { th: 'min-w-[175px]' },
        cell: ({ row }) =>
          canEditIntake ? (
            <InlineSelect
              value={row.original.canBoThuLy?._id ?? ''}
              onCommit={(value) => onInlineUpdate(row.original, { canBoThuLy: value })}
              aria-label={`Cán bộ thụ lý hồ sơ ${row.original.maHoSo}`}
              className={`w-full rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                row.original.canBoThuLy
                  ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
                  : 'border-amber-300 bg-amber-50 text-amber-800'
              }`}
            >
              <option value="">⚠️ Chưa phân công</option>
              {canBoList.map((user) => (
                <option key={user._id} value={user._id}>
                  👤 {getUserName(user)}
                </option>
              ))}
            </InlineSelect>
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
              <Lock className="h-3 w-3 text-slate-400" />
              <span>{getUserName(row.original.canBoThuLy) || 'Chưa phân công'}</span>
            </div>
          ),
      }),
      columnHelper.accessor('trangThai', {
        enableSorting: false,
        header: () => (
          <span className="flex items-center gap-1.5">
            <PenLine className="h-3.5 w-3.5 text-indigo-300" /> Trạng thái &amp; Ghi chú Cán bộ
          </span>
        ),
        meta: { th: 'min-w-[250px]' },
        cell: ({ row }) => {
          const { trangThai, ghiChuCanBo } = row.original;
          return (
            <div className="space-y-1.5">
              <InlineSelect
                value={trangThai}
                onCommit={(value) => onInlineUpdate(row.original, { trangThai: value })}
                aria-label={`Trạng thái hồ sơ ${row.original.maHoSo}`}
                className={`rounded border px-2 py-1 text-xs font-semibold ${TRANG_THAI_STYLES[trangThai] || TRANG_THAI_STYLES.MOI_TIEP_NHAN}`}
              >
                {Object.entries(TRANG_THAI_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </InlineSelect>
              <InlineText
                value={ghiChuCanBo}
                onCommit={(value) => onInlineUpdate(row.original, { ghiChuCanBo: value })}
                placeholder="Nhập báo cáo tiến độ…"
                aria-label={`Ghi chú tiến độ hồ sơ ${row.original.maHoSo}`}
                className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs hover:bg-white focus:bg-white focus:ring-indigo-500"
              />
            </div>
          );
        },
      }),
      columnHelper.accessor((row) => (isFieldHidden(row, 'chiDaoLanhDao') ? '' : row.chiDaoLanhDao || ''), {
        id: 'chiDaoLanhDao',
        enableSorting: false,
        header: () => (
          <span className="flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 shrink-0 text-amber-400" /> Chỉ đạo của Lãnh đạo
          </span>
        ),
        meta: { th: 'min-w-[230px] bg-indigo-950/80 text-indigo-200', td: 'bg-indigo-50/15', restricted: true },
        cell: ({ row }) =>
          isFieldHidden(row.original, 'chiDaoLanhDao') ? (
            <RestrictedMask note="Chỉ Lãnh đạo / Văn thư được xem" />
          ) : (
            <InlineText
              multiline
              value={row.original.chiDaoLanhDao ?? ''}
              onCommit={(value) => onInlineUpdate(row.original, { chiDaoLanhDao: value || null })}
              placeholder="Nhập chỉ đạo của Lãnh đạo…"
              aria-label={`Chỉ đạo lãnh đạo hồ sơ ${row.original.maHoSo}`}
              className="w-full resize-none rounded border border-indigo-200 bg-indigo-50/40 p-1.5 text-xs font-medium text-indigo-950 hover:bg-white focus:bg-white focus:ring-indigo-500"
            />
          ),
      }),
      columnHelper.accessor(
        (row) => (isFieldHidden(row, 'mucDoUuTien') ? 0 : MUC_DO_UU_TIEN_RANK[row.mucDoUuTien] ?? 0),
        {
          id: 'mucDoUuTien',
          enableSorting: !lockedColumns.has('mucDoUuTien'),
          header: () => (
            <span className="flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5 shrink-0 text-rose-400" /> Ưu tiên nội bộ (Mật)
            </span>
          ),
          meta: { th: 'min-w-[190px] bg-rose-950/80 text-rose-200', td: 'bg-rose-50/20', restricted: true },
          cell: ({ row }) =>
            isFieldHidden(row.original, 'mucDoUuTien') ? (
              <RestrictedMask note="Chỉ Lãnh đạo / Văn thư được xem" />
            ) : (
              <InlineSelect
                value={row.original.mucDoUuTien}
                onCommit={(value) => onInlineUpdate(row.original, { mucDoUuTien: value })}
                aria-label={`Mức độ ưu tiên hồ sơ ${row.original.maHoSo}`}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  MUC_DO_UU_TIEN_STYLES[row.original.mucDoUuTien] || MUC_DO_UU_TIEN_STYLES.TRUNG_BINH
                }`}
              >
                {Object.entries(MUC_DO_UU_TIEN_LABELS).map(([value, label]) => (
                  <option key={value} value={value} className="bg-white text-slate-800">
                    {label}
                  </option>
                ))}
              </InlineSelect>
            ),
        }
      ),
      columnHelper.display({
        id: 'actions',
        header: 'Thao tác',
        meta: { th: 'min-w-[180px] text-center', td: 'text-center align-middle' },
        cell: ({ row }) => (
          <div className="flex items-center justify-center gap-1.5">
            {row.original.trangThai !== 'HOAN_THANH' && (
              <button
                type="button"
                onClick={() => onInlineUpdate(row.original, { trangThai: 'HOAN_THANH' })}
                title="Đánh dấu hoàn thành (ghi Ngày kết thúc hôm nay)"
                aria-label={`Đánh dấu hoàn thành hồ sơ ${row.original.maHoSo}`}
                className="rounded-lg bg-emerald-50 p-1.5 text-emerald-700 transition hover:bg-emerald-600 hover:text-white"
              >
                <CircleCheck className="h-4 w-4" />
              </button>
            )}
            {canEditIntake && row.original.trangThai !== 'HOAN_THANH' && (
              <button
                type="button"
                onClick={() => onExtend(row.original)}
                title="Gia hạn xử lý (kèm lý do)"
                aria-label={`Gia hạn hồ sơ ${row.original.maHoSo}`}
                className="rounded-lg bg-amber-50 p-1.5 text-amber-700 transition hover:bg-amber-500 hover:text-white"
              >
                <CalendarPlus className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenDetail(row.original)}
              title="Mở chi tiết / Chỉnh sửa"
              aria-label={`Mở chi tiết hồ sơ ${row.original.maHoSo}`}
              className="rounded-lg bg-slate-100 p-1.5 text-slate-600 transition hover:bg-indigo-100 hover:text-indigo-700"
            >
              <ExternalLink className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => openPrintForm(row.original)}
              title="In phiếu theo dõi"
              aria-label={`In phiếu theo dõi hồ sơ ${row.original.maHoSo}`}
              className="rounded-lg bg-slate-100 p-1.5 text-slate-600 transition hover:bg-slate-200 hover:text-slate-900"
            >
              <Printer className="h-4 w-4" />
            </button>
            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(row.original)}
                title="Xoá hồ sơ"
                aria-label={`Xoá hồ sơ ${row.original.maHoSo}`}
                className="rounded-lg bg-slate-100 p-1.5 text-slate-600 transition hover:bg-rose-100 hover:text-rose-700"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ),
      }),
    ],
    [canEditIntake, canDelete, canBoList, meta, ruleByLoai, lockedColumns, onInlineUpdate, onOpenDetail, onExtend, onDelete]
  );

  const columnVisibility = useMemo(
    () => ({
      chiDaoLanhDao: showLockedAsMasked || !lockedColumns.has('chiDaoLanhDao'),
      mucDoUuTien: showLockedAsMasked || !lockedColumns.has('mucDoUuTien'),
    }),
    [showLockedAsMasked, lockedColumns]
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, pagination, columnVisibility, rowSelection },
    getRowId: getRecordId, // MongoDB _id làm khoá dòng
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange,
    onPaginationChange,
    // Lọc, sắp xếp, phân trang đều do server làm (GET /api/dossiers?page=…); bảng chỉ hiển thị một trang.
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    rowCount: total,
    getCoreRowModel: getCoreRowModel(),
  });

  const rows = table.getRowModel().rows;
  const filteredCount = total;
  const { pageIndex, pageSize } = pagination;
  const pageCount = Math.max(table.getPageCount(), 1);
  const firstItem = filteredCount === 0 ? 0 : pageIndex * pageSize + 1;
  const lastItem = Math.min(pageIndex * pageSize + rows.length, filteredCount);

  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);

  const selectAllFiltered = async () => {
    setSelectingAll(true);
    try {
      const ids = await onSelectAllFiltered();
      if (ids) setRowSelection(Object.fromEntries(ids.map((id) => [id, true])));
    } finally {
      setSelectingAll(false);
    }
  };

  const runExportFiltered = async () => {
    setExporting(true);
    try {
      await onExportFiltered();
    } finally {
      setExporting(false);
    }
  };

  const runExport = async (ids) => {
    setExporting(true);
    try {
      await onExport(ids);
    } finally {
      setExporting(false);
    }
  };

  const runBulk = async (action) => {
    setBulkBusy(true);
    try {
      if (await action(selectedIds)) setRowSelection({});
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {selectedIds.length > 0 && (
        <BulkActionBar
          count={selectedIds.length}
          filteredCount={filteredCount}
          onSelectAllFiltered={selectAllFiltered}
          selectingAll={selectingAll}
          onClear={() => setRowSelection({})}
          onUpdate={(changes, label) => runBulk((ids) => onBulkUpdate(ids, changes, label))}
          onDelete={() => runBulk((ids) => onBulkDelete(ids))}
          onExport={() => runExport(selectedIds)}
          exporting={exporting}
          canAssign={canEditIntake}
          canDelete={canDelete}
          canBoList={canBoList}
          busy={bulkBusy}
        />
      )}
      {/* scroll-padding: ô được focus không bị trượt vào dưới 2 cột dính / header dính */}
      <div className="table-scroll-container relative max-h-[600px] scroll-pt-14 overflow-auto md:scroll-pl-[450px]">
        <table className={`w-full border-collapse text-left ${density === 'compact' ? 'density-compact' : ''}`}>
          <thead className="sticky top-0 z-30 select-none bg-slate-800 text-xs uppercase tracking-wider text-slate-100">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sortable = header.column.getCanSort();
                  const metaClass = header.column.columnDef.meta?.th ?? '';
                  const content = flexRender(header.column.columnDef.header, header.getContext());
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={
                        header.column.getIsSorted() === 'asc'
                          ? 'ascending'
                          : header.column.getIsSorted() === 'desc'
                            ? 'descending'
                            : undefined
                      }
                      className={`border-b border-slate-700 px-3 py-3.5 font-semibold ${sortable ? 'cursor-pointer hover:bg-slate-700' : ''} ${metaClass}`}
                      onClick={sortable ? header.column.getToggleSortingHandler() : undefined}
                    >
                      {sortable ? (
                        <div className="flex items-center justify-between gap-1">
                          {content}
                          <SortIcon direction={header.column.getIsSorted()} />
                        </div>
                      ) : (
                        content
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-200 text-sm">
            {rows.map((row) => {
              const tone = ROW_TONES[getDeadlineStatus(row.original).status];
              return (
                <tr key={row.id} data-deadline={getDeadlineStatus(row.original).status} className={`group transition ${tone.row}`}>
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta ?? {};
                    return (
                      <td
                        key={cell.id}
                        className={`border-b border-slate-200 px-3 py-3 align-top ${meta.sticky ? tone.sticky : ''} ${meta.td ?? ''}`}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>

        {rows.length === 0 && !loading && (
          <div className="px-4 py-14 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <FolderSearch className="h-7 w-7" />
            </div>
            <h3 className="text-base font-bold text-slate-800">Không tìm thấy hồ sơ phù hợp</h3>
            <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
              Không có hồ sơ nào khớp với điều kiện lọc hoặc quyền truy cập hiện tại. Hãy thử xóa bộ lọc hoặc chuyển sang tài
              khoản <strong>Lãnh đạo / Admin</strong>.
            </p>
            <button
              type="button"
              onClick={onResetFilters}
              className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700"
            >
              Khôi phục toàn bộ danh sách
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        <span>
          Hiển thị{' '}
          <strong>
            {firstItem} - {lastItem}
          </strong>{' '}
          trên <strong>{filteredCount}</strong> hồ sơ
          {loading && <LoaderCircle className="ml-1.5 inline h-3.5 w-3.5 animate-spin text-slate-400" aria-label="Đang tải" />}
          {filteredCount > 0 && (
            <button
              type="button"
              onClick={runExportFiltered}
              disabled={exporting}
              className="ml-3 inline-flex items-center gap-1 rounded border border-emerald-300 bg-white px-2 py-1 font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            >
              {exporting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
              Xuất Excel {filteredCount} hồ sơ
            </button>
          )}
        </span>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5">
            <span>Số dòng/trang:</span>
            <select
              value={pageSize}
              onChange={(event) => table.setPageSize(Number(event.target.value))}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size} dòng
                </option>
              ))}
            </select>
          </label>

          <nav className="flex items-center gap-1" aria-label="Phân trang">
            <button
              type="button"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="rounded border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ‹ Trước
            </button>
            {buildPageList(pageIndex, pageCount).map((page, index) =>
              page === 'gap' ? (
                <span key={`gap-${index}`} className="px-1 text-slate-400">
                  …
                </span>
              ) : (
                <button
                  key={page}
                  type="button"
                  onClick={() => table.setPageIndex(page)}
                  aria-current={page === pageIndex ? 'page' : undefined}
                  className={`min-w-[28px] rounded border px-2 py-1 font-semibold ${
                    page === pageIndex
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {page + 1}
                </button>
              )
            )}
            <button
              type="button"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="rounded border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Sau ›
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
}
