'use client';

import { useState } from 'react';

// Bảng màu đã kiểm tra (dataviz validate_palette, light, mọi cặp): xanh dương / xanh ngọc / cam.
// Xanh ngọc < 3:1 trên nền sáng → luôn có chú thích + nhãn + bảng số liệu đi kèm.
export const MONTHLY_SERIES = [
  { key: 'received', label: 'Tiếp nhận', color: '#2a78d6' },
  { key: 'onTime', label: 'Giải quyết đúng hạn', color: '#1baf7a' },
  { key: 'late', label: 'Giải quyết trễ hạn', color: '#eb6834' },
];

const W = 720;
const H = 260;
const PAD = { top: 16, right: 12, bottom: 28, left: 40 };
const GAP = 2; // khe nền giữa các khối chồng / cột cạnh nhau

/** Hình chữ nhật bo 4px ở đầu dữ liệu (phía trên), đáy phẳng bám trục. */
function topRoundedRect(x, y, w, h, r = 4) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

const niceMax = (value) => {
  if (value <= 5) return 5;
  const pow = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s * 4 >= value) ?? pow * 10;
  return step * 4;
};

/**
 * Cột theo tháng: cột trái = tiếp nhận, cột phải = giải quyết (đúng hạn dưới, trễ hạn chồng lên).
 * Cùng một trục (đều là số hồ sơ). Rê chuột vào tháng để xem số liệu.
 */
export default function MonthlyChart({ months }) {
  const [hover, setHover] = useState(null);
  const maxValue = niceMax(Math.max(1, ...months.map((m) => Math.max(m.received, m.onTime + m.late))));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const groupW = plotW / months.length;
  const barW = Math.min(18, (groupW - 10) / 2);
  const y = (value) => PAD.top + plotH - (value / maxValue) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxValue * t));

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Biểu đồ hồ sơ tiếp nhận và giải quyết theo tháng">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={PAD.left - 6} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="#64748b">
              {tick}
            </text>
          </g>
        ))}

        {months.map((m, i) => {
          const x0 = PAD.left + i * groupW + (groupW - (barW * 2 + GAP)) / 2;
          const xResolved = x0 + barW + GAP;
          const onTimeTop = y(m.onTime);
          const lateTop = y(m.onTime + m.late);
          const baseline = y(0);
          const active = hover === i;
          return (
            <g key={m.month} opacity={hover === null || active ? 1 : 0.45}>
              <path d={topRoundedRect(x0, y(m.received), barW, baseline - y(m.received))} fill={MONTHLY_SERIES[0].color} />
              {/* Đúng hạn: chỉ bo góc khi không có phần trễ hạn chồng lên */}
              {m.late > 0 ? (
                <rect x={xResolved} y={onTimeTop} width={barW} height={Math.max(0, baseline - onTimeTop)} fill={MONTHLY_SERIES[1].color} />
              ) : (
                <path d={topRoundedRect(xResolved, onTimeTop, barW, baseline - onTimeTop)} fill={MONTHLY_SERIES[1].color} />
              )}
              {m.late > 0 && (
                <path
                  d={topRoundedRect(xResolved, lateTop, barW, Math.max(0, onTimeTop - lateTop - (m.onTime > 0 ? GAP : 0)))}
                  fill={MONTHLY_SERIES[2].color}
                />
              )}
              <text x={PAD.left + i * groupW + groupW / 2} y={H - 8} textAnchor="middle" fontSize="11" fill={active ? '#0f172a' : '#64748b'} fontWeight={active ? 700 : 400}>
                T{m.month}
              </text>
              {/* Vùng bắt chuột rộng hơn cột */}
              <rect
                x={PAD.left + i * groupW}
                y={PAD.top}
                width={groupW}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}
        <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="#94a3b8" strokeWidth="1" />
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-[170px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${((PAD.left + (hover + 0.5) * groupW) / W) * 100}%`,
            transform: hover > months.length / 2 ? 'translateX(-105%)' : 'translateX(5%)',
          }}
        >
          <p className="mb-1 font-bold text-slate-900">Tháng {months[hover].month}</p>
          {MONTHLY_SERIES.map((s) => (
            <p key={s.key} className="flex items-center justify-between gap-3 text-slate-600">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                {s.label}
              </span>
              <strong className="text-slate-900">{months[hover][s.key]}</strong>
            </p>
          ))}
          {months[hover].resolvedNoDate > 0 && (
            <p className="mt-1 text-slate-400">+{months[hover].resolvedNoDate} hoàn thành không ghi ngày</p>
          )}
        </div>
      )}
    </div>
  );
}
