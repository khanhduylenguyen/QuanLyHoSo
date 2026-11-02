'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import UserBar from '@/components/UserBar';
import PageHeader from '@/components/PageHeader';
import KpiCards, { QUICK_FILTERS } from '@/components/KpiCards';
import Toolbar from '@/components/Toolbar';
import DossierTable, { PAGE_SIZE_OPTIONS } from '@/components/DossierTable';
import DossierFormModal from '@/components/DossierFormModal';
import ImportExcelModal from '@/components/ImportExcelModal';
import Toasts from '@/components/Toasts';
import QuickLookup from '@/components/QuickLookup';
import { useReasonDialog } from '@/components/ReasonDialog';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { saveBlob, todayStamp } from '@/lib/download';
import { formatDate, getUserName, toDateInputValue } from '@/lib/dossier';

const DEFAULT_SORTING = [{ id: 'ngayHetHan', desc: false }];
const DEFAULT_FILTERS = { phanLoai: 'ALL', canBo: 'ALL', trangThai: 'ALL' };
const TOAST_DURATION_MS = 3200;
const SEARCH_DEBOUNCE_MS = 350;
const EMPTY_STATS = { total: 0, urgentSubmit: 0, dueNextWeek: 0, overdue: 0 };

const SORT_LABELS = {
  maHoSo: 'Mã Hồ sơ',
  tenHoSo: 'Tên Hồ sơ',
  ngayVao: 'Ngày vào HS',
  ngayTrinhLanhDao: 'Ngày trình Lãnh đạo',
  ngayHetHan: 'Ngày hết hạn',
  mucDoUuTien: 'Ưu tiên nội bộ',
};

// Bộ lọc nhanh nào thì ép sort theo cột đó tăng dần (gần nhất lên đầu).
const QUICK_FILTER_SORTING = {
  [QUICK_FILTERS.ALL]: DEFAULT_SORTING,
  [QUICK_FILTERS.NEXT_WEEK]: [{ id: 'ngayHetHan', desc: false }],
  [QUICK_FILTERS.OVERDUE]: [{ id: 'ngayHetHan', desc: false }],
  [QUICK_FILTERS.URGENT_SUBMIT]: [{ id: 'ngayTrinhLanhDao', desc: false }],
};

const replaceById = (list, record) => list.map((item) => (item._id === record._id ? record : item));

