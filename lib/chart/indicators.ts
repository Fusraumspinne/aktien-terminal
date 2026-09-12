import type { Candle } from "../market/types";

export type IndicatorSeries = Array<number | null>;

export type PriceLevel = {
  price: number;
  zoneWidth: number;
  touches: number;
  type: "support" | "resistance";
  fromIndex: number;
};

export type CalculatedIndicators = {
  sma20: IndicatorSeries;
  sma50: IndicatorSeries;
  sma200: IndicatorSeries;
  ema9: IndicatorSeries;
  ema21: IndicatorSeries;
  bollingerUpper: IndicatorSeries;
  bollingerMiddle: IndicatorSeries;
  bollingerLower: IndicatorSeries;
  donchianUpper: IndicatorSeries;
  donchianMiddle: IndicatorSeries;
  donchianLower: IndicatorSeries;
  vwap: IndicatorSeries;
  rsi: IndicatorSeries;
  macd: IndicatorSeries;
  macdSignal: IndicatorSeries;
  macdHistogram: IndicatorSeries;
  atr: IndicatorSeries;
  momentum: IndicatorSeries;
  stochasticK: IndicatorSeries;
  stochasticD: IndicatorSeries;
  adx: IndicatorSeries;
  plusDi: IndicatorSeries;
  minusDi: IndicatorSeries;
  volume: IndicatorSeries;
  levels: PriceLevel[];
};

export function simpleMovingAverage(values: number[], period: number): IndicatorSeries {
  const result: IndicatorSeries = Array(values.length).fill(null);
  if (period <= 0) return result;
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index];
    if (index >= period) sum -= values[index - period];
    if (index >= period - 1) result[index] = sum / period;
  }
  return result;
}

export function exponentialMovingAverage(values: number[], period: number): IndicatorSeries {
  const result: IndicatorSeries = Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return result;
  let previous = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  result[period - 1] = previous;
  const multiplier = 2 / (period + 1);
  for (let index = period; index < values.length; index += 1) {
    previous += (values[index] - previous) * multiplier;
    result[index] = previous;
  }
  return result;
}

export function wilderMovingAverage(values: number[], period: number): IndicatorSeries {
  const result: IndicatorSeries = Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return result;
  let previous = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  result[period - 1] = previous;
  for (let index = period; index < values.length; index += 1) {
    previous = ((previous * (period - 1)) + values[index]) / period;
    result[index] = previous;
  }
  return result;
}

function exponentialMovingAverageNullable(values: IndicatorSeries, period: number): IndicatorSeries {
  const result: IndicatorSeries = Array(values.length).fill(null);
  const firstValueIndex = values.findIndex((value) => value !== null);
  if (firstValueIndex < 0) return result;
  const seedValues = values.slice(firstValueIndex, firstValueIndex + period);
  if (seedValues.length < period || seedValues.some((value) => value === null)) return result;
  let previous = seedValues.reduce<number>((sum, value) => sum + (value ?? 0), 0) / period;
  const seedIndex = firstValueIndex + period - 1;
  result[seedIndex] = previous;
  const multiplier = 2 / (period + 1);
  for (let index = seedIndex + 1; index < values.length; index += 1) {
    const value = values[index];
    if (value === null) continue;
    previous += (value - previous) * multiplier;
    result[index] = previous;
  }
  return result;
}

function simpleMovingAverageNullable(values: IndicatorSeries, period: number): IndicatorSeries {
  const result: IndicatorSeries = Array(values.length).fill(null);
  for (let index = period - 1; index < values.length; index += 1) {
    const window = values.slice(index - period + 1, index + 1);
    if (window.some((value) => value === null)) continue;
    result[index] = window.reduce<number>((sum, value) => sum + (value ?? 0), 0) / period;
  }
  return result;
}

