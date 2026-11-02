'use client';

import { FileSpreadsheet, FolderKanban, PlusCircle } from 'lucide-react';

export default function PageHeader({ canCreate, onCreate, onImport, children }) {
  return (
    <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5 lg:flex-row lg:items-center">
      <div className="flex items-start gap-3.5">
        <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
          <FolderKanban className="h-6 w-6" />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
              Hệ thống Quản lý, Phân công &amp; Theo dõi Hạn Hồ sơ
            </h1>
            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              Auto-Deadline
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
            Tự động tính <strong>Ngày trình Lãnh đạo</strong> &amp; <strong>Ngày hết hạn</strong> khi nhập ngày vào •
            Phân quyền dòng theo Cán bộ thụ lý &amp; Phân quyền cột bảo mật
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-auto">
        {children}
        {canCreate && (
          <>
          <button
            type="button"
            onClick={onImport}
            className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 sm:text-sm"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Nhập từ Excel
          </button>
          <button
            type="button"
            onClick={onCreate}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 sm:text-sm"
          >
            <PlusCircle className="h-4 w-4" />
            Nhập hồ sơ mới
          </button>
          </>
        )}
      </div>
    </div>
  );
}
