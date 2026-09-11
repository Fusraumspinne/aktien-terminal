export type PositionLot = {
  id: string;
  symbol: string;
  purchasedAt: string;
  shares: number;
  entryPrice: number;
  priceCandleTime?: string;
  priceResolution?: string;
  soldAt?: string;
  exitPrice?: number;
  exitPriceCandleTime?: string;
  exitPriceResolution?: string;
};

export type NewPositionLot = Omit<PositionLot, "id">;

export type PositionExit = {
  soldAt: string;
  exitPrice: number;
  exitPriceCandleTime: string;
  exitPriceResolution: string;
};
