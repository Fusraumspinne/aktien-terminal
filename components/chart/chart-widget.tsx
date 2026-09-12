"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { formatCandleResolution } from "../../lib/chart/candle-aggregation";
import { CandlestickChartView } from "./candlestick-chart";
import { defaultIndicatorSettings } from "../../lib/chart/indicator-config";
import type { IndicatorSettings } from "../../lib/chart/indicator-config";
import { getMarketChartBundle } from "../../lib/market/client";
import type { Candle, CandleResolution, MarketChartBundle, Timeframe } from "../../lib/market/types";

const timeframes: Timeframe[] = ["1D", "1W", "1M", "3M", "6M", "1Y", "MAX"];

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
  const fallbackMaximum = candidateFactors[candidateFactors.length - 1] ?? 1;
  const maximum = Math.max(1, resolution.maxAggregationFactor ?? fallbackMaximum);
  const factors = candidateFactors.filter((factor) => factor <= maximum);
  if (!factors.includes(maximum)) factors.push(maximum);
  return factors.sort((first, second) => first - second);
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

type ChartWidgetProps = {
  symbol: string | null;
  marketData?: MarketChartBundle | null;
  onDataLoaded?: (data: MarketChartBundle) => void;
  onError?: (message: string) => void;
  indicators?: IndicatorSettings;
  refreshKey?: number;
};

export function ChartWidget({
  symbol,
  marketData,
  onDataLoaded,
  onError,
  indicators = defaultIndicatorSettings,
  refreshKey = 0,
}: ChartWidgetProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>("1D");
  const [data, setData] = useState<MarketChartBundle | null>(null);
  const [error, setError] = useState<{ symbol: string; message: string } | null>(null);
  const [candleFactors, setCandleFactors] = useState<Partial<Record<Timeframe, number>>>({});

  useEffect(() => {
    let active = true;
    if (!symbol || marketData?.symbol === symbol) return () => {
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
        const message = nextError instanceof Error ? nextError.message : "Marktdaten konnten nicht geladen werden.";
        setError({
          symbol,
          message,
        });
        onError?.(message);
      });

    return () => {
      active = false;
    };
  }, [symbol, marketData, onDataLoaded, onError, refreshKey]);

  const currentData = marketData?.symbol === symbol ? marketData : data?.symbol === symbol ? data : null;
  const currentError = error?.symbol === symbol ? error.message : null;
  const timeframeCandles = currentData?.candlesByTimeframe[timeframe] ?? [];
  const candleResolution = currentData?.candleResolutionByTimeframe?.[timeframe] ?? fallbackCandleResolutions[timeframe];
  const indicatorSourceCandles = currentData?.indicatorSourceCandles?.[
    timeframe === "1D" || timeframe === "1W"
      ? "minute"
      : timeframe === "1M" || timeframe === "3M" || timeframe === "6M"
        ? "fifteenMinute"
        : "daily"
  ] ?? timeframeCandles;
  const selectedCandleFactor = candleFactors[timeframe] ?? candleResolution.defaultAggregationFactor;
  const availableCandleFactors = candleResolutionOptions(timeframe, candleResolution);
  const timeframePerformance = getTimeframePerformance(
    timeframeCandles,
    currentData?.referenceCloseByTimeframe?.[timeframe],
    currentData?.lastPrice,
  );

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
                  className={timeframe === option ? "active" : ""}
                  key={option}
                  onClick={() => setTimeframe(option)}
                  role="tab"
                  type="button"
                  aria-selected={timeframe === option}
                >
                  <span>{option}</span>
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
            {timeframeCandles.length ? (
              <CandlestickChartView
                key={`${currentData.symbol}-${timeframe}`}
                candles={timeframeCandles}
                indicatorCandles={indicatorSourceCandles}
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

