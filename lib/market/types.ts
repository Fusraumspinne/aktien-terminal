export type Timeframe = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "MAX";

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartQuery {
  symbol: string;
  timeframe: Timeframe;
}

export interface ChartData {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  candles: Candle[];
  lastPrice: number;
  change: number;
  changePercent: number;
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
  candleResolutionByTimeframe?: Record<Timeframe, CandleResolution>;
  lastPrice: number;
  change: number;
  changePercent: number;
  priceAsOf?: string;
  priceMode?: "real-time" | "end-of-day" | "latest-aggregate";
  referenceCloseByTimeframe?: Partial<Record<Timeframe, number>>;
  timeframeErrors?: Partial<Record<Timeframe, string>>;
}

export interface MarketDataRepository {
  getChartData(query: ChartQuery): Promise<ChartData>;
}
