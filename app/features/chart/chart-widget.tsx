"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, MouseEvent, PointerEvent as ReactPointerEvent, WheelEvent } from "react";
import { LoaderCircle, Search } from "lucide-react";
import { candlesForZoom, candlesPerTradingSession, formatCandleResolution } from "../../../lib/market/candle-aggregation";
import { getMarketChartBundle } from "../../../lib/market/client-repository";
import { calculateIndicators } from "../../../lib/market/indicators";
import type { IndicatorSeries } from "../../../lib/market/indicators";
import type { Candle, CandleResolution, MarketChartBundle, Timeframe } from "../../../lib/market/types";

const timeframes: { value: Timeframe }[] = [
  { value: "1D" },
  { value: "1W" },
  { value: "1M" },
  { value: "3M" },
  { value: "6M" },
  { value: "1Y" },
  { value: "MAX" },
];

const fallbackCandleResolutions: Record<Timeframe, CandleResolution> = {
  "1D": { unit: "minute", value: 1, defaultAggregationFactor: 1, maxAggregationFactor: 5 },
  "1W": { unit: "minute", value: 1, defaultAggregationFactor: 5, maxAggregationFactor: 30 },
  "1M": { unit: "minute", value: 15, defaultAggregationFactor: 1, maxAggregationFactor: 4 },
  "3M": { unit: "minute", value: 15, defaultAggregationFactor: 1, maxAggregationFactor: 16 },
  "6M": { unit: "minute", value: 15, defaultAggregationFactor: 4, maxAggregationFactor: 26 },
  "1Y": { unit: "day", value: 1, defaultAggregationFactor: 1, maxAggregationFactor: 5 },
  "MAX": { unit: "day", value: 1, defaultAggregationFactor: 1, maxAggregationFactor: 20 },
};

const preferredCandleFactors: Record<Timeframe, number[]> = {
  "1D": [1, 2, 3, 5],
  "1W": [5, 10, 15, 30],
  "1M": [1, 2, 4],
  "3M": [1, 2, 4, 8, 12, 16],
  "6M": [1, 2, 4, 8, 12, 16, 20, 26],
  "1Y": [1, 2, 5],
  "MAX": [1, 2, 5, 10, 20],
};

function candleResolutionOptions(timeframe: Timeframe, resolution: CandleResolution) {
  const candidateFactors = preferredCandleFactors[timeframe].filter((factor) => (
    resolution.unit === "day" || factor * resolution.value <= 390
  ));
  const maximum = Math.max(1, resolution.maxAggregationFactor ?? candidateFactors[candidateFactors.length - 1]);
  const factors = candidateFactors.filter((factor) => factor <= maximum);
  if (!factors.includes(maximum)) factors.push(maximum);
  return factors.sort((first, second) => first - second);
}

export type IndicatorId =
  | "sma20"
  | "sma50"
  | "sma200"
  | "ema9"
  | "ema21"
  | "bollinger"
  | "donchian"
  | "vwap"
  | "rsi"
  | "macd"
  | "atr"
  | "momentum"
  | "stochastic"
  | "adx"
  | "volume"
  | "levels";

export type IndicatorSettings = Record<IndicatorId, boolean>;

export const defaultIndicatorSettings: IndicatorSettings = {
  sma20: false,
  sma50: false,
  sma200: false,
  ema9: false,
  ema21: false,
  bollinger: false,
  donchian: false,
  vwap: false,
  rsi: false,
  macd: false,
  atr: false,
  momentum: false,
  stochastic: false,
  adx: false,
  volume: false,
  levels: false,
};

