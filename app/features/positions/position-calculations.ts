import type { Candle, CandleResolution, MarketChartBundle, Timeframe } from "../market/types";
import type { PositionLot } from "./types";

export type PositionPerformancePoint = {
  time: string;
  value: number;
};

export type PositionEntryMatch = {
  entryPrice: number;
  priceCandleTime: string;
  priceResolution: string;
};

const priceSourceTimeframes: Timeframe[] = ["1D", "1W", "1M", "3M", "6M", "1Y", "MAX"];

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

  const sources = priceSourceTimeframes
    .map((timeframe) => ({
      timeframe,
      candles: bundle.candlesByTimeframe[timeframe] ?? [],
      resolution: bundle.candleResolutionByTimeframe?.[timeframe],
    }))
    .filter((source): source is typeof source & { resolution: CandleResolution } => Boolean(source.resolution))
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
    const candle = [...source.candles].reverse().find((candidate) => {
      const candleTime = new Date(candidate.time).getTime();
      return candidate.time.slice(0, 10) === utcDate
        && candleTime <= targetTime
        && targetTime - candleTime < intervalMs;
    });
    if (candle) {
      return {
        entryPrice: candle.close,
        priceCandleTime: candle.time,
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
