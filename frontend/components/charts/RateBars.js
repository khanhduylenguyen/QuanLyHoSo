'use client';

/**
 * Thanh ngang một màu: tỷ lệ giải quyết đúng hạn theo từng mục (cán bộ / loại).
 * Mỗi thanh có nhãn số trực tiếp nên không cần chú thích màu.
 */
export default function RateBars({ items, emptyText = 'Chưa có hồ sơ giải quyết trong kỳ' }) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-slate-500">{emptyText}</p>;

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={item.label}
          className="grid grid-cols-[minmax(90px,140px)_1fr_auto] items-center gap-3 text-xs"
          title={`${item.label}: ${item.rate}% đúng hạn (${item.onTime}/${item.total} hồ sơ giải quyết)`}
        >
          <span className="truncate font-medium text-slate-700">{item.label}</span>
          <span className="h-3 rounded-full bg-slate-100">
            <span
              className="block h-3 rounded-full"
              style={{ width: `${Math.max(item.rate, 1)}%`, background: '#2a78d6' }}
            />
          </span>
          <span className="w-28 text-right tabular-nums text-slate-600">
            <strong className="text-slate-900">{item.rate}%</strong> ({item.onTime}/{item.total})
          </span>
        </li>
      ))}
    </ul>
  );
}