function calculateRsi(closes: number[], period: number) {
  const result: IndicatorSeries = Array(closes.length).fill(null);
  if (closes.length <= period) return result;
  let averageGain = 0;
  let averageLoss = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = closes[index] - closes[index - 1];
    averageGain += Math.max(0, change);
    averageLoss += Math.max(0, -change);
  }
  averageGain /= period;
  averageLoss /= period;

  const rsiValue = () => {
    if (averageGain === 0 && averageLoss === 0) return 50;
    if (averageLoss === 0) return 100;
    if (averageGain === 0) return 0;
    return 100 - (100 / (1 + averageGain / averageLoss));
  };

  result[period] = rsiValue();
  for (let index = period + 1; index < closes.length; index += 1) {
    const change = closes[index] - closes[index - 1];
    averageGain = ((averageGain * (period - 1)) + Math.max(0, change)) / period;
    averageLoss = ((averageLoss * (period - 1)) + Math.max(0, -change)) / period;
    result[index] = rsiValue();
  }
  return result;
}

function calculateStochastic(candles: Candle[], period: number, signalPeriod: number) {
  const stochasticK: IndicatorSeries = Array(candles.length).fill(null);
  for (let index = period - 1; index < candles.length; index += 1) {
    const window = candles.slice(index - period + 1, index + 1);
    const highestHigh = Math.max(...window.map((candle) => candle.high));
    const lowestLow = Math.min(...window.map((candle) => candle.low));
    const range = highestHigh - lowestLow;
    stochasticK[index] = range === 0 ? 50 : ((candles[index].close - lowestLow) / range) * 100;
  }
  return { stochasticK, stochasticD: simpleMovingAverageNullable(stochasticK, signalPeriod) };
}

function calculateDirectionalMovement(candles: Candle[], period: number) {
  const adx: IndicatorSeries = Array(candles.length).fill(null);
  const plusDi: IndicatorSeries = Array(candles.length).fill(null);
  const minusDi: IndicatorSeries = Array(candles.length).fill(null);
  if (candles.length <= period) return { adx, plusDi, minusDi };

  const trueRanges = Array(candles.length).fill(0);
  const plusDm = Array(candles.length).fill(0);
  const minusDm = Array(candles.length).fill(0);
  for (let index = 1; index < candles.length; index += 1) {
    const current = candles[index];
    const previous = candles[index - 1];
    trueRanges[index] = Math.max(current.high - current.low, Math.abs(current.high - previous.close), Math.abs(current.low - previous.close));
    const upwardMove = current.high - previous.high;
    const downwardMove = previous.low - current.low;
    plusDm[index] = upwardMove > downwardMove && upwardMove > 0 ? upwardMove : 0;
    minusDm[index] = downwardMove > upwardMove && downwardMove > 0 ? downwardMove : 0;
  }

  let smoothedTr = trueRanges.slice(1, period + 1).reduce((sum, value) => sum + value, 0);
  let smoothedPlusDm = plusDm.slice(1, period + 1).reduce((sum, value) => sum + value, 0);
  let smoothedMinusDm = minusDm.slice(1, period + 1).reduce((sum, value) => sum + value, 0);
  const dx: IndicatorSeries = Array(candles.length).fill(null);

  const setDirectionalValues = (index: number) => {
    const positive = smoothedTr === 0 ? 0 : (smoothedPlusDm / smoothedTr) * 100;
    const negative = smoothedTr === 0 ? 0 : (smoothedMinusDm / smoothedTr) * 100;
    plusDi[index] = positive;
    minusDi[index] = negative;
    const sum = positive + negative;
    dx[index] = sum === 0 ? 0 : (Math.abs(positive - negative) / sum) * 100;
  };

  setDirectionalValues(period);
  for (let index = period + 1; index < candles.length; index += 1) {
    smoothedTr = smoothedTr - smoothedTr / period + trueRanges[index];
    smoothedPlusDm = smoothedPlusDm - smoothedPlusDm / period + plusDm[index];
    smoothedMinusDm = smoothedMinusDm - smoothedMinusDm / period + minusDm[index];
    setDirectionalValues(index);
  }

  const firstAdxIndex = period * 2 - 1;
  if (firstAdxIndex >= candles.length) return { adx, plusDi, minusDi };
  const seedDx = dx.slice(period, firstAdxIndex + 1);
  if (seedDx.some((value) => value === null)) return { adx, plusDi, minusDi };
  let previousAdx = seedDx.reduce<number>((sum, value) => sum + (value ?? 0), 0) / period;
  adx[firstAdxIndex] = previousAdx;
  for (let index = firstAdxIndex + 1; index < candles.length; index += 1) {
    const currentDx = dx[index];
    if (currentDx === null) continue;
    previousAdx = ((previousAdx * (period - 1)) + currentDx) / period;
    adx[index] = previousAdx;
  }
  return { adx, plusDi, minusDi };
}