const indicatorDefinitions: { id: IndicatorId; label: string; description: string; group: "overlay" | "panel" }[] = [
  { id: "sma20", label: "SMA 20", description: "Einfacher gleitender Durchschnitt", group: "overlay" },
  { id: "sma50", label: "SMA 50", description: "Mittelfristiger Trend", group: "overlay" },
  { id: "sma200", label: "SMA 200", description: "Langfristiger Trend", group: "overlay" },
  { id: "ema9", label: "EMA 9", description: "Schneller exponentieller Durchschnitt", group: "overlay" },
  { id: "ema21", label: "EMA 21", description: "Exponentieller Trendfilter", group: "overlay" },
  { id: "bollinger", label: "Bollinger Bands", description: "SMA 20 mit zwei Standardabweichungen", group: "overlay" },
  { id: "donchian", label: "Donchian 20", description: "20-Kerzen-Kanal für Hochs und Tiefs", group: "overlay" },
  { id: "vwap", label: "VWAP", description: "Je Session; Free-Feed intraday indikativ", group: "overlay" },
  { id: "rsi", label: "RSI 14", description: "Relative Stärke zwischen 0 und 100", group: "panel" },
  { id: "macd", label: "MACD 12 / 26 / 9", description: "MACD, Signallinie und Histogramm", group: "panel" },
  { id: "atr", label: "ATR 14", description: "True Range mit Wilders Glättung", group: "panel" },
  { id: "momentum", label: "Momentum 10", description: "Abstand zum Schlusskurs vor 10 Kerzen", group: "panel" },
  { id: "stochastic", label: "Stochastic 14 / 3", description: "%K und geglättete %D-Linie", group: "panel" },
  { id: "adx", label: "ADX / DMI 14", description: "Trendstärke mit +DI und −DI", group: "panel" },
  { id: "volume", label: "Volume", description: "Intraday im Free-Feed nur Teilvolumen", group: "panel" },
  { id: "levels", label: "Support / Resistance", description: "Automatisch erkannte Preiszonen", group: "overlay" },
];

