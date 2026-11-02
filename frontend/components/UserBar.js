'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { addDays, format } from 'date-fns';
import { BarChart3, Crown, FileSpreadsheet, FolderKanban, KeyRound, Lock, LogOut, Settings, ShieldCheck, UserCheck } from 'lucide-react';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, UPCOMING_WINDOW_DAYS, getUserName } from '@/lib/dossier';

function RoleIcon({ role }) {
  if (role === 'ADMIN') return <Crown className="h-3.5 w-3.5 text-amber-300" />;
  if (role === 'VAN_THU') return <FileSpreadsheet className="h-3.5 w-3.5 text-amber-400" />;
  return <UserCheck className="h-3.5 w-3.5 text-emerald-400" />;
}

const NAV_ITEMS = [
  { href: '/', label: 'Quản lý hồ sơ', icon: FolderKanban },
  { href: '/reports', label: 'Báo cáo', icon: BarChart3 },
  { href: '/admin', label: 'Quản trị hệ thống', icon: Settings, roles: ['ADMIN'] },
];

/**
 * Thanh trên cùng: menu trang, tài khoản đang đăng nhập, đăng xuất.
 * Công tắc hiển thị cột bị giới hạn chỉ hiện khi trang truyền `onToggleMasked`.
 */
export default function UserBar({ user, showLockedAsMasked, onToggleMasked, onLogout }) {
  const pathname = usePathname();
  const today = new Date();
  const roleLabel = ROLE_LABELS[user.role] || user.role;
  const name = getUserName(user);
  const navItems = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(user.role));

  return (
    // Chỉ dính trên màn hình rộng: ở màn hẹp thanh này cao, sẽ che mất bảng.
    <div className="z-40 border-b border-slate-700 bg-slate-900 text-white shadow-md lg:sticky lg:top-0">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-md border border-indigo-400/30 bg-indigo-500/20 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-indigo-200">
            <ShieldCheck className="h-4 w-4 text-indigo-400" />
            <span>Đang đăng nhập</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm ring-2 ring-indigo-400">
            <RoleIcon role={user.role} />
            {name}
            {name !== roleLabel && <span className="font-normal text-indigo-200">· {roleLabel}</span>}
          </div>
          <span className="text-xs text-slate-400">@{user.username}</span>

          {navItems.length > 1 && (
            <nav className="ml-2 flex items-center gap-1 border-l border-slate-700 pl-3" aria-label="Điều hướng">
              {navItems.map(({ href, label, icon: Icon }) => {
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      active ? 'bg-white text-slate-900' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onToggleMasked && (
            <label className="flex cursor-pointer select-none items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-1.5">
              <span className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                <Lock className="h-3.5 w-3.5 text-amber-400" />
                Cột không đủ quyền:
              </span>
              <input type="checkbox" className="peer sr-only" checked={showLockedAsMasked} onChange={onToggleMasked} />
              <span className="relative h-5 w-9 rounded-full bg-slate-600 transition after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-amber-500 peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-amber-300" />
              <span className={`text-xs font-semibold ${showLockedAsMasked ? 'text-amber-300' : 'text-rose-300'}`}>
                {showLockedAsMasked ? 'Hiện dạng khóa 🔒' : 'Ẩn hoàn toàn'}
              </span>
            </label>
          )}
          <Link
            href="/account"
            className="flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white"
          >
            <KeyRound className="h-3.5 w-3.5" />
            Đổi mật khẩu
          </Link>
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-rose-400 hover:bg-rose-500/20 hover:text-rose-100"
          >
            <LogOut className="h-3.5 w-3.5" />
            Đăng xuất
          </button>
        </div>
      </div>

      <div className="border-t border-slate-700/80 bg-slate-800/80 px-4 py-1.5 text-xs">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-2">
          <span className="text-slate-300">{ROLE_DESCRIPTIONS[user.role]}</span>
          <div className="flex items-center gap-3 text-slate-400">
            <span>
              Hôm nay: <strong className="text-white">{format(today, 'dd/MM/yyyy')}</strong>
            </span>
            <span>•</span>
            <span>
              Tuần tới:{' '}
              <strong className="text-amber-300">
                {format(today, 'dd/MM')} đến {format(addDays(today, UPCOMING_WINDOW_DAYS), 'dd/MM')}
              </strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
