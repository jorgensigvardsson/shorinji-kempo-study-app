import { useEffect, useRef, useState } from "react";
import type { UsageColumn, UsageGroup } from "../usageSeries";
import "./UsageChart.css";

// A stacked column chart of people per bucket, drawn as SVG at the pixel width it
// is given — not scaled through a viewBox, which would shrink the axis text to
// nothing on a phone.
//
// The mark specs are the data-viz ones: columns at most 24px, a 4px rounded cap
// square at the baseline, a 2px surface gap between stacked segments, hairline
// solid gridlines. Colors come from CSS custom properties (UsageChart.css), so the
// dark steps are chosen there rather than flipped here.

export interface UsageChartProps {
  groups: UsageGroup[];
  columns: UsageColumn[];
  colorOf: (group: UsageGroup) => string; // a CSS color, normally var(--usage-series-n)
  shortLabel: (start: string) => string; // under the axis
  longLabel: (start: string) => string; // at the top of the tooltip
  totalLabel: string;
  ariaLabel: string;
}

const Height = 220;
const Margin = { top: 8, right: 8, bottom: 24, left: 32 };
const MaxBar = 24;
const SegmentGap = 2;
const CapRadius = 4;
const MinLabelSpacing = 56;

// Round numbers for the y axis: a step of 1, 2 or 5 times a power of ten, with
// about four of them to the top.
const niceScale = (max: number): { top: number; step: number } => {
  if (max <= 0) return { top: 4, step: 1 };
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, [1, 2, 5, 10].map(m => m * magnitude).find(s => s >= rough) ?? 10 * magnitude);
  return { top: Math.ceil(max / step) * step, step };
};

// A column whose top corners are rounded and whose bottom is square, so it reads
// as growing out of the baseline.
const cappedRect = (x: number, y: number, w: number, h: number): string => {
  const r = Math.min(CapRadius, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
};

// The width the chart actually has. jsdom has no ResizeObserver, and a chart that
// cannot measure itself still has to draw something.
const useWidth = (): [React.RefObject<HTMLDivElement | null>, number] => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(entries => {
      const measured = entries[0]?.contentRect.width;
      if (measured) setWidth(measured);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
};

const UsageChart = ({ groups, columns, colorOf, shortLabel, longLabel, totalLabel, ariaLabel }: UsageChartProps) => {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);

  const plotWidth = Math.max(1, width - Margin.left - Margin.right);
  const plotHeight = Height - Margin.top - Margin.bottom;
  const stackHeight = (c: UsageColumn) => c.values.reduce((sum, v) => sum + v, 0);
  const { top, step } = niceScale(Math.max(0, ...columns.map(c => Math.max(stackHeight(c), c.people))));
  const y = (value: number) => Margin.top + plotHeight - (value / top) * plotHeight;

  const slot = plotWidth / Math.max(1, columns.length);
  const bar = Math.max(1, Math.min(MaxBar, slot * 0.7));
  const labelEvery = Math.max(1, Math.ceil(MinLabelSpacing / slot));

  const ticks: number[] = [];
  for (let t = 0; t <= top; t += step) ticks.push(t);

  const activeColumn = active !== null ? columns[active] : undefined;
  const tooltipLeft = active !== null
    ? Math.min(Math.max(Margin.left + slot * (active + 0.5), 90), Math.max(90, width - 90))
    : 0;

  return (
    <div className="usage-chart" ref={ref}>
      <svg width={width} height={Height} role="img" aria-label={ariaLabel}
           onPointerLeave={() => setActive(null)}>
        {ticks.map(t => (
          <g key={t}>
            <line className="usage-chart-grid" x1={Margin.left} x2={width - Margin.right} y1={y(t)} y2={y(t)} />
            <text className="usage-chart-tick" x={Margin.left - 6} y={y(t)} dy="0.32em" textAnchor="end">{t}</text>
          </g>
        ))}
        <line className="usage-chart-baseline" x1={Margin.left} x2={width - Margin.right} y1={y(0)} y2={y(0)} />

        {columns.map((column, i) => {
          const x = Margin.left + slot * i + (slot - bar) / 2;
          // Segments bottom to top; the topmost non-empty one gets the rounded cap.
          const topmost = column.values.reduce((last, v, g) => (v > 0 ? g : last), -1);
          let base = 0;
          return (
            <g key={column.start} className={active !== null && active !== i ? "usage-chart-dimmed" : undefined}>
              {column.values.map((value, g) => {
                if (value <= 0) return null;
                const y0 = y(base);
                base += value;
                const y1 = y(base);
                // The gap is taken out of the segment below, so stacks keep their
                // true height; a segment too thin to give up 2px keeps all of it.
                const gap = g !== topmost && y0 - y1 > SegmentGap * 2 ? SegmentGap : 0;
                const h = Math.max(0, y0 - y1 - gap);
                const fill = colorOf(groups[g]);
                return g === topmost
                  ? <path key={g} d={cappedRect(x, y1, bar, h)} fill={fill} />
                  : <rect key={g} x={x} y={y1 + gap} width={bar} height={h} fill={fill} />;
              })}
              {i % labelEvery === 0 && (
                <text className="usage-chart-tick" x={x + bar / 2} y={Height - 6} textAnchor="middle">
                  {shortLabel(column.start)}
                </text>
              )}
            </g>
          );
        })}

        {/* Hit targets: the whole slot, the full height, so a thin column or an
            empty day is as easy to point at as a tall one. */}
        {columns.map((column, i) => (
          <rect key={column.start} className="usage-chart-hit"
                x={Margin.left + slot * i} y={Margin.top} width={slot} height={plotHeight}
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(a => (a === i ? null : i))} />
        ))}
      </svg>

      {activeColumn !== undefined && (
        <div className="usage-chart-tooltip" style={{ left: tooltipLeft }} role="status">
          <div className="usage-chart-tooltip-title">{longLabel(activeColumn.start)}</div>
          <div className="usage-chart-tooltip-row">
            <span>{totalLabel}</span>
            <span className="usage-chart-tooltip-value">{activeColumn.people}</span>
          </div>
          {groups.length > 1 && [...groups.keys()].reverse().map(g => activeColumn.values[g] > 0 && (
            <div key={groups[g].key} className="usage-chart-tooltip-row">
              <span><span className="usage-chart-swatch" style={{ background: colorOf(groups[g]) }} />{groups[g].label}</span>
              <span className="usage-chart-tooltip-value">{activeColumn.values[g]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default UsageChart;
