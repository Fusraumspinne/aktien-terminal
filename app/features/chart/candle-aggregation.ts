import type { Candle, CandleResolution } from "../market/types";

function mergeCandle(target: Candle, candle: Candle) {
  target.high = Math.max(target.high, candle.high);
  target.low = Math.min(target.low, candle.low);
  target.close = candle.close;
  target.volume += candle.volume;
}

function aggregateSequentially(candles: Candle[], factor: number) {
  if (factor <= 1) return candles;
  const aggregated: Candle[] = [];
  const leadingGroupSize = candles.length % factor || factor;
  let groupSize = 0;
  let targetGroupSize = leadingGroupSize;
  candles.forEach((candle) => {
    if (!aggregated.length || groupSize >= targetGroupSize) {
      aggregated.push({ ...candle });
      groupSize = 1;
      if (aggregated.length > 1) targetGroupSize = factor;
    } else {
      mergeCandle(aggregated[aggregated.length - 1], candle);
      groupSize += 1;
    }
  });
  return aggregated;
}

function aggregateWithinSessions(candles: Candle[], factor: number) {
  if (factor <= 1) return candles;
  const aggregated: Candle[] = [];
  let session = "";
  let sessionIndex = 0;

  candles.forEach((candle) => {
    const nextSession = candle.time.slice(0, 10);
    if (nextSession !== session) {
      session = nextSession;
      sessionIndex = 0;
    }
    if (sessionIndex % factor === 0) aggregated.push({ ...candle });
    else mergeCandle(aggregated[aggregated.length - 1], candle);
    sessionIndex += 1;
  });
  return aggregated;
}

function aggregateSessionsToDays(candles: Candle[]) {
  const dailyCandles: Candle[] = [];
  let session = "";
  candles.forEach((candle) => {
    const nextSession = candle.time.slice(0, 10);
    if (nextSession !== session) {
      dailyCandles.push({ ...candle });
      session = nextSession;
    } else {
      mergeCandle(dailyCandles[dailyCandles.length - 1], candle);
    }
  });
  return dailyCandles;
}

export function candlesPerTradingSession(resolution: CandleResolution) {
  return resolution.unit === "minute" ? Math.max(1, Math.round(390 / resolution.value)) : 1;
}

export function candlesForZoom(candles: Candle[], resolution: CandleResolution, factor: number) {
  const normalizedFactor = Math.min(
    Math.max(1, Math.round(factor)),
    Math.max(1, resolution.maxAggregationFactor ?? Number.MAX_SAFE_INTEGER),
  );
  if (resolution.unit === "day") return aggregateSequentially(candles, normalizedFactor);

  const sessionFactor = candlesPerTradingSession(resolution);
  if (normalizedFactor < sessionFactor) return aggregateWithinSessions(candles, normalizedFactor);

  const dayFactor = Math.max(1, Math.round(normalizedFactor / sessionFactor));
  return aggregateSequentially(aggregateSessionsToDays(candles), dayFactor);
}

export function formatCandleResolution(resolution: CandleResolution, factor: number) {
  const normalizedFactor = Math.max(1, Math.round(factor));
  if (resolution.unit === "day") {
    const days = resolution.value * normalizedFactor;
    if (days >= 20 && days % 20 === 0) return `${days / 20}M`;
    if (days >= 5 && days % 5 === 0) return `${days / 5}W`;
    return `${days}D`;
  }

  const sessionFactor = candlesPerTradingSession(resolution);
  if (normalizedFactor >= sessionFactor) {
    return `${Math.max(1, Math.round(normalizedFactor / sessionFactor))}D`;
  }

  const minutes = resolution.value * normalizedFactor;
  return minutes >= 60 && minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}m`;
}
