"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, PointerEvent as ReactPointerEvent, WheelEvent } from "react";
import { candlesForZoom, candlesPerTradingSession } from "./candle-aggregation";
import { indicatorDefinitions } from "./indicator-config";
import type { IndicatorId, IndicatorSettings } from "./indicator-config";
import { calculateIndicators } from "./indicators";
import type { IndicatorSeries } from "./indicators";
import type { Candle, CandleResolution, Timeframe } from "../market/types";

function formatPrice(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCandleDate(value: string, timeframe: Timeframe) {
  const date = new Date(value);
  const dateLabel = date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: timeframe === "1D" ? "2-digit" : "short",
    year: "2-digit",
  });
  return timeframe === "1D"
    ? `${dateLabel} ${date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`
    : dateLabel;
}

function formatVolume(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatIndicatorValue(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CandlestickChartView({
  candles: sourceCandles,
  indicatorCandles: indicatorSourceCandles = sourceCandles,
  timeframe,
  indicators,
  resolution,
  aggregationFactor,
}: {
  candles: Candle[];
  indicatorCandles?: Candle[];
  timeframe: Timeframe;
  indicators: IndicatorSettings;
  resolution: CandleResolution;
  aggregationFactor: number;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const visualRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ pointerId: number; startX: number; startY: number; startPanOffset: number; startVerticalPan: number; startScaledRange: number } | null>(null);
  const [viewport, setViewport] = useState({ width: 920, height: 380 });
  const [timeZoom, setTimeZoom] = useState({ candleWidth: 8 });
  const [priceScale, setPriceScale] = useState(1);
  const [panOffset, setPanOffset] = useState(0);
  const [verticalPan, setVerticalPan] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const calculationCandles = useMemo(
    () => candlesForZoom(indicatorSourceCandles, resolution, aggregationFactor),
    [aggregationFactor, indicatorSourceCandles, resolution],
  );
  const candles = useMemo(
    () => {
      if (!sourceCandles.length || !calculationCandles.length) return [];
      const firstTime = new Date(sourceCandles[0].time).getTime();
      const lastTime = new Date(sourceCandles[sourceCandles.length - 1].time).getTime();
      return calculationCandles.filter((candle) => {
        const time = new Date(candle.time).getTime();
        return time >= firstTime && time <= lastTime;
      });
    },
    [calculationCandles, sourceCandles],
  );
  const resetVwapBySession = resolution.unit === "minute" && aggregationFactor < candlesPerTradingSession(resolution);
  const calculatedIndicators = useMemo(
    () => calculateIndicators(calculationCandles, { resetVwapBySession }),
    [calculationCandles, resetVwapBySession],
  );
  const calculationIndexByTime = useMemo(
    () => new Map(calculationCandles.map((candle, index) => [candle.time, index])),
    [calculationCandles],
  );
  const activeOverlayIds = indicatorDefinitions.filter((definition) => definition.group === "overlay" && definition.id !== "levels" && indicators[definition.id]).map((definition) => definition.id);
  const activePanelIds = indicatorDefinitions.filter((definition) => definition.group === "panel" && indicators[definition.id]).map((definition) => definition.id);
  const activePriceLevels = useMemo(
    () => indicators.levels ? calculateIndicators(candles, { resetVwapBySession }).levels : [],
    [candles, indicators.levels, resetVwapBySession],
  );
  const timeAxisHeight = 30;
  const padding = { top: 24, right: 76, bottom: 8, left: 12 };
  const dimensions = { width: Math.max(320, viewport.width), height: Math.max(260, viewport.height) };
  const timeAxisTop = dimensions.height - padding.bottom - timeAxisHeight;
  const indicatorPanelHeight = activePanelIds.length
    ? Math.min(activePanelIds.length * 82, Math.max(0, dimensions.height - padding.top - padding.bottom - timeAxisHeight - 88))
    : 0;
  const chartBottom = timeAxisTop - indicatorPanelHeight;
  const chartHeight = Math.max(1, chartBottom - padding.top);
  const plotWidth = Math.max(1, dimensions.width - padding.left - padding.right);
  const candleGap = 6;
  const candleWidth = Math.max(0.1, timeZoom.candleWidth);
  const candleStep = candleWidth + candleGap;
  const visibleCount = Math.max(2, Math.floor(plotWidth / candleStep) + 1);
  const maxPanOffset = Math.max(0, candles.length - visibleCount);
  const boundedPanOffset = Math.min(panOffset / Math.max(1, aggregationFactor), maxPanOffset);
  const visibleEnd = Math.ceil(candles.length - boundedPanOffset);
  const visibleStart = Math.max(0, visibleEnd - visibleCount);
  const visibleCandles = candles.slice(visibleStart, visibleEnd);
  const overlayValues = activeOverlayIds
    .flatMap((id) => overlaySeries(id))
    .flatMap((series) => visibleCandles.map((_candle, index) => indicatorValueAt(series, visibleStart + index)))
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const priceValues = [
    ...visibleCandles.flatMap((candle) => [candle.low, candle.high]),
    ...overlayValues,
  ];
  const low = Math.min(...priceValues);
  const high = Math.max(...priceValues);
  const currentPrice = candles[candles.length - 1].close;
  const rawRange = high - low || 1;
  const range = Math.max(rawRange, Math.abs(high - currentPrice) * 2, Math.abs(currentPrice - low) * 2, 1);
  const scaledRange = range / priceScale;
  const priceCenter = currentPrice + verticalPan;
  const domainHigh = priceCenter + scaledRange / 2;
  const gridLines = [0, 0.25, 0.5, 0.75, 1];
  const timeLabelStep = Math.max(1, Math.ceil(visibleCandles.length / 9));
  const candleContentWidth = Math.max(0, (visibleCandles.length - 1) * candleStep);
  const fractionalPanOffset = boundedPanOffset - Math.floor(boundedPanOffset);
  const candleOffset = Math.max(padding.left, dimensions.width - padding.right - candleContentWidth) + fractionalPanOffset * candleStep;
  const hoveredCandle = hoverIndex === null ? null : visibleCandles[hoverIndex];
  const readoutCandle = hoveredCandle ?? candles[candles.length - 1];
  const readoutIndex = hoveredCandle ? visibleStart + hoverIndex! : candles.length - 1;

  function indicatorSeries(id: IndicatorId): IndicatorSeries {
    switch (id) {
      case "sma20": return calculatedIndicators.sma20;
      case "sma50": return calculatedIndicators.sma50;
      case "sma200": return calculatedIndicators.sma200;
      case "ema9": return calculatedIndicators.ema9;
      case "ema21": return calculatedIndicators.ema21;
      case "rsi": return calculatedIndicators.rsi;
      case "atr": return calculatedIndicators.atr;
      case "momentum": return calculatedIndicators.momentum;
      case "stochastic": return calculatedIndicators.stochasticK;
      case "adx": return calculatedIndicators.adx;
      case "volume": return calculatedIndicators.volume;
      case "vwap": return calculatedIndicators.vwap;
      case "macd": return calculatedIndicators.macd;
      case "bollinger": return calculatedIndicators.sma20;
      case "donchian": return calculatedIndicators.donchianMiddle;
      case "levels": return [];
    }
  }

  function overlaySeries(id: IndicatorId) {
    if (id === "bollinger") return [calculatedIndicators.bollingerUpper, calculatedIndicators.bollingerMiddle, calculatedIndicators.bollingerLower];
    if (id === "donchian") return [calculatedIndicators.donchianUpper, calculatedIndicators.donchianMiddle, calculatedIndicators.donchianLower];
    return [indicatorSeries(id)];
  }

  function indicatorValueAt(series: IndicatorSeries, chartIndex: number) {
    const candle = candles[chartIndex];
    if (!candle) return null;
    const calculationIndex = calculationIndexByTime.get(candle.time);
    return calculationIndex === undefined ? null : series[calculationIndex] ?? null;
  }

  function linePoints(series: IndicatorSeries, yForValue: (value: number) => number) {
    return visibleCandles
      .map((_candle, index) => {
        const value = indicatorValueAt(series, visibleStart + index);
        return value === null || value === undefined ? null : `${xForIndex(index)},${yForValue(value)}`;
      })
      .filter((point): point is string => point !== null)
      .join(" ");
  }

  function panelSeries(id: IndicatorId) {
    if (id === "macd") return [calculatedIndicators.macd, calculatedIndicators.macdSignal, calculatedIndicators.macdHistogram];
    if (id === "stochastic") return [calculatedIndicators.stochasticK, calculatedIndicators.stochasticD];
    if (id === "adx") return [calculatedIndicators.adx, calculatedIndicators.plusDi, calculatedIndicators.minusDi];
    return [indicatorSeries(id)];
  }

  function panelSeriesLabels(id: IndicatorId) {
    if (id === "macd") return ["MACD", "Signal", "Hist"];
    if (id === "stochastic") return ["%K", "%D"];
    if (id === "adx") return ["ADX", "+DI", "−DI"];
    return [];
  }

  function panelBounds(id: IndicatorId, series: IndicatorSeries[]) {
    if (id === "rsi" || id === "stochastic" || id === "adx") return { min: 0, max: 100 };
    const values = series
      .flatMap((indicatorSeriesValue) => visibleCandles.map((_candle, index) => indicatorValueAt(indicatorSeriesValue, visibleStart + index)))
      .filter((value): value is number => value !== null && Number.isFinite(value));
    if (!values.length) return { min: 0, max: 1 };
    if (id === "volume" || id === "atr") return { min: 0, max: Math.max(...values) * 1.08 || 1 };
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0);
    const spread = max - min || Math.max(Math.abs(max), 1);
    return { min: min - spread * .12, max: max + spread * .12 };
  }

  const overlayLegend: { id: string; label: string; value: number | null | string; className: string }[] = activeOverlayIds.flatMap((id) => {
    const labels = id === "bollinger"
      ? ["BB Upper", "BB Basis", "BB Lower"]
      : id === "donchian"
        ? ["DC Upper", "DC Basis", "DC Lower"]
        : [indicatorDefinitions.find((definition) => definition.id === id)?.label ?? id];
    return overlaySeries(id).map((series, seriesIndex) => ({
      id: `${id}-${seriesIndex}`,
      label: labels[seriesIndex],
      value: indicatorValueAt(series, readoutIndex),
      className: `indicator-${id}${seriesIndex === 1 ? " secondary" : seriesIndex === 2 ? " tertiary" : ""}`,
    }));
  });
  if (indicators.levels) {
    overlayLegend.push({
      id: "levels",
      label: "S/R-Zonen",
      value: `${activePriceLevels.filter((level) => level.type === "support").length}S / ${activePriceLevels.filter((level) => level.type === "resistance").length}R`,
      className: "indicator-levels",
    });
  }

  useEffect(() => {
    const visual = visualRef.current;
    if (!visual) return;

    const updateViewport = () => {
      setViewport({ width: visual.clientWidth || 920, height: visual.clientHeight || 380 });
    };

    updateViewport();
    const observer = new ResizeObserver(updateViewport);
    observer.observe(visual);
    return () => observer.disconnect();
  }, []);

  const yForPrice = (price: number) => padding.top + ((domainHigh - price) / scaledRange) * chartHeight;
  const xForIndex = (index: number) => candleOffset + index * candleStep;

  function changeTimeScale(delta: number) {
    const zoomingIn = delta > 0;
    setTimeZoom((current) => ({
      candleWidth: current.candleWidth * (zoomingIn ? 1.16 : 0.84),
    }));
  }

  function changePriceScale(delta: number) {
    setPriceScale((value) => Math.max(0.01, value * (delta > 0 ? 1.16 : 0.84)));
  }

  function handleMouseMove(event: MouseEvent<SVGSVGElement>) {
    if (panRef.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = ((event.clientX - bounds.left) / bounds.width) * dimensions.width;
    const verticalPosition = ((event.clientY - bounds.top) / bounds.height) * dimensions.height;
    if (position >= dimensions.width - padding.right || verticalPosition >= chartBottom) {
      setHoverIndex(null);
      return;
    }
    const index = Math.round((position - candleOffset) / candleStep);
    setHoverIndex(Math.max(0, Math.min(visibleCandles.length - 1, index)));
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = ((event.clientX - bounds.left) / bounds.width) * dimensions.width;
    const verticalPosition = ((event.clientY - bounds.top) / bounds.height) * dimensions.height;
    if (position >= dimensions.width - padding.right || verticalPosition >= chartBottom) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPanOffset: boundedPanOffset,
      startVerticalPan: verticalPan,
      startScaledRange: scaledRange,
    };
    setHoverIndex(null);
    setIsPanning(true);
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;

    event.preventDefault();
    const nextPanOffset = pan.startPanOffset + (event.clientX - pan.startX) / candleStep;
    const nextVerticalPan = pan.startVerticalPan + ((event.clientY - pan.startY) / chartHeight) * pan.startScaledRange;
    setPanOffset(Math.max(0, Math.min(maxPanOffset, nextPanOffset)) * Math.max(1, aggregationFactor));
    setVerticalPan(nextVerticalPan);
  }

  function handlePointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (panRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    panRef.current = null;
    setIsPanning(false);
  }

  function handleWheel(event: WheelEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = ((event.clientX - bounds.left) / bounds.width) * dimensions.width;
    const verticalPosition = ((event.clientY - bounds.top) / bounds.height) * dimensions.height;
    const isOverPriceAxis = position >= dimensions.width - padding.right;
    const isOverTimeAxis = verticalPosition >= timeAxisTop;
    if (!isOverPriceAxis && !isOverTimeAxis) return;
    event.preventDefault();
    event.stopPropagation();

    // The time axis occupies the lower edge of the chart, including the
    // right-hand corner. Check it first so the price axis cannot steal the
    // wheel event there when indicator panels are active.
    if (isOverTimeAxis) changeTimeScale(event.deltaY > 0 ? -2 : 2);
    else changePriceScale(event.deltaY > 0 ? -0.1 : 0.1);
  }

  return (
    <div ref={visualRef} className={`chart-visual${isPanning ? " is-panning" : ""}`}>
      <div className="chart-hover-readout is-visible">
        <div className="chart-candle-readout">
          <span>{formatCandleDate(readoutCandle.time, timeframe)}</span>
          <span>O {formatPrice(readoutCandle.open)}</span>
          <span>H {formatPrice(readoutCandle.high)}</span>
          <span>L {formatPrice(readoutCandle.low)}</span>
          <span>C {formatPrice(readoutCandle.close)}</span>
          <span>V {formatVolume(readoutCandle.volume)}</span>
        </div>
        {overlayLegend.length ? (
          <div className="chart-indicator-legend" aria-label="Aktive Indikatoren">
            {overlayLegend.map((entry) => (
              <span key={entry.id}>
                <i className={`indicator-legend-dot ${entry.className}`} />
                {entry.label} {typeof entry.value === "string" ? entry.value : formatIndicatorValue(entry.value)}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <svg
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        width={dimensions.width}
        height={dimensions.height}
        role="img"
        aria-label="Candlestick-Chart"
        onMouseMove={handleMouseMove}
        onWheelCapture={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {gridLines.map((line) => {
          const y = padding.top + line * chartHeight;
          return (
            <g key={line}>
              <line className="chart-grid-line" x1={padding.left} x2={dimensions.width - padding.right} y1={y} y2={y} />
            </g>
          );
        })}
        {activePriceLevels.map((level) => {
          if (level.fromIndex >= visibleEnd) return null;
          const zoneTop = yForPrice(level.price + level.zoneWidth);
          const zoneBottom = yForPrice(level.price - level.zoneWidth);
          const startX = level.fromIndex <= visibleStart
            ? Math.max(padding.left, xForIndex(0))
            : xForIndex(level.fromIndex - visibleStart);
          const endX = xForIndex(visibleCandles.length - 1);
          return (
            <g key={`${level.type}-${level.price}`}>
              <rect className={`price-zone ${level.type}`} x={startX} y={Math.min(zoneTop, zoneBottom)} width={Math.max(1, endX - startX)} height={Math.max(1, Math.abs(zoneBottom - zoneTop))} />
              <line className={`price-zone-line ${level.type}`} x1={startX} x2={endX} y1={yForPrice(level.price)} y2={yForPrice(level.price)} />
            </g>
          );
        })}
        {visibleCandles.map((candle, index) => {
          const x = xForIndex(index);
          const openY = yForPrice(candle.open);
          const closeY = yForPrice(candle.close);
          const highY = yForPrice(candle.high);
          const lowY = yForPrice(candle.low);
          const isUp = candle.close >= candle.open;

          return (
            <g key={candle.time} className={hoverIndex === index ? "candle-group hovered" : "candle-group"}>
              <line className={isUp ? "candle-wick up" : "candle-wick down"} x1={x} x2={x} y1={highY} y2={lowY} />
              <rect
                className={isUp ? "candle-body up" : "candle-body down"}
                x={x - candleWidth / 2}
                y={Math.min(openY, closeY)}
                width={candleWidth}
                height={Math.max(2, Math.abs(closeY - openY))}
                rx="1"
              />
            </g>
          );
        })}
        {activeOverlayIds.map((id) => overlaySeries(id).map((series, seriesIndex) => (
          <polyline
            className={`indicator-line indicator-${id}${seriesIndex === 1 ? " secondary" : seriesIndex === 2 ? " tertiary" : ""}`}
            fill="none"
            key={`${id}-${seriesIndex}`}
            points={linePoints(series, yForPrice)}
          />
        )))}
        {activePanelIds.map((id, panelIndex) => {
          const series = panelSeries(id);
          const bounds = panelBounds(id, series);
          const panelHeight = indicatorPanelHeight / activePanelIds.length;
          const panelTop = chartBottom + panelIndex * panelHeight;
          const panelBottom = panelTop + panelHeight;
          const yForPanelValue = (value: number) => panelTop + ((bounds.max - value) / (bounds.max - bounds.min)) * panelHeight;
          const panelGridLines = [0, .5, 1];
          const referenceValues = id === "rsi"
            ? [30, 70]
            : id === "stochastic"
              ? [20, 80]
              : id === "adx"
                ? [20, 25]
                : id === "macd" || id === "momentum"
                  ? [0]
                  : [];
          const seriesLabels = panelSeriesLabels(id);
          const panelCurrentValues = series.map((indicatorSeriesValue, seriesIndex) => {
            const value = formatIndicatorValue(indicatorValueAt(indicatorSeriesValue, readoutIndex));
            return seriesLabels[seriesIndex] ? `${seriesLabels[seriesIndex]} ${value}` : value;
          }).join(" / ");

          return (
            <g key={`indicator-panel-${id}`}>
              <rect className="indicator-panel-surface" x="0" y={panelTop} width={dimensions.width} height={panelHeight} />
              <rect className="indicator-panel-frame" x={padding.left} y={panelTop} width={dimensions.width - padding.left - padding.right} height={panelHeight} />
              {panelGridLines.map((line) => {
                const y = panelTop + line * panelHeight;
                return <line className="indicator-panel-grid" key={`${id}-grid-${line}`} x1={padding.left} x2={dimensions.width - padding.right} y1={y} y2={y} />;
              })}
              {referenceValues.map((value) => (
                <line className="indicator-reference-line" key={`${id}-reference-${value}`} x1={padding.left} x2={dimensions.width - padding.right} y1={yForPanelValue(value)} y2={yForPanelValue(value)} />
              ))}
              {id === "volume" ? visibleCandles.map((candle, visibleIndex) => {
                const value = indicatorValueAt(calculatedIndicators.volume, visibleStart + visibleIndex) ?? 0;
                const y = yForPanelValue(value);
                return <rect className={`indicator-bar volume ${candle.close >= candle.open ? "positive" : "negative"}`} key={`volume-${candle.time}`} x={xForIndex(visibleIndex) - Math.max(1, candleWidth) / 2} y={y} width={Math.max(1, candleWidth)} height={Math.max(1, yForPanelValue(0) - y)} />;
              }) : null}
              {id === "macd" ? visibleCandles.map((candle, visibleIndex) => {
                const value = indicatorValueAt(calculatedIndicators.macdHistogram, visibleStart + visibleIndex);
                if (value === null || value === undefined) return null;
                const zeroY = yForPanelValue(0);
                const valueY = yForPanelValue(value);
                return <rect className={`indicator-bar macd ${value >= 0 ? "positive" : "negative"}`} key={`macd-${candle.time}`} x={xForIndex(visibleIndex) - Math.max(1, candleWidth) / 2} y={Math.min(zeroY, valueY)} width={Math.max(1, candleWidth)} height={Math.max(1, Math.abs(zeroY - valueY))} />;
              }) : null}
              {series.map((indicatorSeriesValue, seriesIndex) => (id === "volume" || (id === "macd" && seriesIndex === 2)) ? null : (
                <polyline
                  className={`indicator-line indicator-${id}${seriesIndex === 1 ? " secondary" : seriesIndex === 2 ? " tertiary" : ""}`}
                  fill="none"
                  key={`${id}-series-${seriesIndex}`}
                  points={linePoints(indicatorSeriesValue, yForPanelValue)}
                />
              ))}
              <rect className="axis-surface indicator-axis-surface" x={dimensions.width - padding.right} y={panelTop} width={padding.right} height={panelHeight} />
              <line className="indicator-panel-axis-line" x1={dimensions.width - padding.right} x2={dimensions.width - padding.right} y1={panelTop} y2={panelBottom} />
              <line className="indicator-panel-axis-line" x1={padding.left} x2={dimensions.width - padding.right} y1={panelBottom} y2={panelBottom} />
              <text className="indicator-panel-label" x={padding.left + 4} y={panelTop + 14}>{indicatorDefinitions.find((definition) => definition.id === id)?.label} ({panelCurrentValues})</text>
              <text className="indicator-panel-value" x={dimensions.width - padding.right + 10} y={panelTop + 14}>{formatPrice(bounds.max)}</text>
              <text className="indicator-panel-value" x={dimensions.width - padding.right + 10} y={panelBottom - 6}>{formatPrice(bounds.min)}</text>
            </g>
          );
        })}
        {hoverIndex !== null ? (
          <line className="crosshair" x1={xForIndex(hoverIndex)} x2={xForIndex(hoverIndex)} y1={padding.top} y2={chartBottom} />
        ) : null}
        <rect className="axis-surface price-axis-surface" x={dimensions.width - padding.right} y="0" width={padding.right} height={chartBottom} />
        <rect className="axis-surface time-axis-surface" x="0" y={timeAxisTop} width={dimensions.width} height={dimensions.height - timeAxisTop} />
        <line className="price-axis-line" x1={dimensions.width - padding.right} x2={dimensions.width - padding.right} y1={padding.top} y2={chartBottom} />
        <line className="time-axis-line" x1={padding.left} x2={dimensions.width - padding.right} y1={timeAxisTop} y2={timeAxisTop} />
        {gridLines.map((line) => {
          const y = padding.top + line * chartHeight;
          return (
            <text key={`price-${line}`} className="chart-axis-label" x={dimensions.width - padding.right + 10} y={y + 4}>
              {formatPrice(domainHigh - line * scaledRange)}
            </text>
          );
        })}
        {visibleCandles.map((candle, index) => {
          if (index % timeLabelStep !== 0 && index !== visibleCandles.length - 1) return null;
          const x = xForIndex(index);
          return (
            <g key={`time-${candle.time}`}>
              <line className="time-axis-tick" x1={x} x2={x} y1={timeAxisTop} y2={timeAxisTop + 5} />
              <text className="chart-time-label" x={x} y={dimensions.height - 7} textAnchor={index === visibleCandles.length - 1 ? "end" : "middle"}>
                {formatCandleDate(candle.time, timeframe)}
              </text>
            </g>
          );
        })}
        <rect className="price-axis-hit-area" x={dimensions.width - padding.right} y="0" width={padding.right} height={chartBottom} />
        <rect className="time-axis-hit-area" x="0" y={timeAxisTop} width={dimensions.width} height={dimensions.height - timeAxisTop} />
      </svg>
    </div>
  );
}