function calculateDonchian(candles: Candle[], period: number) {
  const upper: IndicatorSeries = Array(candles.length).fill(null);
  const middle: IndicatorSeries = Array(candles.length).fill(null);
  const lower: IndicatorSeries = Array(candles.length).fill(null);
  for (let index = period - 1; index < candles.length; index += 1) {
    const window = candles.slice(index - period + 1, index + 1);
    const highest = Math.max(...window.map((candle) => candle.high));
    const lowest = Math.min(...window.map((candle) => candle.low));
    upper[index] = highest;
    lower[index] = lowest;
    middle[index] = (highest + lowest) / 2;
  }
  return { upper, middle, lower };
}

function calculateVwap(candles: Candle[], resetBySession: boolean) {
  let cumulativeVolume = 0;
  let cumulativePriceVolume = 0;
  let session = "";
  return candles.map((candle) => {
    const nextSession = candle.time.slice(0, 10);
    if (resetBySession && nextSession !== session) {
      cumulativeVolume = 0;
      cumulativePriceVolume = 0;
      session = nextSession;
    }
    cumulativeVolume += candle.volume;
    cumulativePriceVolume += ((candle.high + candle.low + candle.close) / 3) * candle.volume;
    return cumulativeVolume > 0 ? cumulativePriceVolume / cumulativeVolume : null;
  });
}

function detectPriceLevels(candles: Candle[], atr: IndicatorSeries): PriceLevel[] {
  if (candles.length < 20) return [];
  const currentPrice = candles[candles.length - 1].close;
  const latestAtr = [...atr].reverse().find((value): value is number => value !== null) ?? currentPrice * 0.01;
  const tolerance = Math.max(currentPrice * 0.0025, latestAtr * 0.4, 0.01);
  const pivotWindow = Math.max(3, Math.min(8, Math.round(candles.length / 120)));
  const candidates: { price: number; index: number }[] = [];

  for (let index = pivotWindow; index < candles.length - pivotWindow; index += 1) {
    const surrounding = [...candles.slice(index - pivotWindow, index), ...candles.slice(index + 1, index + pivotWindow + 1)];
    if (surrounding.every((neighbor) => candles[index].high >= neighbor.high)) candidates.push({ price: candles[index].high, index });
    if (surrounding.every((neighbor) => candles[index].low <= neighbor.low)) candidates.push({ price: candles[index].low, index });
  }

  const clusters: { weightedPrice: number; weight: number; touches: number; fromIndex: number; latestIndex: number }[] = [];
  candidates.sort((first, second) => first.index - second.index).forEach((candidate) => {
    const cluster = clusters.find((item) => Math.abs(item.weightedPrice / item.weight - candidate.price) <= tolerance);
    const recencyWeight = 1 + candidate.index / Math.max(1, candles.length - 1);
    if (!cluster) {
      clusters.push({ weightedPrice: candidate.price * recencyWeight, weight: recencyWeight, touches: 1, fromIndex: candidate.index, latestIndex: candidate.index });
      return;
    }
    if (candidate.index - cluster.latestIndex < pivotWindow) return;
    cluster.weightedPrice += candidate.price * recencyWeight;
    cluster.weight += recencyWeight;
    cluster.touches += 1;
    cluster.fromIndex = candidate.index;
    cluster.latestIndex = candidate.index;
  });

  return clusters
    .filter((cluster) => cluster.touches >= 2)
    .map((cluster) => {
      const price = cluster.weightedPrice / cluster.weight;
      const type = price <= currentPrice ? "support" as const : "resistance" as const;
      const distance = Math.abs(price - currentPrice) / Math.max(tolerance, currentPrice * 0.001);
      const recency = (candles.length - 1 - cluster.latestIndex) / candles.length;
      return { price, type, touches: cluster.touches, fromIndex: cluster.fromIndex, score: cluster.touches * 2 - distance * 0.15 - recency, zoneWidth: tolerance * 0.55 };
    })
    .sort((first, second) => second.score - first.score)
    .reduce<PriceLevel[]>((levels, level) => {
      if (levels.filter((item) => item.type === level.type).length >= 4) return levels;
      if (levels.some((item) => item.type === level.type && Math.abs(item.price - level.price) <= tolerance * 1.5)) return levels;
      levels.push({ price: level.price, type: level.type, touches: level.touches, fromIndex: level.fromIndex, zoneWidth: level.zoneWidth });
      return levels;
    }, []);
}