export function ChartIndicatorSettings({ value, onChange }: { value: IndicatorSettings; onChange: (next: IndicatorSettings) => void }) {
  const toggle = (id: IndicatorId) => onChange({ ...value, [id]: !value[id] });
  const renderGroup = (group: "overlay" | "panel", title: string) => (
    <div className="indicator-settings-group">
      <span className="indicator-settings-title">{title}</span>
      {indicatorDefinitions.filter((definition) => definition.group === group).map((definition) => (
        <button className="indicator-toggle-row" key={definition.id} type="button" onClick={() => toggle(definition.id)}>
          <span className="indicator-toggle-copy">
            <strong>{definition.label}</strong>
            <small>{definition.description}</small>
          </span>
          <span className={`indicator-switch${value[definition.id] ? " is-on" : ""}`} aria-hidden="true"><span /></span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="indicator-settings">
      <div className="indicator-settings-heading">
        <strong>Indikatoren</strong>
      </div>
      {renderGroup("overlay", "Im Chart")}
      {renderGroup("panel", "Unter dem Chart")}
    </div>
  );
}

function formatPrice(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatSignedValue(value: number) {
  return `${value >= 0 ? "+$" : "-$"}${formatPrice(Math.abs(value))}`;
}

function formatSignedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function getTimeframePerformance(candles: Candle[], referenceClose?: number, latestPrice?: number) {
  if (!candles.length || (candles.length < 2 && referenceClose === undefined)) return { value: 0, percent: 0 };
  const firstPrice = referenceClose ?? candles[0].close;
  const lastPrice = latestPrice ?? candles[candles.length - 1].close;
  const value = lastPrice - firstPrice;
  return { value, percent: firstPrice === 0 ? 0 : (value / firstPrice) * 100 };
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

export function ChartWidget({ symbol, onDataLoaded, indicators = defaultIndicatorSettings, refreshKey = 0 }: { symbol: string | null; onDataLoaded?: (data: MarketChartBundle) => void; indicators?: IndicatorSettings; refreshKey?: number }) {
  const [timeframe, setTimeframe] = useState<Timeframe>("1D");
  const [data, setData] = useState<MarketChartBundle | null>(null);
  const [error, setError] = useState<{ symbol: string; message: string } | null>(null);
  const [candleFactors, setCandleFactors] = useState<Partial<Record<Timeframe, number>>>({});

  useEffect(() => {
    let active = true;
    if (!symbol) return () => {
      active = false;
    };

    getMarketChartBundle(symbol)
      .then((nextData) => {
        if (!active) return;
        setData(nextData);
        onDataLoaded?.(nextData);
      })
      .catch((nextError: unknown) => {
        if (!active) return;
        setError({
          symbol,
          message: nextError instanceof Error ? nextError.message : "Marktdaten konnten nicht geladen werden.",
        });
      });

    return () => {
      active = false;
    };
  }, [symbol, onDataLoaded, refreshKey]);

  const currentData = data?.symbol === symbol ? data : null;
  const currentError = error?.symbol === symbol ? error.message : null;
  const isLoading = !currentData && !currentError;
  const timeframeCandles = currentData?.candlesByTimeframe[timeframe] ?? [];
  const candleResolution = currentData?.candleResolutionByTimeframe?.[timeframe] ?? fallbackCandleResolutions[timeframe];
  const selectedCandleFactor = candleFactors[timeframe] ?? candleResolution.defaultAggregationFactor;
  const availableCandleFactors = candleResolutionOptions(timeframe, candleResolution);
  const timeframePerformance = getTimeframePerformance(timeframeCandles, currentData?.referenceCloseByTimeframe?.[timeframe], currentData?.lastPrice);

  if (!symbol) {
    return <div className="chart-widget"><div className="chart-empty chart-no-symbol">Kein Ticker ausgewählt</div></div>;
  }

  return (
    <div className="chart-widget">
      {currentData ? (
        <>
          <div className="chart-overview">
            <div className="chart-overview-identity">
              <strong>{currentData.symbol}</strong>
            </div>
            <div className="chart-overview-metrics">
              <div>
                <span>Preis</span>
                <strong>${formatPrice(currentData.lastPrice)}</strong>
              </div>
              <div className={timeframePerformance.value < 0 ? "negative" : "positive"}>
                <span>Veränderung</span>
                <strong>{formatSignedValue(timeframePerformance.value)}</strong>
              </div>
              <div className={timeframePerformance.percent < 0 ? "negative" : "positive"}>
                <span>Prozent</span>
                <strong>{formatSignedPercent(timeframePerformance.percent)}</strong>
              </div>
            </div>
          </div>
          <div className="timeframe-row">
            <div className="timeframe-tabs" role="tablist" aria-label="Zeitraum">
              {timeframes.map((option) => (
                <button
                  className={timeframe === option.value ? "active" : ""}
                  key={option.value}
                  onClick={() => {
                    setTimeframe(option.value);
                  }}
                  role="tab"
                  type="button"
                  aria-selected={timeframe === option.value}
                >
                  <span>{option.value}</span>
                </button>
              ))}
            </div>
            <div className="candle-resolution-tabs" role="tablist" aria-label="Kerzenauflösung">
              <span className="candle-resolution-label">Kerze</span>
              {availableCandleFactors.map((factor) => (
                <button
                  className={selectedCandleFactor === factor ? "active" : ""}
                  key={factor}
                  onClick={() => setCandleFactors((current) => ({ ...current, [timeframe]: factor }))}
                  role="tab"
                  type="button"
                  aria-selected={selectedCandleFactor === factor}
                >
                  {formatCandleResolution(candleResolution, factor)}
                </button>
              ))}
            </div>
          </div>
          <div className="chart-canvas-wrap">
            {isLoading ? <div className="chart-loading"><LoaderCircle className="spin" size={20} /> Daten werden geladen</div> : null}
            {timeframeCandles.length ? (
              <CandlestickChartView
                key={`${currentData.symbol}-${timeframe}`}
                candles={timeframeCandles}
                timeframe={timeframe}
                indicators={indicators}
                resolution={candleResolution}
                aggregationFactor={selectedCandleFactor}
              />
            ) : (
              <div className="chart-empty chart-inline-empty">
                <span>Für {timeframe} sind keine Kerzen verfügbar.</span>
                {currentData.timeframeErrors?.[timeframe] ? <small>{currentData.timeframeErrors[timeframe]}</small> : null}
              </div>
            )}
          </div>
        </>
      ) : currentError ? (
        <div className="chart-error">
          <strong>Marktdaten konnten nicht geladen werden</strong>
          <small>{currentError}</small>
        </div>
      ) : (
        <div className="chart-empty"><LoaderCircle className="spin" size={22} /> Chart wird vorbereitet</div>
      )}
    </div>
  );
}

export function TickerSearch({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="ticker-search" onSubmit={onSubmit}>
      <Search size={16} />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value.toUpperCase())}
        aria-label="Ticker eingeben"
        placeholder="Ticker suchen"
        spellCheck={false}
      />
      <button type="submit">Anzeigen</button>
    </form>
  );
}

function CandlestickChartView({
  candles: sourceCandles,
  timeframe,
  indicators,
  resolution,
  aggregationFactor,
}: {
  candles: Candle[];
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
  const candles = useMemo(
    () => candlesForZoom(sourceCandles, resolution, aggregationFactor),
    [aggregationFactor, resolution, sourceCandles],
  );
  const resetVwapBySession = resolution.unit === "minute" && aggregationFactor < candlesPerTradingSession(resolution);
  const calculatedIndicators = useMemo(
    () => calculateIndicators(candles, { resetVwapBySession }),
    [candles, resetVwapBySession],
  );
  const activeOverlayIds = indicatorDefinitions.filter((definition) => definition.group === "overlay" && indicators[definition.id]).map((definition) => definition.id);
  const activePanelIds = indicatorDefinitions.filter((definition) => definition.group === "panel" && indicators[definition.id]).map((definition) => definition.id);
  const activePriceLevels = indicators.levels ? calculatedIndicators.levels : [];
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
  const overlayValues = activeOverlayIds.flatMap((id) => {
    if (id === "bollinger") return [...calculatedIndicators.bollingerUpper, ...calculatedIndicators.bollingerMiddle, ...calculatedIndicators.bollingerLower];
    if (id === "donchian") return [...calculatedIndicators.donchianUpper, ...calculatedIndicators.donchianMiddle, ...calculatedIndicators.donchianLower];
    return indicatorSeries(id);
  }).filter((value): value is number => value !== null && Number.isFinite(value));
  const priceValues = [
    ...candles.flatMap((candle) => [candle.low, candle.high]),
    ...overlayValues,
    ...activePriceLevels.flatMap((level) => [level.price - level.zoneWidth, level.price + level.zoneWidth]),
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

  function linePoints(series: IndicatorSeries, yForValue: (value: number) => number) {
    return visibleCandles
      .map((_candle, index) => {
        const value = series[visibleStart + index];
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
    const values = series.flat().filter((value): value is number => value !== null && Number.isFinite(value));
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
      value: series[readoutIndex],
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
            const value = formatIndicatorValue(indicatorSeriesValue[readoutIndex]);
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
                const value = calculatedIndicators.volume[visibleStart + visibleIndex] ?? 0;
                const y = yForPanelValue(value);
                return <rect className={`indicator-bar volume ${candle.close >= candle.open ? "positive" : "negative"}`} key={`volume-${candle.time}`} x={xForIndex(visibleIndex) - Math.max(1, candleWidth) / 2} y={y} width={Math.max(1, candleWidth)} height={Math.max(1, yForPanelValue(0) - y)} />;
              }) : null}
              {id === "macd" ? visibleCandles.map((candle, visibleIndex) => {
                const value = calculatedIndicators.macdHistogram[visibleStart + visibleIndex];
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