export default function DossierManagementPage() {
  const { user: currentUser, error: authError, logout: handleLogout } = useAuth();
  // Một trang hồ sơ (server đã lọc / sắp xếp / phân trang) + tổng số khớp bộ lọc.
  const [dossiers, setDossiers] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: PAGE_SIZE_OPTIONS[0] });
  const [meta, setMeta] = useState(null);
  const [canBoList, setCanBoList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const [quickFilter, setQuickFilter] = useState(QUICK_FILTERS.ALL);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sorting, setSorting] = useState(DEFAULT_SORTING);
  const [density, setDensity] = useState('standard');
  const [showLockedAsMasked, setShowLockedAsMasked] = useState(true);

  const [modal, setModal] = useState({ open: false, dossier: null });
  const [importOpen, setImportOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [reasonDialog, askReason] = useReasonDialog();
  const latestRequest = useRef(0);
  const toastId = useRef(0);

  const role = currentUser?.role;
  const canCreate = role === 'ADMIN' || role === 'VAN_THU';
  const nextWeekActive = quickFilter === QUICK_FILTERS.NEXT_WEEK;

  const pushToast = useCallback((message, type = 'info') => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), TOAST_DURATION_MS);
  }, []);

  // 1. Metadata + danh sách cán bộ (cho form và cột phân công).
  useEffect(() => {
    if (!role) return;
    api.getMeta().then(({ data }) => setMeta(data)).catch(() => setMeta(null));
    if (role === 'CAN_BO') {
      setCanBoList([]);
    } else {
      api.getCanBo().then(({ data }) => setCanBoList(data)).catch(() => setCanBoList([]));
    }
  }, [role]);

  // Gõ tìm kiếm: chờ người dùng ngừng gõ rồi mới gọi API.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // Tham số lọc / sắp xếp gửi lên server (cùng tham số cho danh sách, "chọn tất cả" và xuất Excel).
  const listQuery = useMemo(() => {
    const [sort] = sorting;
    return {
      q: debouncedSearch,
      quick: quickFilter,
      phanLoai: filters.phanLoai,
      trangThai: filters.trangThai,
      canBo: role === 'CAN_BO' ? 'ALL' : filters.canBo,
      ...(sort && { sort: sort.id, dir: sort.desc ? 'desc' : 'asc' }),
    };
  }, [debouncedSearch, quickFilter, filters, sorting, role]);
  // Đổi bộ lọc / tìm kiếm / sắp xếp → về trang 1.
  const filterKey = JSON.stringify(listQuery);
  useEffect(() => {
    setPagination((prev) => (prev.pageIndex === 0 ? prev : { ...prev, pageIndex: 0 }));
  }, [filterKey]);

  // 2. Một trang hồ sơ (đã lọc dòng theo quyền ở BE) + số liệu thẻ KPI.
  const loadData = useCallback(async () => {
    if (!role) return;
    const requestId = ++latestRequest.current;
    setLoading(true);
    setLoadError(null);
    try {
      const [list, kpi] = await Promise.all([
        api.listDossiers({ ...listQuery, page: pagination.pageIndex + 1, pageSize: pagination.pageSize }),
        api.getDossierStats(),
      ]);
      if (requestId !== latestRequest.current) return;
      setDossiers(list.data);
      setTotal(list.meta.total);
      setStats(kpi.data);
      // Trang hiện tại trống sau khi xoá / lọc (vd. đang ở trang cuối) → lùi về trang cuối còn dữ liệu.
      const lastPage = Math.max(Math.ceil(list.meta.total / pagination.pageSize) - 1, 0);
      if (pagination.pageIndex > lastPage) setPagination((prev) => ({ ...prev, pageIndex: lastPage }));
    } catch (error) {
      if (requestId !== latestRequest.current) return;
      setDossiers([]);
      setTotal(0);
      setLoadError(error.message);
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [role, listQuery, pagination]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /** "Chọn tất cả hồ sơ đang lọc": lấy id từ server (tối đa 3.000). */
  const handleSelectAllFiltered = useCallback(async () => {
    try {
      const { data, meta: info } = await api.getDossierIds(listQuery);
      if (info.truncated) pushToast(`Chỉ chọn được tối đa ${info.max} hồ sơ mỗi lần`, 'amber');
      return data;
    } catch (error) {
      pushToast(`Không chọn được: ${error.message}`, 'error');
      return null;
    }
  }, [listQuery, pushToast]);

  const anyFilterActive =
    quickFilter !== QUICK_FILTERS.ALL ||
    search.trim() !== '' ||
    filters.phanLoai !== 'ALL' ||
    filters.trangThai !== 'ALL' ||
    (role !== 'CAN_BO' && filters.canBo !== 'ALL');

  const sortText = useMemo(() => {
    const [first] = sorting;
    if (!first) return 'Mặc định';
    const direction = first.desc ? 'Giảm dần / Xa nhất trước ↓' : 'Tăng dần / Gần nhất trước ↑';
    return `${SORT_LABELS[first.id] || first.id} (${direction})`;
  }, [sorting]);

  const selectQuickFilter = useCallback(
    (mode) => {
      setQuickFilter(mode);
      setSorting(QUICK_FILTER_SORTING[mode]);
      if (mode === QUICK_FILTERS.NEXT_WEEK) {
        pushToast('📅 Đã lọc hồ sơ đến hạn tuần tới & sắp xếp hạn gần nhất lên đầu', 'amber');
      }
    },
    [pushToast]
  );

  const resetAllFilters = useCallback(() => {
    setQuickFilter(QUICK_FILTERS.ALL);
    setSearch('');
    setFilters(DEFAULT_FILTERS);
    setSorting(DEFAULT_SORTING);
  }, []);

  /** Sửa trực tiếp trên bảng: cập nhật lạc quan, rollback nếu API lỗi. */
  const handleInlineUpdate = useCallback(
    async (record, inputPatch) => {
      let patch = inputPatch;
      // Chuyển hồ sơ đang có người thụ lý sang cán bộ khác: bắt buộc lý do (ghi vào lịch sử).
      if ('canBoThuLy' in patch && record.canBoThuLy && (patch.canBoThuLy || null) !== record.canBoThuLy._id && !patch.lyDo) {
        const target = canBoList.find((user) => user._id === patch.canBoThuLy);
        const answer = await askReason({
          title: 'Chuyển cán bộ thụ lý',
          subtitle: `${record.maHoSo}: ${getUserName(record.canBoThuLy)} → ${target ? getUserName(target) : 'Chưa phân công'}`,
          label: 'Lý do chuyển',
          confirmLabel: 'Chuyển hồ sơ',
        });
        if (!answer) return;
        patch = { ...patch, lyDo: answer.lyDo };
      }
      const { lyDo, ...optimisticPatch } = patch;
      if ('canBoThuLy' in patch) {
        optimisticPatch.canBoThuLy = patch.canBoThuLy
          ? canBoList.find((user) => user._id === patch.canBoThuLy) ?? record.canBoThuLy
          : null;
      }
      const optimistic = { ...record, ...optimisticPatch };
      setDossiers((prev) => replaceById(prev, optimistic));

      try {
        const { data } = await api.updateDossier(record._id, patch);
        setDossiers((prev) => replaceById(prev, data));
        api.getDossierStats().then(({ data: kpi }) => setStats(kpi)).catch(() => {});
        if ('ngayVao' in patch || 'phanLoai' in patch) {
          pushToast(
            `⚡ ${data.maHoSo}: tự động tính lại Ngày trình LĐ (${formatDate(data.ngayTrinhLanhDao)}) & Ngày hết hạn (${formatDate(data.ngayHetHan)})`,
            'success'
          );
        } else if ('ngayGiaHan' in patch) {
          pushToast(`📅 Đã gia hạn ${data.maHoSo} đến ${formatDate(data.ngayHetHan)}`, 'success');
        } else if ('canBoThuLy' in patch) {
          pushToast(
            data.canBoThuLy
              ? `👤 Đã phân công hồ sơ ${data.maHoSo} cho: ${getUserName(data.canBoThuLy)}`
              : `Hồ sơ ${data.maHoSo} chuyển về Chưa phân công`,
            'info'
          );
        } else if (patch.trangThai === 'HOAN_THANH') {
          pushToast(`✓ Hồ sơ ${data.maHoSo} đã hoàn thành ngày ${formatDate(data.ngayKetThuc)}`, 'success');
        } else {
          pushToast(`Đã lưu cập nhật trên hồ sơ ${data.maHoSo}`, 'success');
        }
      } catch (error) {
        setDossiers((prev) => replaceById(prev, record));
        pushToast(`Không lưu được: ${error.message}`, 'error');
      }
    },
    [askReason, canBoList, pushToast]
  );

  /** Gia hạn xử lý: chọn ngày mới + lý do. */
  const handleExtend = useCallback(
    async (record) => {
      const answer = await askReason({
        title: 'Gia hạn xử lý',
        subtitle: `${record.maHoSo} · hạn hiện tại ${formatDate(record.ngayHetHan)}`,
        withDate: true,
        dateLabel: 'Gia hạn đến ngày',
        initialDate: toDateInputValue(record.ngayGiaHan),
        minDate: toDateInputValue(record.ngayVao),
        label: 'Lý do gia hạn',
        confirmLabel: 'Gia hạn',
      });
      if (answer) await handleInlineUpdate(record, { ngayGiaHan: answer.date, lyDo: answer.lyDo });
    },
    [askReason, handleInlineUpdate]
  );

  const openCreate = useCallback(() => setModal({ open: true, dossier: null }), []);
  const openDetail = useCallback((dossier) => setModal({ open: true, dossier }), []);
  const closeModal = useCallback(() => setModal({ open: false, dossier: null }), []);

  const handleSubmit = async (body) => {
    if (modal.dossier) {
      await api.updateDossier(modal.dossier._id, body);
      pushToast(`Đã cập nhật hồ sơ ${modal.dossier.maHoSo}`, 'success');
    } else {
      const { data } = await api.createDossier(body);
      pushToast(
        `Đã tiếp nhận ${data.maHoSo} — trình LĐ ${formatDate(data.ngayTrinhLanhDao)}, hết hạn ${formatDate(data.ngayHetHan)}`,
        'success'
      );
    }
    closeModal();
    await loadData();
  };

  /** Xuất Excel đúng các hồ sơ (và thứ tự) đang hiển thị / đang chọn. */
  const handleExport = useCallback(
    async (ids) => {
      try {
        saveBlob(await api.exportDossiers(ids), `ho-so-${todayStamp()}.xlsx`);
        pushToast(`Đã xuất ${ids.length} hồ sơ ra Excel`, 'success');
      } catch (error) {
        pushToast(`Không xuất được: ${error.message}`, 'error');
      }
    },
    [pushToast]
  );

  /** Xuất Excel toàn bộ hồ sơ khớp bộ lọc hiện tại (server lọc + sắp xếp như bảng). */
  const handleExportFiltered = useCallback(async () => {
    try {
      saveBlob(await api.exportDossiersByFilter(listQuery), `ho-so-${todayStamp()}.xlsx`);
      pushToast(`Đã xuất ${total} hồ sơ ra Excel`, 'success');
    } catch (error) {
      pushToast(`Không xuất được: ${error.message}`, 'error');
    }
  }, [listQuery, total, pushToast]);

  /** Thao tác hàng loạt. Trả true để bảng bỏ chọn. */
  const handleBulkUpdate = useCallback(
    async (ids, changes, label) => {
      let lyDo;
      if ('canBoThuLy' in changes) {
        // Lý do bắt buộc khi có hồ sơ đang được cán bộ khác thụ lý (backend kiểm tra lại).
        const byId = new Map(dossiers.map((d) => [d._id, d]));
        const reassigning = ids.some((id) => {
          const d = byId.get(id);
          return !d || (d.canBoThuLy && d.canBoThuLy._id !== (changes.canBoThuLy || null));
        });
        const answer = await askReason({
          title: label,
          subtitle: `${ids.length} hồ sơ đã chọn`,
          label: reassigning ? 'Lý do chuyển cán bộ' : 'Ghi chú',
          required: reassigning,
          confirmLabel: 'Xác nhận',
        });
        if (!answer) return false;
        lyDo = answer.lyDo;
      } else if (ids.length > 1 && !window.confirm(`${label} cho ${ids.length} hồ sơ đã chọn?`)) {
        return false;
      }
      try {
        const { data } = await api.bulkUpdate(ids, changes, lyDo);
        pushToast(
          `${label}: cập nhật ${data.updated} hồ sơ${data.unchanged ? `, ${data.unchanged} hồ sơ không đổi` : ''}`,
          'success'
        );
        await loadData();
        return true;
      } catch (error) {
        pushToast(`Không cập nhật được: ${error.message}`, 'error');
        return false;
      }
    },
    [askReason, dossiers, loadData, pushToast]
  );

  const handleBulkDelete = useCallback(
    async (ids) => {
      if (!window.confirm(`Xoá vĩnh viễn ${ids.length} hồ sơ đã chọn? Thao tác này không thể hoàn tác.`)) return false;
      try {
        const { data } = await api.bulkDelete(ids);
        pushToast(`Đã xoá ${data.deleted} hồ sơ`, 'info');
        await loadData();
        return true;
      } catch (error) {
        pushToast(`Không xoá được: ${error.message}`, 'error');
        return false;
      }
    },
    [loadData, pushToast]
  );

  const handleDelete = useCallback(
    async (dossier) => {
      if (!window.confirm(`Xoá hồ sơ ${dossier.maHoSo}? Thao tác này không thể hoàn tác.`)) return;
      try {
        await api.deleteDossier(dossier._id);
        pushToast(`Đã xoá hồ sơ ${dossier.maHoSo}`, 'info');
        await loadData();
      } catch (error) {
        pushToast(`Không xoá được: ${error.message}`, 'error');
      }
    },
    [loadData, pushToast]
  );

  // Đang kiểm tra phiên / đang chuyển hướng về /login.
  if (!currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-sm text-slate-500">
        <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden />
        Đang kiểm tra phiên đăng nhập…
      </div>
    );
  }

  return (
    <>
      <UserBar
        user={currentUser}
        showLockedAsMasked={showLockedAsMasked}
        onToggleMasked={() => setShowLockedAsMasked((prev) => !prev)}
        onLogout={handleLogout}
      />

      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-5 px-4 py-5">
        <PageHeader canCreate={canCreate} onCreate={openCreate} onImport={() => setImportOpen(true)}>
          <QuickLookup onFound={openDetail} pushToast={pushToast} />
        </PageHeader>

        <KpiCards
          stats={stats}
          scopeText={
            role === 'CAN_BO' ? `🔒 Chỉ hồ sơ của ${getUserName(currentUser)}` : 'Đang xem: Toàn bộ hồ sơ'
          }
          quickFilter={quickFilter}
          onSelect={selectQuickFilter}
        />

        <Toolbar
          search={search}
          onSearchChange={setSearch}
          filters={filters}
          onFilterChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
          meta={meta}
          canBoList={canBoList}
          currentUser={currentUser}
          nextWeekActive={nextWeekActive}
          dueNextWeekCount={stats.dueNextWeek}
          onToggleNextWeek={() => selectQuickFilter(nextWeekActive ? QUICK_FILTERS.ALL : QUICK_FILTERS.NEXT_WEEK)}
          anyFilterActive={anyFilterActive}
          onReset={resetAllFilters}
          density={density}
          onDensityChange={setDensity}
          sortText={sortText}
          loading={loading}
          onRefresh={loadData}
        />

        {(loadError || authError) && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
            {loadError || authError}
          </div>
        )}

        <DossierTable
          data={dossiers}
          role={role}
          meta={meta}
          canBoList={canBoList}
          total={total}
          pagination={pagination}
          onPaginationChange={setPagination}
          filterKey={filterKey}
          loading={loading}
          sorting={sorting}
          onSortingChange={setSorting}
          density={density}
          showLockedAsMasked={showLockedAsMasked}
          onInlineUpdate={handleInlineUpdate}
          onOpenDetail={openDetail}
          onExtend={handleExtend}
          onDelete={handleDelete}
          onResetFilters={resetAllFilters}
          onBulkUpdate={handleBulkUpdate}
          onBulkDelete={handleBulkDelete}
          onExport={handleExport}
          onExportFiltered={handleExportFiltered}
          onSelectAllFiltered={handleSelectAllFiltered}
        />
      </main>

      {canCreate && (
        <ImportExcelModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          pushToast={pushToast}
          onImported={(result) => {
            // Nhập xong hoặc hoàn tác: tải lại danh sách + danh sách cán bộ (có thể vừa tạo tài khoản mới).
            if (result) pushToast(`Đã nhập ${result.inserted} hồ sơ từ ${result.fileName}`, 'success');
            loadData();
            api.getCanBo().then(({ data }) => setCanBoList(data)).catch(() => {});
          }}
        />
      )}

      <DossierFormModal
        open={modal.open}
        dossier={modal.dossier}
        role={role}
        userId={currentUser?._id}
        meta={meta}
        canBoList={canBoList}
        onClose={closeModal}
        onSubmit={handleSubmit}
      />

      {reasonDialog}
      <Toasts items={toasts} />
    </>
  );
}