export function calculateIndicators(candles: Candle[], options?: { resetVwapBySession?: boolean }): CalculatedIndicators {
  const closes = candles.map((candle) => candle.close);
  const sma20 = simpleMovingAverage(closes, 20);
  const bollingerUpper: IndicatorSeries = Array(candles.length).fill(null);
  const bollingerLower: IndicatorSeries = Array(candles.length).fill(null);
  for (let index = 19; index < closes.length; index += 1) {
    const window = closes.slice(index - 19, index + 1);
    const average = sma20[index] ?? 0;
    const deviation = Math.sqrt(window.reduce((sum, value) => sum + (value - average) ** 2, 0) / window.length);
    bollingerUpper[index] = average + deviation * 2;
    bollingerLower[index] = average - deviation * 2;
  }

  const ema12 = exponentialMovingAverage(closes, 12);
  const ema26 = exponentialMovingAverage(closes, 26);
  const macd = closes.map((_close, index) => ema12[index] !== null && ema26[index] !== null ? ema12[index]! - ema26[index]! : null);
  const macdSignal = exponentialMovingAverageNullable(macd, 9);
  const macdHistogram = macd.map((value, index) => value !== null && macdSignal[index] !== null ? value - macdSignal[index]! : null);

  const trueRanges = candles.map((candle, index) => index === 0
    ? candle.high - candle.low
    : Math.max(candle.high - candle.low, Math.abs(candle.high - candles[index - 1].close), Math.abs(candle.low - candles[index - 1].close)));
  const atr = wilderMovingAverage(trueRanges, 14);
  const stochastic = calculateStochastic(candles, 14, 3);
  const directionalMovement = calculateDirectionalMovement(candles, 14);
  const donchian = calculateDonchian(candles, 20);

  return {
    sma20,
    sma50: simpleMovingAverage(closes, 50),
    sma200: simpleMovingAverage(closes, 200),
    ema9: exponentialMovingAverage(closes, 9),
    ema21: exponentialMovingAverage(closes, 21),
    bollingerUpper,
    bollingerMiddle: sma20,
    bollingerLower,
    donchianUpper: donchian.upper,
    donchianMiddle: donchian.middle,
    donchianLower: donchian.lower,
    vwap: calculateVwap(candles, options?.resetVwapBySession ?? false),
    rsi: calculateRsi(closes, 14),
    macd,
    macdSignal,
    macdHistogram,
    atr,
    momentum: candles.map((candle, index) => index >= 10 ? candle.close - candles[index - 10].close : null),
    stochasticK: stochastic.stochasticK,
    stochasticD: stochastic.stochasticD,
    adx: directionalMovement.adx,
    plusDi: directionalMovement.plusDi,
    minusDi: directionalMovement.minusDi,
    volume: candles.map((candle) => candle.volume),
    levels: detectPriceLevels(candles, atr),
  };
}

