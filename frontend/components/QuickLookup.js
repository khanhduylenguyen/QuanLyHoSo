'use client';

import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, ScanSearch } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/dossier';

/**
 * Tra cứu nhanh theo số biên nhận / mã hồ sơ (khớp đúng). Một kết quả → mở chi tiết ngay;
 * nhiều kết quả (số biên nhận trùng trong sổ cũ) → cho chọn.
 */
export default function QuickLookup({ onFound, pushToast }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState(null);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!matches) return undefined;
    const close = (event) => !boxRef.current?.contains(event.target) && setMatches(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [matches]);

  const pick = (record) => {
    setMatches(null);
    setValue('');
    onFound(record);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const keyword = value.trim();
    if (!keyword) return;
    setBusy(true);
    try {
      const { data } = await api.lookupDossier(keyword);
      if (data.length === 0) pushToast(`Không tìm thấy hồ sơ có số biên nhận / mã "${keyword}"`, 'error');
      else if (data.length === 1) pick(data[0]);
      else setMatches(data);
    } catch (error) {
      pushToast(`Không tra cứu được: ${error.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <form onSubmit={handleSubmit} className="flex items-center gap-1.5" role="search" aria-label="Tra cứu nhanh hồ sơ">
        <div className="relative">
          <ScanSearch className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Số biên nhận / mã HS…"
            aria-label="Số biên nhận hoặc mã hồ sơ"
            className="w-48 rounded-lg border border-slate-300 py-2 pl-8 pr-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !value.trim()}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:text-sm"
        >
          {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}
          Tra cứu
        </button>
      </form>

      {matches && (
        <ul className="absolute right-0 z-40 mt-1 w-80 overflow-hidden rounded-lg border border-slate-200 bg-white text-xs shadow-xl">
          <li className="bg-slate-50 px-3 py-1.5 font-semibold text-slate-500">{matches.length} hồ sơ trùng số — chọn một:</li>
          {matches.map((record) => (
            <li key={record._id}>
              <button type="button" onClick={() => pick(record)} className="block w-full px-3 py-2 text-left hover:bg-indigo-50">
                <span className="font-semibold text-indigo-700">{record.maHoSo}</span> · {record.tenHoSo}
                <span className="block text-slate-500">Ngày vào {formatDate(record.ngayVao)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
