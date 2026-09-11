"use client";

import { useEffect, useRef, useState } from "react";
import type { Candle } from "../market/types";
import { buildPortfolioPerformanceSeries, buildPositionPerformanceSeries } from "./position-calculations";
import type { PositionLot, PositionPriceSnapshot } from "./types";

function formatMoney(value: number) {
  return `${value >= 0 ? "+" : "−"}$${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function PositionPerformanceChart({
  candles,
  positions,
  currentPrice,
  priceAsOf,
  snapshots,
}: {
  candles?: Candle[];
  positions: PositionLot[];
  currentPrice?: number | null;
  priceAsOf?: string;
  snapshots?: PositionPriceSnapshot[];
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(520);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const updateWidth = () => setChartWidth(Math.max(240, chart.clientWidth));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(chart);
    return () => observer.disconnect();
  }, []);

  const points = snapshots
    ? buildPortfolioPerformanceSeries(snapshots, positions)
    : (() => {
        const sourceCandles = candles ?? [];
        const currentTime = priceAsOf ?? sourceCandles[sourceCandles.length - 1]?.time ?? new Date().toISOString();
        const currentDate = currentTime.slice(0, 10);
        const latestCandle = sourceCandles[sourceCandles.length - 1];
        const chartCandles = latestCandle?.time.slice(0, 10) === currentDate && currentPrice !== null && currentPrice !== undefined
          ? [...sourceCandles.slice(0, -1), { ...latestCandle, close: currentPrice }]
          : currentPrice === null || currentPrice === undefined
            ? sourceCandles
            : [...sourceCandles, { time: currentTime, open: currentPrice, high: currentPrice, low: currentPrice, close: currentPrice, volume: 0 }];
        return buildPositionPerformanceSeries(chartCandles, positions);
      })();
  if (points.length < 2) {
    return <div className="position-chart-empty">Noch nicht genug historische Daten für den Verlauf.</div>;
  }

  const width = chartWidth;
  const height = 116;
  const padding = { top: 8, right: 4, bottom: 8, left: 4 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = points.map((point) => point.value);
  const minimum = Math.min(...values, 0);
  const maximum = Math.max(...values, 0);
  const range = maximum - minimum || 1;
  const xForIndex = (index: number) => padding.left + (index / Math.max(1, points.length - 1)) * plotWidth;
  const yForValue = (value: number) => padding.top + ((maximum - value) / range) * plotHeight;
  const line = points.map((point, index) => `${xForIndex(index)},${yForValue(point.value)}`).join(" ");
  const zeroY = yForValue(0);
  const latest = points[points.length - 1];

  return (
    <div ref={chartRef} className={`position-chart${latest.value < 0 ? " negative" : " positive"}`}>
      <div className="position-chart-heading">
        <strong>{formatMoney(latest.value)}</strong>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label="Gewinn- und Verlustverlauf der Position">
        <line className="position-chart-zero" x1={padding.left} x2={width - padding.right} y1={zeroY} y2={zeroY} />
        <polyline className="position-chart-line" fill="none" points={line} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="position-chart-dates"><span>{formatDate(points[0].time)}</span><span>{formatDate(latest.time)}</span></div>
    </div>
  );
}
