import type { MarketChartBundle } from "./types";

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

  const refreshQuery = options?.forceRefresh ? "&refresh=1" : "";
  return fetch(`/api/market/chart/db?symbol=${encodeURIComponent(symbol)}${refreshQuery}`, {
    cache: "no-store",
  })
    .then(async (response) => {
      const payload = (await response.json()) as MarketChartBundle | { error?: string };
      if (!response.ok) throw new Error("error" in payload ? payload.error ?? "Marktdaten konnten nicht geladen werden." : "Marktdaten konnten nicht geladen werden.");
      return normalizeBundle(payload as MarketChartBundle);
    });
}

