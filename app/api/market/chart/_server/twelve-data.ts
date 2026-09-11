import "server-only";

import type { Candle, CandlesByTimeframe, MarketChartBundle, Timeframe } from "../../../../features/market/types";

const twelveDataBaseUrl = process.env.TWELVE_DATA_API_URL ?? "https://api.twelvedata.com";
const twelveDataApiKey = process.env.TWELVE_DATA_API_KEY ?? process.env.TWELVE_API_KEY;
const cacheTtlMs = 5 * 60 * 1000;
const maximumOutputSize = 5000;

const bundleCache = new Map<string, { expiresAt: number; value: Promise<MarketChartBundle> }>();
const marketDateFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/New_York",
  year: "numeric",
});
const marketTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  timeZone: "America/New_York",
});

type TwelveDataMeta = {
  symbol?: string;
  name?: string;
  exchange?: string;
  currency?: string;
  exchange_timezone?: string;
  interval?: string;
};

type TwelveDataValue = {
  datetime?: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string;
};

type TwelveDataTimeSeriesResponse = {
  status?: string;
  code?: number;
  message?: string;
  meta?: TwelveDataMeta;
  values?: TwelveDataValue[];
};

type TwelveDataQuoteResponse = TwelveDataMeta & {
  status?: string;
  code?: number;
  message?: string;
  timestamp?: number;
  last_quote_at?: number;
  datetime?: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string;
  previous_close?: string;
  change?: string;
  percent_change?: string;
  is_market_open?: boolean;
};

type TimeSeriesResult = {
  candles: Candle[];
  meta?: TwelveDataMeta;
};

class TwelveDataError extends Error {
  constructor(message: string, readonly statusCode = 502) {
    super(message);
    this.name = "TwelveDataError";
  }
}

function normalizeTicker(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
}

function finiteNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function marketDateKey(value: string) {
  const parts = marketDateFormatter.formatToParts(new Date(value));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function marketMinuteOfDay(value: string) {
  const parts = marketTimeFormatter.formatToParts(new Date(value));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function parseTwelveDataTime(value: string, isDaily: boolean) {
  if (isDaily) return new Date(`${value.slice(0, 10)}T00:00:00.000Z`).toISOString();
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  return new Date(`${normalized.replace(/Z$/, "")}Z`).toISOString();
}

function toCandles(rows: TwelveDataValue[] | undefined, isDaily: boolean) {
  const candles = (rows ?? []).flatMap<Candle>((row) => {
    const open = finiteNumber(row.open);
    const high = finiteNumber(row.high);
    const low = finiteNumber(row.low);
    const close = finiteNumber(row.close);
    if (!row.datetime || open === undefined || high === undefined || low === undefined || close === undefined) return [];

    try {
      return [{
        time: parseTwelveDataTime(row.datetime, isDaily),
        open,
        high: Math.max(high, open, close),
        low: Math.min(low, open, close),
        close,
        volume: Math.max(0, finiteNumber(row.volume) ?? 0),
      }];
    } catch {
      return [];
    }
  });

  candles.sort((first, second) => new Date(first.time).getTime() - new Date(second.time).getTime());
  return candles.filter((candle, index) => index === candles.length - 1 || candle.time !== candles[index + 1].time);
}

function providerError(payload: { code?: number; message?: string }, responseStatus: number) {
  const code = payload.code ?? responseStatus;
  const providerMessage = payload.message?.trim();

  if (code === 401 || code === 403) {
    return new TwelveDataError("Der Twelve-Data-API-Key ist ungültig oder für diese Daten nicht freigeschaltet.", 503);
  }
  if (code === 404) {
    return new TwelveDataError(providerMessage ?? "Ticker wurde nicht gefunden.", 404);
  }
  if (code === 429) {
    return new TwelveDataError("Das Twelve-Data-Limit ist gerade erreicht. Bitte kurz warten oder vorhandene Cache-Daten verwenden.", 429);
  }
  if (code === 400 && providerMessage?.toLowerCase().includes("symbol")) {
    return new TwelveDataError("Ticker wurde nicht gefunden oder ist im aktuellen Tarif nicht verfügbar.", 404);
  }
  return new TwelveDataError(providerMessage ?? "Twelve Data konnte die Marktdaten nicht laden.");
}

async function fetchTwelveData<T extends { status?: string; code?: number; message?: string }>(path: string, parameters: Record<string, string>) {
  if (!twelveDataApiKey) {
    throw new TwelveDataError("TWELVE_API_KEY fehlt. Lege ihn in .env.local oder .env an.", 503);
  }

  const endpoint = new URL(path, twelveDataBaseUrl);
  Object.entries(parameters).forEach(([key, value]) => endpoint.searchParams.set(key, value));
  endpoint.searchParams.set("apikey", twelveDataApiKey);

  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  let payload: T;
  try {
    payload = (await response.json()) as T;
  } catch {
    throw new TwelveDataError("Twelve Data hat eine ungültige Antwort geliefert.");
  }

  if (!response.ok || payload.status === "error" || payload.code) {
    throw providerError(payload, response.status);
  }
  return payload;
}

async function fetchTimeSeries(symbol: string, interval: "1min" | "15min" | "1day") {
  const payload = await fetchTwelveData<TwelveDataTimeSeriesResponse>("/time_series", {
    symbol,
    interval,
    outputsize: String(maximumOutputSize),
    order: "asc",
    adjust: "splits",
    timezone: "UTC",
    prepost: "false",
  });
  const candles = toCandles(payload.values, interval === "1day");
  if (!candles.length) throw new TwelveDataError(`Für ${symbol} sind keine ${interval}-Kerzen verfügbar.`, 404);
  return { candles, meta: payload.meta } satisfies TimeSeriesResult;
}

async function fetchQuote(symbol: string) {
  return fetchTwelveData<TwelveDataQuoteResponse>("/quote", {
    symbol,
    timezone: "UTC",
    prepost: "false",
  });
}

function regularSessionCandles(candles: Candle[]) {
  return candles.filter((candle) => {
    const minute = marketMinuteOfDay(candle.time);
    return minute >= 9 * 60 + 30 && minute < 16 * 60;
  });
}

function fillRegularSessionGaps(candles: Candle[], intervalMinutes: number) {
  if (candles.length < 2) return candles;
  const intervalMs = intervalMinutes * 60 * 1000;
  const normalized: Candle[] = [candles[0]];

  for (let index = 1; index < candles.length; index += 1) {
    const current = candles[index];
    const previous = normalized[normalized.length - 1];
    const previousTime = new Date(previous.time).getTime();
    const currentTime = new Date(current.time).getTime();

    if (marketDateKey(previous.time) === marketDateKey(current.time)) {
      for (let missingTime = previousTime + intervalMs; missingTime < currentTime; missingTime += intervalMs) {
        const time = new Date(missingTime).toISOString();
        const minute = marketMinuteOfDay(time);
        if (minute < 9 * 60 + 30 || minute >= 16 * 60) continue;
        normalized.push({
          time,
          open: previous.close,
          high: previous.close,
          low: previous.close,
          close: previous.close,
          volume: 0,
        });
      }
    }

    normalized.push(current);
  }

  return normalized;
}

function latestSession(candles: Candle[]) {
  if (!candles.length) return [];
  const session = marketDateKey(candles[candles.length - 1].time);
  return candles.filter((candle) => marketDateKey(candle.time) === session);
}

function sliceRange(candles: Candle[], lookbackDays: number) {
  if (!candles.length) return [];
  const latestTime = new Date(candles[candles.length - 1].time).getTime();
  const cutoff = latestTime - lookbackDays * 24 * 60 * 60 * 1000;
  return candles.filter((candle) => new Date(candle.time).getTime() >= cutoff);
}

function alignLatestIntradayClose(candles: Candle[], quote: TwelveDataQuoteResponse | undefined) {
  const close = finiteNumber(quote?.close);
  const timestamp = quote?.last_quote_at ?? quote?.timestamp;
  if (!candles.length || close === undefined || !timestamp) return candles;
  const latest = candles[candles.length - 1];
  const quoteTime = new Date(timestamp * 1000).toISOString();
  if (marketDateKey(latest.time) !== marketDateKey(quoteTime)) return candles;

  const aligned = [...candles];
  aligned[aligned.length - 1] = {
    ...latest,
    close,
    high: Math.max(latest.high, close),
    low: Math.min(latest.low, close),
  };
  return aligned;
}

function appendCurrentDailyCandle(candles: Candle[], quote: TwelveDataQuoteResponse | undefined) {
  const timestamp = quote?.last_quote_at ?? quote?.timestamp;
  const open = finiteNumber(quote?.open);
  const high = finiteNumber(quote?.high);
  const low = finiteNumber(quote?.low);
  const close = finiteNumber(quote?.close);
  if (!timestamp || open === undefined || high === undefined || low === undefined || close === undefined) return candles;

  const date = marketDateKey(new Date(timestamp * 1000).toISOString());
  const latestDate = candles[candles.length - 1]?.time.slice(0, 10);
  if (latestDate && date <= latestDate) return candles;

  return [...candles, {
    time: `${date}T00:00:00.000Z`,
    open,
    high: Math.max(high, open, close),
    low: Math.min(low, open, close),
    close,
    volume: Math.max(0, finiteNumber(quote?.volume) ?? 0),
  }];
}

function previousCloseBefore(sourceCandles: Candle[], selectedCandles: Candle[]) {
  const firstSelected = selectedCandles[0];
  if (!firstSelected) return undefined;
  const firstTime = new Date(firstSelected.time).getTime();
  for (let index = sourceCandles.length - 1; index >= 0; index -= 1) {
    if (new Date(sourceCandles[index].time).getTime() < firstTime) return sourceCandles[index].close;
  }
  return undefined;
}

function settledValue<T>(result: PromiseSettledResult<T>) {
  return result.status === "fulfilled" ? result.value : undefined;
}

function settledError(result: PromiseSettledResult<unknown>) {
  if (result.status !== "rejected") return undefined;
  return result.reason instanceof Error ? result.reason.message : "Daten konnten nicht geladen werden.";
}

function latestAvailableCandle(candlesByTimeframe: CandlesByTimeframe) {
  for (const timeframe of ["1D", "1W", "1M", "3M", "6M", "1Y", "MAX"] as Timeframe[]) {
    const candles = candlesByTimeframe[timeframe];
    if (candles.length) return candles[candles.length - 1];
  }
  return undefined;
}

async function loadBundle(symbol: string): Promise<MarketChartBundle> {
  if (!twelveDataApiKey) {
    throw new TwelveDataError("TWELVE_API_KEY fehlt. Lege ihn in .env.local oder .env an.", 503);
  }

  const [quoteResult, minuteResult, fifteenMinuteResult, dailyResult] = await Promise.allSettled([
    fetchQuote(symbol),
    fetchTimeSeries(symbol, "1min"),
    fetchTimeSeries(symbol, "15min"),
    fetchTimeSeries(symbol, "1day"),
  ]);

  const quote = settledValue(quoteResult);
  const minuteSeries = settledValue(minuteResult);
  const fifteenMinuteSeries = settledValue(fifteenMinuteResult);
  const dailySeries = settledValue(dailyResult);

  const minuteCandles = alignLatestIntradayClose(fillRegularSessionGaps(regularSessionCandles(minuteSeries?.candles ?? []), 1), quote);
  const fifteenMinuteCandles = alignLatestIntradayClose(fillRegularSessionGaps(regularSessionCandles(fifteenMinuteSeries?.candles ?? []), 15), quote);
  const dailyCandles = appendCurrentDailyCandle(dailySeries?.candles ?? [], quote);

  const oneDayCandles = latestSession(minuteCandles);
  const oneWeekCandles = sliceRange(minuteCandles, 7);
  const oneMonthCandles = sliceRange(fifteenMinuteCandles, 31);
  const threeMonthCandles = sliceRange(fifteenMinuteCandles, 93);
  const sixMonthCandles = sliceRange(fifteenMinuteCandles, 186);
  const oneYearCandles = sliceRange(dailyCandles, 366);

  const candlesByTimeframe: CandlesByTimeframe = {
    "1D": oneDayCandles,
    "1W": oneWeekCandles,
    "1M": oneMonthCandles,
    "3M": threeMonthCandles,
    "6M": sixMonthCandles,
    "1Y": oneYearCandles,
    "MAX": dailyCandles,
  };

  const fallbackCandle = latestAvailableCandle(candlesByTimeframe);
  if (!fallbackCandle) {
    const errors = [settledError(quoteResult), settledError(minuteResult), settledError(fifteenMinuteResult), settledError(dailyResult)].filter(Boolean);
    throw new TwelveDataError(errors[0] ?? `Ticker ${symbol} wurde nicht gefunden oder hat keine Marktdaten.`, errors[0]?.includes("nicht gefunden") ? 404 : 502);
  }

  const lastPrice = finiteNumber(quote?.close) ?? fallbackCandle.close;
  const previousDaily = dailyCandles.length > 1 ? dailyCandles[dailyCandles.length - 2] : undefined;
  const previousClose = finiteNumber(quote?.previous_close) ?? previousDaily?.close;
  const change = previousClose === undefined ? 0 : lastPrice - previousClose;
  const quoteTimestampValue = quote?.last_quote_at ?? quote?.timestamp;
  const quoteTimestamp = quoteTimestampValue ? new Date(quoteTimestampValue * 1000).toISOString() : undefined;
  const metadata = quote ?? minuteSeries?.meta ?? fifteenMinuteSeries?.meta ?? dailySeries?.meta;

  const referenceCloseByTimeframe: Partial<Record<Timeframe, number>> = {};
  if (previousClose !== undefined) referenceCloseByTimeframe["1D"] = previousClose;
  const references: [Timeframe, number | undefined][] = [
    ["1W", previousCloseBefore(minuteCandles, oneWeekCandles)],
    ["1M", previousCloseBefore(fifteenMinuteCandles, oneMonthCandles)],
    ["3M", previousCloseBefore(fifteenMinuteCandles, threeMonthCandles)],
    ["6M", previousCloseBefore(fifteenMinuteCandles, sixMonthCandles)],
    ["1Y", previousCloseBefore(dailyCandles, oneYearCandles)],
  ];
  references.forEach(([timeframe, reference]) => {
    if (reference !== undefined) referenceCloseByTimeframe[timeframe] = reference;
  });

  const timeframeErrors: Partial<Record<Timeframe, string>> = {};
  const minuteError = settledError(minuteResult);
  const fifteenMinuteError = settledError(fifteenMinuteResult);
  const dailyError = settledError(dailyResult);
  if (minuteError) {
    timeframeErrors["1D"] = minuteError;
    timeframeErrors["1W"] = minuteError;
  }
  if (fifteenMinuteError) {
    timeframeErrors["1M"] = fifteenMinuteError;
    timeframeErrors["3M"] = fifteenMinuteError;
    timeframeErrors["6M"] = fifteenMinuteError;
  }
  if (dailyError) {
    timeframeErrors["1Y"] = dailyError;
    timeframeErrors.MAX = dailyError;
  }

  return {
    symbol: normalizeTicker(quote?.symbol ?? metadata?.symbol ?? symbol),
    name: quote?.name ?? metadata?.name ?? symbol,
    exchange: quote?.exchange ?? metadata?.exchange ?? "US MARKET",
    currency: quote?.currency ?? metadata?.currency ?? "USD",
    candlesByTimeframe,
    candleResolutionByTimeframe: {
      "1D": { unit: "minute", value: 1, defaultAggregationFactor: 1, maxAggregationFactor: 5 },
      "1W": { unit: "minute", value: 1, defaultAggregationFactor: 5, maxAggregationFactor: 30 },
      "1M": { unit: "minute", value: 15, defaultAggregationFactor: 1, maxAggregationFactor: 4 },
      "3M": { unit: "minute", value: 15, defaultAggregationFactor: 1, maxAggregationFactor: 16 },
      "6M": { unit: "minute", value: 15, defaultAggregationFactor: 4, maxAggregationFactor: 26 },
      "1Y": { unit: "day", value: 1, defaultAggregationFactor: 1, maxAggregationFactor: 5 },
      "MAX": { unit: "day", value: 1, defaultAggregationFactor: 1, maxAggregationFactor: 20 },
    },
    lastPrice,
    change,
    changePercent: previousClose && previousClose !== 0 ? (change / previousClose) * 100 : 0,
    priceAsOf: quoteTimestamp ?? fallbackCandle.time,
    priceMode: quote ? "real-time" : "end-of-day",
    referenceCloseByTimeframe: Object.keys(referenceCloseByTimeframe).length ? referenceCloseByTimeframe : undefined,
    timeframeErrors: Object.keys(timeframeErrors).length ? timeframeErrors : undefined,
  };
}

export function getTwelveDataChartBundle(value: string, options?: { forceRefresh?: boolean }) {
  const symbol = normalizeTicker(value);
  if (!symbol) return Promise.reject(new TwelveDataError("Bitte einen gültigen Ticker eingeben.", 400));
  const cacheKey = `v1:${symbol}`;

  if (options?.forceRefresh) bundleCache.delete(cacheKey);
  const cached = bundleCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) bundleCache.delete(cacheKey);

  const bundlePromise = loadBundle(symbol).catch((error) => {
    bundleCache.delete(cacheKey);
    throw error;
  });
  bundleCache.set(cacheKey, { expiresAt: Date.now() + cacheTtlMs, value: bundlePromise });
  return bundlePromise;
}

export function getMarketDataErrorStatus(error: unknown) {
  return error instanceof TwelveDataError ? error.statusCode : 502;
}
