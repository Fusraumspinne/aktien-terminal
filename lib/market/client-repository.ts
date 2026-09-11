import type { MarketChartBundle } from "./types";

const cacheTtlMs = 5 * 60 * 1000;
const bundleCache = new Map<string, { expiresAt: number; value: Promise<MarketChartBundle> }>();
const bundleVersion = "v7-dynamic-candles";

function normalizeTicker(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
}

function normalizeBundle(payload: MarketChartBundle): MarketChartBundle {
  const maxCandles = payload.candlesByTimeframe.MAX?.length
    ? payload.candlesByTimeframe.MAX
    : payload.candlesByTimeframe["1Y"] ?? [];

  return {
    ...payload,
    candlesByTimeframe: {
      ...payload.candlesByTimeframe,
      MAX: maxCandles,
    },
  };
}

export function getMarketChartBundle(value: string | null | undefined, options?: { forceRefresh?: boolean }) {
  const symbol = normalizeTicker(value ?? "");
  if (!symbol) return Promise.reject(new Error("Kein Ticker ausgewählt."));

  if (options?.forceRefresh) bundleCache.delete(symbol);
  const cached = bundleCache.get(symbol);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) bundleCache.delete(symbol);

  const refreshQuery = options?.forceRefresh ? "&refresh=1" : "";
  const request = fetch(`/api/market/chart?symbol=${encodeURIComponent(symbol)}&bundle=${bundleVersion}${refreshQuery}`, {
    cache: options?.forceRefresh ? "no-store" : "default",
  })
    .then(async (response) => {
      const payload = (await response.json()) as MarketChartBundle | { error?: string };
      if (!response.ok) throw new Error("error" in payload ? payload.error ?? "Marktdaten konnten nicht geladen werden." : "Marktdaten konnten nicht geladen werden.");
      return normalizeBundle(payload as MarketChartBundle);
    })
    .catch((error) => {
      bundleCache.delete(symbol);
      throw error;
    });

  bundleCache.set(symbol, { expiresAt: Date.now() + cacheTtlMs, value: request });
  return request;
}
