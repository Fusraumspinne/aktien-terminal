import type { Candle, CandleResolution, MarketChartBundle, Timeframe } from "../market/types";
import type { PositionLot, PositionPriceSnapshot } from "./types";

export type PositionPerformancePoint = {
  time: string;
  value: number;
};

export type PositionEntryMatch = {
  entryPrice: number;
  priceCandleTime: string;
  priceResolution: string;
};

function resolutionDuration(resolution: CandleResolution) {
  return resolution.unit === "minute"
    ? resolution.value * 60_000
    : resolution.value * 24 * 60 * 60_000;
}

function resolutionLabel(resolution: CandleResolution) {
  return resolution.unit === "minute" ? `${resolution.value}m` : `${resolution.value}D`;
}

export function findPositionEntry(bundle: MarketChartBundle, purchasedAtLocal: string): PositionEntryMatch | null {
  const target = new Date(purchasedAtLocal);
  const targetTime = target.getTime();
  if (!Number.isFinite(targetTime)) return null;
  const localDate = purchasedAtLocal.slice(0, 10);
  const utcDate = target.toISOString().slice(0, 10);

  // Prefer the raw series that was already fetched for the chart. This keeps
  // the entry/exit price as close as possible to the selected minute without
  // introducing a separate historical-price request.
  const rawSources = [
    {
      candles: bundle.indicatorSourceCandles?.minute ?? [],
      resolution: { unit: "minute", value: 1 } as CandleResolution,
    },
    {
      candles: bundle.indicatorSourceCandles?.fifteenMinute ?? [],
      resolution: { unit: "minute", value: 15 } as CandleResolution,
    },
    {
      candles: bundle.indicatorSourceCandles?.daily ?? [],
      resolution: { unit: "day", value: 1 } as CandleResolution,
    },
  ];
  const fallbackSources = (Object.keys(bundle.candlesByTimeframe) as Timeframe[]).map((timeframe) => ({
    candles: bundle.candlesByTimeframe[timeframe] ?? [],
    resolution: bundle.candleResolutionByTimeframe?.[timeframe],
  })).filter((source): source is typeof source & { resolution: CandleResolution } => Boolean(source.resolution));
  const sources = [...rawSources, ...fallbackSources]
    .filter((source) => source.candles.length)
    .sort((first, second) => resolutionDuration(first.resolution) - resolutionDuration(second.resolution));

  for (const source of sources) {
    if (source.resolution.unit === "day") {
      const candle = source.candles.find((candidate) => {
        const candleDate = candidate.time.slice(0, 10);
        return candleDate === localDate || candleDate === utcDate;
      });
      if (candle) {
        return {
          entryPrice: candle.close,
          priceCandleTime: candle.time,
          priceResolution: resolutionLabel(source.resolution),
        };
      }
      continue;
    }

    const intervalMs = resolutionDuration(source.resolution);
    const candle = source.candles.find((candidate) => {
      const candleTime = new Date(candidate.time).getTime();
      return candidate.time.slice(0, 10) === utcDate
        && targetTime >= candleTime
        && targetTime < candleTime + intervalMs;
    });
    if (candle) {
      return {
        entryPrice: candle.close,
        priceCandleTime: candle.time,
        priceResolution: resolutionLabel(source.resolution),
      };
    }

    // A manually entered time can be just outside the provider's candle
    // boundary (for example directly after the last regular-session bar).
    // Use the closest preceding bar from the same market day as a safe
    // fallback, but never a bar from another day.
    const precedingCandle = [...source.candles].reverse().find((candidate) => {
      const candleTime = new Date(candidate.time).getTime();
      return candidate.time.slice(0, 10) === utcDate
        && candleTime <= targetTime
        && targetTime - candleTime <= intervalMs * 2;
    });
    if (precedingCandle) {
      return {
        entryPrice: precedingCandle.close,
        priceCandleTime: precedingCandle.time,
        priceResolution: resolutionLabel(source.resolution),
      };
    }
  }

  return null;
}

export function calculatePositionSummary(positions: PositionLot[], currentPrice: number | null) {
  const openPositions = positions.filter((position) => !position.soldAt || position.exitPrice === undefined);
  const closedPositions = positions.filter((position) => position.soldAt && position.exitPrice !== undefined);
  const openShares = openPositions.reduce((total, position) => total + position.shares, 0);
  const openCost = openPositions.reduce((total, position) => total + position.shares * position.entryPrice, 0);
  const closedCost = closedPositions.reduce((total, position) => total + position.shares * position.entryPrice, 0);
  const averageOpenPrice = openShares > 0 ? openCost / openShares : 0;
  const marketValue = openShares === 0 ? 0 : currentPrice === null ? null : openShares * currentPrice;
  const unrealizedProfitLoss = openShares === 0 ? 0 : marketValue === null ? null : marketValue - openCost;
  const realizedProfitLoss = closedPositions.reduce(
    (total, position) => total + ((position.exitPrice ?? position.entryPrice) - position.entryPrice) * position.shares,
    0,
  );
  const totalProfitLoss = unrealizedProfitLoss === null ? null : unrealizedProfitLoss + realizedProfitLoss;
  const totalCost = openCost + closedCost;
  const totalProfitLossPercent = totalProfitLoss === null || totalCost === 0 ? null : totalProfitLoss / totalCost * 100;

  return {
    openCount: openPositions.length,
    closedCount: closedPositions.length,
    openShares,
    openCost,
    averageOpenPrice,
    marketValue,
    unrealizedProfitLoss,
    realizedProfitLoss,
    totalProfitLoss,
    totalProfitLossPercent,
  };
}

