export type IndicatorId =
  | "sma20"
  | "sma50"
  | "sma200"
  | "ema9"
  | "ema21"
  | "bollinger"
  | "donchian"
  | "vwap"
  | "rsi"
  | "macd"
  | "atr"
  | "momentum"
  | "stochastic"
  | "adx"
  | "volume"
  | "levels";

export type IndicatorSettings = Record<IndicatorId, boolean>;
export type IndicatorGroup = "overlay" | "panel";

export type IndicatorDefinition = {
  id: IndicatorId;
  label: string;
  description: string;
  group: IndicatorGroup;
};

export const defaultIndicatorSettings: IndicatorSettings = {
  sma20: false,
  sma50: false,
  sma200: false,
  ema9: false,
  ema21: false,
  bollinger: false,
  donchian: false,
  vwap: false,
  rsi: false,
  macd: false,
  atr: false,
  momentum: false,
  stochastic: false,
  adx: false,
  volume: false,
  levels: false,
};

export const indicatorDefinitions: IndicatorDefinition[] = [
  { id: "sma20", label: "SMA 20", description: "Einfacher gleitender Durchschnitt", group: "overlay" },
  { id: "sma50", label: "SMA 50", description: "Mittelfristiger Trend", group: "overlay" },
  { id: "sma200", label: "SMA 200", description: "Langfristiger Trend", group: "overlay" },
  { id: "ema9", label: "EMA 9", description: "Schneller exponentieller Durchschnitt", group: "overlay" },
  { id: "ema21", label: "EMA 21", description: "Exponentieller Trendfilter", group: "overlay" },
  { id: "bollinger", label: "Bollinger Bands", description: "SMA 20 mit zwei Standardabweichungen", group: "overlay" },
  { id: "donchian", label: "Donchian 20", description: "20-Kerzen-Kanal für Hochs und Tiefs", group: "overlay" },
  { id: "vwap", label: "VWAP", description: "Je Session; Free-Feed intraday indikativ", group: "overlay" },
  { id: "rsi", label: "RSI 14", description: "Relative Stärke zwischen 0 und 100", group: "panel" },
  { id: "macd", label: "MACD 12 / 26 / 9", description: "MACD, Signallinie und Histogramm", group: "panel" },
  { id: "atr", label: "ATR 14", description: "True Range mit Wilders Glättung", group: "panel" },
  { id: "momentum", label: "Momentum 10", description: "Abstand zum Schlusskurs vor 10 Kerzen", group: "panel" },
  { id: "stochastic", label: "Stochastic 14 / 3", description: "%K und geglättete %D-Linie", group: "panel" },
  { id: "adx", label: "ADX / DMI 14", description: "Trendstärke mit +DI und −DI", group: "panel" },
  { id: "volume", label: "Volume", description: "Intraday im Free-Feed nur Teilvolumen", group: "panel" },
  { id: "levels", label: "Support / Resistance", description: "Automatisch erkannte Preiszonen", group: "overlay" },
];

