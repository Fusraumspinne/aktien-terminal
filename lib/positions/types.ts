export type PositionLot = {
  id: string;
  symbol: string;
  purchasedAt: string;
  shares: number;
  entryPrice: number;
  priceCandleTime?: string;
  priceResolution?: string;
  lastPrice?: number;
  lastPriceAt?: string;
  soldAt?: string;
  exitPrice?: number;
  exitPriceCandleTime?: string;
  exitPriceResolution?: string;
  exitPriceSource?: "market" | "manual-percent";
  manualProfitLossPercent?: number;
};

export type NewPositionLot = Omit<PositionLot, "id">;

export type PositionExit = {
  soldAt: string;
  exitPrice: number;
  exitPriceCandleTime: string;
  exitPriceResolution: string;
  exitPriceSource?: "market" | "manual-percent";
  manualProfitLossPercent?: number;
};

export type PositionViewMode = "ticker" | "all";

export type PositionPriceSnapshot = {
  symbol: string;
  price: number;
  time: string;
};

