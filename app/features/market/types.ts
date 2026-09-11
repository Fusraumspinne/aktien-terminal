export type Timeframe = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "MAX";

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type CandlesByTimeframe = Record<Timeframe, Candle[]>;

export interface CandleResolution {
  unit: "minute" | "day";
  value: number;
  defaultAggregationFactor: number;
  maxAggregationFactor?: number;
}

export interface MarketChartBundle {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  candlesByTimeframe: CandlesByTimeframe;
  indicatorSourceCandles?: {
    minute?: Candle[];
    fifteenMinute?: Candle[];
    daily?: Candle[];
  };
  candleResolutionByTimeframe?: Record<Timeframe, CandleResolution>;
  lastPrice: number;
  change: number;
  changePercent: number;
  priceAsOf?: string;
  priceMode?: "real-time" | "end-of-day" | "latest-aggregate";
  referenceCloseByTimeframe?: Partial<Record<Timeframe, number>>;
  timeframeErrors?: Partial<Record<Timeframe, string>>;
}