export function calculatePortfolioSummary(positions: PositionLot[], latestPrices: Record<string, number>) {
  const openPositions = positions.filter((position) => !position.soldAt || position.exitPrice === undefined);
  const closedPositions = positions.filter((position) => position.soldAt && position.exitPrice !== undefined);
  const openShares = openPositions.reduce((total, position) => total + position.shares, 0);
  const openCost = openPositions.reduce((total, position) => total + position.shares * position.entryPrice, 0);
  const closedCost = closedPositions.reduce((total, position) => total + position.shares * position.entryPrice, 0);
  const averageOpenPrice = openShares > 0 ? openCost / openShares : 0;
  const hasAllOpenPrices = openPositions.every((position) => Number.isFinite(latestPrices[position.symbol] ?? position.lastPrice));
  const marketValue = openPositions.length === 0
    ? 0
    : hasAllOpenPrices
      ? openPositions.reduce((total, position) => total + (latestPrices[position.symbol] ?? position.lastPrice!) * position.shares, 0)
      : null;
  const unrealizedProfitLoss = marketValue === null ? null : marketValue - openCost;
  const realizedProfitLoss = closedPositions.reduce(
    (total, position) => total + ((position.exitPrice ?? position.entryPrice) - position.entryPrice) * position.shares,
    0,
  );
  const totalProfitLoss = unrealizedProfitLoss === null ? null : unrealizedProfitLoss + realizedProfitLoss;
  const totalCost = openCost + closedCost;

  return {
    openCount: openPositions.length,
    closedCount: closedPositions.length,
    openShares,
    openCost,
    averageOpenPrice,
    marketValue,
    unrealizedProfitLoss,
    realizedProfitLoss,
    totalProfitLoss,
    totalProfitLossPercent: totalProfitLoss === null || totalCost === 0 ? null : totalProfitLoss / totalCost * 100,
  };
}

export function buildPositionPerformanceSeries(candles: Candle[], positions: PositionLot[]) {
  const sortedPositions = [...positions].sort((first, second) => first.purchasedAt.localeCompare(second.purchasedAt));
  if (!sortedPositions.length) return [];

  return candles.reduce<PositionPerformancePoint[]>((points, candle) => {
    const candleDate = candle.time.slice(0, 10);
    const startedPositions = sortedPositions.filter((position) => position.purchasedAt.slice(0, 10) <= candleDate);
    if (!startedPositions.length) return points;

    const value = startedPositions.reduce((total, position) => {
      const isClosed = position.soldAt
        && position.exitPrice !== undefined
        && position.soldAt.slice(0, 10) <= candleDate;
      const effectivePrice = isClosed && position.exitPrice !== undefined ? position.exitPrice : candle.close;
      return total + (effectivePrice - position.entryPrice) * position.shares;
    }, 0);
    points.push({ time: candle.time, value });
    return points;
  }, []);
}

export function buildPortfolioPerformanceSeries(snapshots: PositionPriceSnapshot[], positions: PositionLot[]) {
  if (!snapshots.length || !positions.length) return [];

  const sortedSnapshots = [...snapshots].sort((first, second) => first.time.localeCompare(second.time));
  const latestBySymbol = new Map<string, number>();
  const points: PositionPerformancePoint[] = [];

  for (const snapshot of sortedSnapshots) {
    latestBySymbol.set(snapshot.symbol, snapshot.price);
    const snapshotTime = new Date(snapshot.time).getTime();
    if (!Number.isFinite(snapshotTime)) continue;

    let hasAllRequiredPrices = true;
    const value = positions.reduce((total, position) => {
      const purchasedTime = new Date(position.purchasedAt).getTime();
      if (!Number.isFinite(purchasedTime) || snapshotTime < purchasedTime) return total;

      const soldTime = position.soldAt ? new Date(position.soldAt).getTime() : Number.POSITIVE_INFINITY;
      if (snapshotTime >= soldTime && position.exitPrice !== undefined) {
        return total + (position.exitPrice - position.entryPrice) * position.shares;
      }

      const price = latestBySymbol.get(position.symbol) ?? position.lastPrice;
      if (!Number.isFinite(price)) {
        hasAllRequiredPrices = false;
        return total;
      }
      return total + (price! - position.entryPrice) * position.shares;
    }, 0);

    if (hasAllRequiredPrices) points.push({ time: snapshot.time, value });
  }

  return points.filter((point, index) => index === 0 || point.time !== points[index - 1].time);
}

