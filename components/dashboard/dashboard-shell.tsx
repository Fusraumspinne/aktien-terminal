"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, CandlestickChart, ChevronDown, Download, LayoutGrid, Plus, Upload } from "lucide-react";
import { getCompactor, ResponsiveGridLayout, useContainerWidth } from "react-grid-layout";
import type { Layout, ResponsiveLayouts } from "react-grid-layout";
import { ChartWidget } from "../chart/chart-widget";
import { defaultIndicatorSettings } from "../../lib/chart/indicator-config";
import type { IndicatorSettings } from "../../lib/chart/indicator-config";
import { ChartIndicatorSettings } from "../chart/indicator-settings";
import { LexiconModal } from "../lexicon/lexicon-modal";
import type { LexiconTab } from "../lexicon/lexicon-modal";
import { getMarketChartBundle } from "../../lib/market/client";
import type { MarketChartBundle } from "../../lib/market/types";
import { PositionSettings } from "../positions/position-settings";
import { PositionsWidget } from "../positions/positions-widget";
import type { NewPositionLot, PositionExit, PositionLot, PositionPriceSnapshot, PositionViewMode } from "../../lib/positions/types";
import { WatchlistWidget } from "../watchlist/watchlist-widget";
import type { WatchlistItem } from "../watchlist/watchlist-widget";
import { MarketDataToast } from "../ui/market-data-toast";
import type { MarketDataNotice } from "../ui/market-data-toast";
import { WidgetShell } from "./widget-shell";

type BreakpointKey = "lg" | "md" | "sm";
type WidgetId = "chart" | "watchlist" | "positions";

const breakpointKeys: BreakpointKey[] = ["lg", "md", "sm"];
const gridColumns: Record<BreakpointKey, number> = { lg: 12, md: 8, sm: 4 };
const widgetDefinitions: { id: WidgetId; label: string }[] = [
  { id: "chart", label: "Chart" },
  { id: "watchlist", label: "Watchlist" },
  { id: "positions", label: "Positionen" },
];
const workspaceStorageKey = "marketdesk.workspace.v2";
const positionsStorageKey = "marketdesk.positions.v1";
const positionSnapshotsStorageKey = "marketdesk.position-prices.v1";
const workspaceVersion = 4;

const initialLayouts: ResponsiveLayouts<BreakpointKey> = {
  lg: [],
  md: [],
  sm: [],
};

const boundedGridCompactor = getCompactor(null, false, true);
const initialWatchlist: WatchlistItem[] = [];
const initialPositions: PositionLot[] = [];

function normalizeTicker(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
}

const widgetLayoutDefaults: Record<WidgetId, Record<BreakpointKey, Layout[number]>> = {
  chart: {
    lg: { i: "chart", x: 0, y: 0, w: 9, h: 6, minW: 5, minH: 6, resizeHandles: ["n", "e", "s", "w"] },
    md: { i: "chart", x: 0, y: 0, w: 5, h: 6, minW: 4, minH: 6, resizeHandles: ["n", "e", "s", "w"] },
    sm: { i: "chart", x: 0, y: 0, w: 4, h: 6, minW: 3, minH: 6, resizeHandles: ["n", "e", "s", "w"] },
  },
  watchlist: {
    lg: { i: "watchlist", x: 0, y: 0, w: 3, h: 6, minW: 2, minH: 4, resizeHandles: ["n", "e", "s", "w"] },
    md: { i: "watchlist", x: 0, y: 0, w: 3, h: 6, minW: 2, minH: 4, resizeHandles: ["n", "e", "s", "w"] },
    sm: { i: "watchlist", x: 0, y: 0, w: 4, h: 6, minW: 3, minH: 4, resizeHandles: ["n", "e", "s", "w"] },
  },
  positions: {
    lg: { i: "positions", x: 0, y: 0, w: 6, h: 5, minW: 3, minH: 5, resizeHandles: ["n", "e", "s", "w"] },
    md: { i: "positions", x: 0, y: 0, w: 5, h: 5, minW: 3, minH: 5, resizeHandles: ["n", "e", "s", "w"] },
    sm: { i: "positions", x: 0, y: 0, w: 4, h: 5, minW: 3, minH: 5, resizeHandles: ["n", "e", "s", "w"] },
  },
};

function removeWidgetFromLayouts(currentLayouts: ResponsiveLayouts<BreakpointKey>, widgetId: WidgetId) {
  return breakpointKeys.reduce((nextLayouts, breakpoint) => {
    nextLayouts[breakpoint] = (currentLayouts[breakpoint] ?? []).filter((item) => item.i !== widgetId);
    return nextLayouts;
  }, {} as ResponsiveLayouts<BreakpointKey>);
}

function itemsOverlap(first: Layout[number], second: Layout[number]) {
  return first.x < second.x + second.w
    && first.x + first.w > second.x
    && first.y < second.y + second.h
    && first.y + first.h > second.y;
}

function findNextOpenPosition(layout: Layout, template: Layout[number], columns: number) {
  const maxExistingY = layout.reduce((highest, item) => Math.max(highest, item.y + item.h), 0);
  const maxX = Math.max(0, columns - template.w);

  for (let y = 0; y <= maxExistingY; y += 1) {
    for (let x = 0; x <= maxX; x += 1) {
      const candidate = { ...template, x, y };
      if (!layout.some((item) => itemsOverlap(candidate, item))) return candidate;
    }
  }

  return { ...template, x: 0, y: maxExistingY };
}

function addWidgetToLayouts(currentLayouts: ResponsiveLayouts<BreakpointKey>, widgetId: WidgetId) {
  return breakpointKeys.reduce((nextLayouts, breakpoint) => {
    const layout = currentLayouts[breakpoint] ?? [];
    nextLayouts[breakpoint] = layout.some((item) => item.i === widgetId)
      ? layout
      : [...layout, findNextOpenPosition(layout, widgetLayoutDefaults[widgetId][breakpoint], gridColumns[breakpoint])];
    return nextLayouts;
  }, {} as ResponsiveLayouts<BreakpointKey>);
}

function repairLegacyPositions(currentLayouts: ResponsiveLayouts<BreakpointKey>) {
  return breakpointKeys.reduce((nextLayouts, breakpoint) => {
    const repaired: Array<Layout[number]> = [];
    for (const item of currentLayouts[breakpoint] ?? []) {
      const widget = isWidgetId(item.i) ? item.i : null;
      const defaults = widget ? widgetLayoutDefaults[widget][breakpoint] : null;
      const normalized = defaults
        ? { ...item, minW: defaults.minW, minH: defaults.minH }
        : item;
      repaired.push(normalized.y >= 900
        ? findNextOpenPosition(repaired, normalized, gridColumns[breakpoint])
        : normalized);
    }
    nextLayouts[breakpoint] = repaired;
    return nextLayouts;
  }, {} as ResponsiveLayouts<BreakpointKey>);
}

function filterLayoutsToWidgets(currentLayouts: ResponsiveLayouts<BreakpointKey>, widgets: WidgetId[]) {
  return breakpointKeys.reduce((nextLayouts, breakpoint) => {
    nextLayouts[breakpoint] = (currentLayouts[breakpoint] ?? []).filter((item) => widgets.includes(item.i as WidgetId));
    return nextLayouts;
  }, {} as ResponsiveLayouts<BreakpointKey>);
}

function isWidgetId(value: unknown): value is WidgetId {
  return value === "chart" || value === "watchlist" || value === "positions";
}

function restoreIndicatorSettings(value: unknown): IndicatorSettings {
  const stored = value && typeof value === "object" ? value as Record<string, unknown> : {};

  return Object.keys(defaultIndicatorSettings).reduce((settings, indicatorId) => {
    const key = indicatorId as keyof IndicatorSettings;
    settings[key] = typeof stored[indicatorId] === "boolean"
      ? stored[indicatorId] as boolean
      : defaultIndicatorSettings[key];
    return settings;
  }, {} as IndicatorSettings);
}

function restorePositions(value: unknown): PositionLot[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const stored = item as Record<string, unknown>;
    const symbol = normalizeTicker(typeof stored.symbol === "string" ? stored.symbol : "");
    const purchasedAt = typeof stored.purchasedAt === "string" ? stored.purchasedAt : "";
    const shares = typeof stored.shares === "number" ? stored.shares : Number(stored.shares);
    const entryPrice = typeof stored.entryPrice === "number" ? stored.entryPrice : Number(stored.entryPrice);
    if (!symbol || !Number.isFinite(Date.parse(purchasedAt)) || !Number.isFinite(shares) || shares <= 0 || !Number.isFinite(entryPrice) || entryPrice <= 0) return [];

    const storedSoldAt = typeof stored.soldAt === "string" ? stored.soldAt : "";
    const storedExitPrice = typeof stored.exitPrice === "number" ? stored.exitPrice : Number(stored.exitPrice);
    const hasValidExit = Number.isFinite(Date.parse(storedSoldAt))
      && Number.isFinite(storedExitPrice)
      && storedExitPrice >= 0;

    return [{
      id: typeof stored.id === "string" && stored.id ? stored.id : `${symbol}-${purchasedAt}-${index}`,
      symbol,
      purchasedAt,
      shares,
      entryPrice,
      priceCandleTime: typeof stored.priceCandleTime === "string" ? stored.priceCandleTime : undefined,
      priceResolution: typeof stored.priceResolution === "string" ? stored.priceResolution : undefined,
      lastPrice: Number.isFinite(typeof stored.lastPrice === "number" ? stored.lastPrice : Number(stored.lastPrice))
        ? (typeof stored.lastPrice === "number" ? stored.lastPrice : Number(stored.lastPrice))
        : undefined,
      lastPriceAt: typeof stored.lastPriceAt === "string" && Number.isFinite(Date.parse(stored.lastPriceAt)) ? stored.lastPriceAt : undefined,
      soldAt: hasValidExit ? storedSoldAt : undefined,
      exitPrice: hasValidExit ? storedExitPrice : undefined,
      exitPriceCandleTime: hasValidExit && typeof stored.exitPriceCandleTime === "string" ? stored.exitPriceCandleTime : undefined,
      exitPriceResolution: hasValidExit && typeof stored.exitPriceResolution === "string" ? stored.exitPriceResolution : undefined,
      exitPriceSource: hasValidExit && stored.exitPriceSource === "manual-percent" ? "manual-percent" : "market",
      manualProfitLossPercent: hasValidExit && Number.isFinite(typeof stored.manualProfitLossPercent === "number" ? stored.manualProfitLossPercent : Number(stored.manualProfitLossPercent))
        ? (typeof stored.manualProfitLossPercent === "number" ? stored.manualProfitLossPercent : Number(stored.manualProfitLossPercent))
        : undefined,
    }];
  });
}

function restorePositionSnapshots(value: unknown): PositionPriceSnapshot[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const stored = item as Record<string, unknown>;
    const symbol = normalizeTicker(typeof stored.symbol === "string" ? stored.symbol : "");
    const price = typeof stored.price === "number" ? stored.price : Number(stored.price);
    const time = typeof stored.time === "string" ? stored.time : "";
    if (!symbol || !Number.isFinite(price) || price <= 0 || !Number.isFinite(Date.parse(time))) return [];
    return [{ symbol, price, time }];
  });
}

export function DashboardShell() {
  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1280 });
  const [layouts, setLayouts] = useState<ResponsiveLayouts<BreakpointKey>>(initialLayouts);
  const [editing, setEditing] = useState(false);
  const [symbol, setSymbol] = useState<string | null>(null);
  const [tickerInput, setTickerInput] = useState("");
  const [watchlist, setWatchlist] = useState(initialWatchlist);
  const [positions, setPositions] = useState(initialPositions);
  const [positionViewMode, setPositionViewMode] = useState<PositionViewMode>("ticker");
  const [positionSnapshots, setPositionSnapshots] = useState<PositionPriceSnapshot[]>([]);
  const [indicators, setIndicators] = useState<IndicatorSettings>(defaultIndicatorSettings);
  const [selectedMarketData, setSelectedMarketData] = useState<MarketChartBundle | null>(null);
  const [marketDataNotice, setMarketDataNotice] = useState<MarketDataNotice | null>(null);
  const [refreshingSymbol, setRefreshingSymbol] = useState<string | null>(null);
  const [visibleWidgets, setVisibleWidgets] = useState<WidgetId[]>([]);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [isWidgetMenuOpen, setIsWidgetMenuOpen] = useState(false);
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const [isLexiconOpen, setIsLexiconOpen] = useState(false);
  const [lexiconTab, setLexiconTab] = useState<LexiconTab>("indicators");
  const widgetMenuRef = useRef<HTMLDivElement>(null);
  const workspaceMenuRef = useRef<HTMLDivElement>(null);
  const workspaceFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isWidgetMenuOpen) return;

    function handleOutsidePointerDown(event: PointerEvent) {
      if (widgetMenuRef.current && !widgetMenuRef.current.contains(event.target as Node)) setIsWidgetMenuOpen(false);
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, [isWidgetMenuOpen]);

  useEffect(() => {
    if (!isWorkspaceMenuOpen) return;

    function handleOutsidePointerDown(event: PointerEvent) {
      if (workspaceMenuRef.current && !workspaceMenuRef.current.contains(event.target as Node)) setIsWorkspaceMenuOpen(false);
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, [isWorkspaceMenuOpen]);

  useEffect(() => {
    if (!isLexiconOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsLexiconOpen(false);
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isLexiconOpen]);

  useEffect(() => {
    if (!marketDataNotice) return;
    const timer = window.setTimeout(() => setMarketDataNotice(null), 3600);
    return () => window.clearTimeout(timer);
  }, [marketDataNotice]);

  const showErrorNotice = useCallback((message: string) => {
    setMarketDataNotice({
      id: Date.now(),
      source: "error",
      message,
    });
  }, []);

  function showWorkspaceNotice(message: string, source: "success" | "error") {
    setMarketDataNotice({
      id: Date.now(),
      source,
      message,
    });
  }

  function exportLocalStorage() {
    const storage: Record<string, string> = {};
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key) continue;
      const value = window.localStorage.getItem(key);
      if (value !== null) storage[key] = value;
    }

    const payload = {
      format: "marketdesk-localstorage",
      version: 1,
      exportedAt: new Date().toISOString(),
      storage,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `marketdesk-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setIsWorkspaceMenuOpen(false);
    showWorkspaceNotice("Workspace-Daten wurden exportiert.", "success");
  }

  async function importLocalStorage(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const rawStorage = parsed && typeof parsed === "object" && "storage" in parsed
        ? (parsed as { storage?: unknown }).storage
        : null;
      if (!rawStorage || typeof rawStorage !== "object" || Array.isArray(rawStorage)) {
        throw new Error("Die Datei enthält kein gültiges Marketdesk-Backup.");
      }

      const entries = Object.entries(rawStorage).filter(([, value]) => typeof value === "string") as [string, string][];
      if (!entries.length) throw new Error("Das Backup enthält keine gespeicherten Daten.");
      if (!window.confirm("Gespeicherte Marketdesk-Daten mit diesem Backup ersetzen?")) return;

      for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const key = window.localStorage.key(index);
        if (key?.startsWith("marketdesk.")) window.localStorage.removeItem(key);
      }
      entries.forEach(([key, value]) => window.localStorage.setItem(key, value));
      setIsWorkspaceMenuOpen(false);
      showWorkspaceNotice("Import erfolgreich. Workspace wird neu geladen.", "success");
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      showWorkspaceNotice(error instanceof Error ? error.message : "Das Backup konnte nicht importiert werden.", "error");
    }
  }

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      try {
        const storedWorkspace = window.localStorage.getItem(workspaceStorageKey);
        if (storedWorkspace) {
          const parsed = JSON.parse(storedWorkspace) as {
            version?: unknown;
            layouts?: ResponsiveLayouts<BreakpointKey>;
            visibleWidgets?: unknown;
            watchlist?: unknown;
            positions?: unknown;
            positionViewMode?: unknown;
            positionSnapshots?: unknown;
            indicators?: unknown;
          };
          const storedWidgets = Array.isArray(parsed.visibleWidgets)
            ? parsed.visibleWidgets.filter(isWidgetId)
            : null;
          const storedVersion = typeof parsed.version === "number" ? parsed.version : 0;
          const restoredWidgets = storedWidgets && storedVersion < workspaceVersion && !storedWidgets.includes("positions")
            ? [...storedWidgets, "positions" as const]
            : storedWidgets;
          if (parsed.layouts && restoredWidgets) {
            const filteredLayouts = repairLegacyPositions(filterLayoutsToWidgets(parsed.layouts, restoredWidgets));
            setLayouts(restoredWidgets.reduce(
              (nextLayouts, widgetId) => addWidgetToLayouts(nextLayouts, widgetId),
              filteredLayouts,
            ));
          }
          if (restoredWidgets) setVisibleWidgets(restoredWidgets);
          if (Array.isArray(parsed.watchlist)) {
            const restoredWatchlist = parsed.watchlist
              .filter((item): item is { symbol?: unknown; name?: unknown } => Boolean(item) && typeof item === "object")
              .map((item) => ({
                symbol: normalizeTicker(typeof item.symbol === "string" ? item.symbol : ""),
                name: typeof item.name === "string" ? item.name : "",
              }))
              .filter((item) => item.symbol);
            setWatchlist(restoredWatchlist);
          }
          const storedPositions = window.localStorage.getItem(positionsStorageKey);
          const restoredPositions = storedPositions ? restorePositions(JSON.parse(storedPositions)) : restorePositions(parsed.positions);
          setPositions(restoredPositions);
          const storedSnapshots = window.localStorage.getItem(positionSnapshotsStorageKey);
          setPositionSnapshots(storedSnapshots
            ? restorePositionSnapshots(JSON.parse(storedSnapshots))
            : restorePositionSnapshots(parsed.positionSnapshots));
          if (parsed.positionViewMode === "ticker" || parsed.positionViewMode === "all") {
            setPositionViewMode(parsed.positionViewMode);
          }
          if (parsed.indicators !== undefined) {
            setIndicators(restoreIndicatorSettings(parsed.indicators));
          }
        }
      } catch {
        window.localStorage.removeItem(workspaceStorageKey);
      } finally {
        setWorkspaceLoaded(true);
      }
    }, 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    if (!workspaceLoaded) return;
    window.localStorage.setItem(workspaceStorageKey, JSON.stringify({
      version: workspaceVersion,
      layouts,
      visibleWidgets,
      watchlist,
      positions,
      positionViewMode,
      positionSnapshots,
      indicators,
    }));
    window.localStorage.setItem(positionsStorageKey, JSON.stringify(positions));
    window.localStorage.setItem(positionSnapshotsStorageKey, JSON.stringify(positionSnapshots));
  }, [layouts, visibleWidgets, watchlist, positions, positionViewMode, positionSnapshots, indicators, workspaceLoaded]);

  const updateWatchlistMetadata = useCallback((bundle: MarketChartBundle) => {
    setWatchlist((items) => items.map((item) => item.symbol === bundle.symbol
      ? { ...item, name: bundle.name === bundle.symbol ? item.name : bundle.name }
      : item));
  }, []);

  const recordPositionMarketData = useCallback((bundle: MarketChartBundle) => {
    const snapshotTime = bundle.priceAsOf ?? new Date().toISOString();
    setPositions((items) => items.map((position) => position.symbol === bundle.symbol
      ? { ...position, lastPrice: bundle.lastPrice, lastPriceAt: snapshotTime }
      : position));
    setPositionSnapshots((items) => {
      // The daily MAX series is already part of the loaded bundle. Reusing a
      // bounded tail of it gives the overall view a real history after the
      // first ticker load, without requesting additional price data.
      const loadedHistory = (bundle.candlesByTimeframe.MAX ?? []).slice(-720).map((candle) => ({
        symbol: bundle.symbol,
        price: candle.close,
        time: candle.time,
      }));
      const next = [...items.filter((snapshot) => snapshot.symbol !== bundle.symbol), ...loadedHistory, {
        symbol: bundle.symbol,
        price: bundle.lastPrice,
        time: snapshotTime,
      }];
      const unique = next.filter((snapshot, index, all) => all.findIndex((candidate) => (
        candidate.symbol === snapshot.symbol && candidate.time === snapshot.time
      )) === index);
      return unique
        .sort((first, second) => first.time.localeCompare(second.time))
        .filter((snapshot, index, all) => {
          const symbolSnapshots = all.filter((candidate) => candidate.symbol === snapshot.symbol);
          return symbolSnapshots.indexOf(snapshot) >= Math.max(0, symbolSnapshots.length - 240);
        });
    });
  }, []);

  function showMarketDataNotice(bundle: MarketChartBundle) {
    const fromDatabase = bundle.dataSource === "database";
    setMarketDataNotice({
      id: Date.now(),
      source: fromDatabase ? "database" : "provider",
      dataFetchedAt: bundle.dataFetchedAt,
      message: fromDatabase
        ? `${bundle.symbol}: Alle Chartdaten aus der Datenbank geladen.`
        : `${bundle.symbol}: 1m-, 15m- und Tagesdaten neu von der API geladen und gespeichert.`,
    });
  }

  async function loadTicker(value: string) {
    const nextSymbol = normalizeTicker(value);
    if (!nextSymbol) {
      showErrorNotice("Bitte einen gültigen Ticker eingeben.");
      return;
    }

    setTickerInput(nextSymbol);

    try {
      const bundle = await getMarketChartBundle(nextSymbol);
      updateWatchlistMetadata(bundle);
      recordPositionMarketData(bundle);
      showMarketDataNotice(bundle);
      setSelectedMarketData(bundle);
      setSymbol(bundle.symbol);
    } catch (error) {
      showErrorNotice(error instanceof Error ? error.message : "Ticker konnte nicht geladen werden.");
    }
  }

  async function refreshTicker(symbolToRefresh: string) {
    setRefreshingSymbol(symbolToRefresh);
    try {
      const bundle = await getMarketChartBundle(symbolToRefresh, { forceRefresh: true });
      updateWatchlistMetadata(bundle);
      recordPositionMarketData(bundle);
      showMarketDataNotice(bundle);
      if (symbol === bundle.symbol) {
        setSelectedMarketData(bundle);
      }
    } catch (error) {
      showErrorNotice(error instanceof Error ? error.message : "Aktuelle Marktdaten konnten nicht geladen werden.");
    } finally {
      setRefreshingSymbol(null);
    }
  }

  function addTickerToWatchlist(value: string) {
    const nextSymbol = normalizeTicker(value);
    if (!nextSymbol) {
      showErrorNotice("Bitte einen gültigen Ticker eingeben.");
      return;
    }

    setTickerInput(nextSymbol);
    setWatchlist((items) => items.some((item) => item.symbol === nextSymbol)
      ? items
      : [...items, { symbol: nextSymbol, name: nextSymbol }]);
  }

  function submitTicker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadTicker(tickerInput);
  }

  function handleLayoutChange(_currentLayout: Layout, nextLayouts: ResponsiveLayouts<BreakpointKey>) {
    setLayouts(nextLayouts);
  }

  function removeWidget(widgetId: WidgetId) {
    setVisibleWidgets((widgets) => widgets.filter((id) => id !== widgetId));
    setLayouts((currentLayouts) => removeWidgetFromLayouts(currentLayouts, widgetId));
    setIsWidgetMenuOpen(false);
  }

  function addWidget(widgetId: WidgetId) {
    setVisibleWidgets((widgets) => widgets.includes(widgetId) ? widgets : [...widgets, widgetId]);
    setLayouts((currentLayouts) => addWidgetToLayouts(currentLayouts, widgetId));
    setIsWidgetMenuOpen(false);
  }

  function reorderWatchlist(sourceSymbol: string, targetSymbol: string) {
    if (sourceSymbol === targetSymbol) return;
    setWatchlist((items) => {
      const sourceIndex = items.findIndex((item) => item.symbol === sourceSymbol);
      const targetIndex = items.findIndex((item) => item.symbol === targetSymbol);
      if (sourceIndex < 0 || targetIndex < 0) return items;
      const nextItems = [...items];
      const [movedItem] = nextItems.splice(sourceIndex, 1);
      nextItems.splice(targetIndex, 0, movedItem);
      return nextItems;
    });
  }

  function addPosition(position: NewPositionLot) {
    const id = typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${position.symbol}-${position.purchasedAt}-${Date.now()}`;
    setPositions((items) => [...items, { ...position, id }]);
  }

  function sellPosition(id: string, exit: PositionExit) {
    setPositions((items) => items.map((position) => position.id === id
      ? { ...position, ...exit }
      : position));
  }

  function reopenPosition(id: string) {
    setPositions((items) => items.map((position) => position.id === id
      ? {
          ...position,
          soldAt: undefined,
          exitPrice: undefined,
          exitPriceCandleTime: undefined,
          exitPriceResolution: undefined,
        }
      : position));
  }

  return (
    <div className="terminal-app">
      <MarketDataToast notice={marketDataNotice} onDismiss={() => setMarketDataNotice(null)} />
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><CandlestickChart size={19} /></div>
          <span>market<span className="brand-accent">desk</span></span>
        </div>
        <div className="topbar-actions">
          <div className="widget-menu-wrap" ref={widgetMenuRef}>
            <button
              className="edit-button nav-edit-button"
              type="button"
              onClick={() => setIsWidgetMenuOpen((value) => !value)}
              aria-expanded={isWidgetMenuOpen}
              aria-haspopup="menu"
            >
              <Plus size={15} /> Fenster
            </button>
            {isWidgetMenuOpen ? (
              <div className="widget-menu" role="menu">
                {widgetDefinitions.filter(({ id }) => !visibleWidgets.includes(id)).map(({ id, label }) => (
                  <button key={id} type="button" role="menuitem" onClick={() => addWidget(id)}>
                    <Plus size={14} /> {label}
                  </button>
                ))}
                {!widgetDefinitions.some(({ id }) => !visibleWidgets.includes(id)) ? (
                  <span className="widget-menu-empty">Alle Fenster aktiv</span>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="widget-menu-wrap" ref={workspaceMenuRef}>
            <button
              className="edit-button nav-edit-button"
              type="button"
              onClick={() => {
                setIsWorkspaceMenuOpen((value) => !value);
                setIsWidgetMenuOpen(false);
              }}
              aria-expanded={isWorkspaceMenuOpen}
              aria-haspopup="menu"
            >
              <Download size={15} /> Daten <ChevronDown size={12} />
            </button>
            {isWorkspaceMenuOpen ? (
              <div className="widget-menu" role="menu">
                <button type="button" role="menuitem" onClick={exportLocalStorage}>
                  <Download size={14} /> Exportieren
                </button>
                <button type="button" role="menuitem" onClick={() => workspaceFileInputRef.current?.click()}>
                  <Upload size={14} /> Importieren
                </button>
              </div>
            ) : null}
            <input
              ref={workspaceFileInputRef}
              className="workspace-file-input"
              type="file"
              accept="application/json,.json"
              onChange={importLocalStorage}
              aria-label="Marketdesk-Backup importieren"
            />
          </div>
          <button className={`edit-button nav-edit-button${editing ? " active" : ""}`} type="button" onClick={() => setEditing((value) => !value)}>
            <LayoutGrid size={15} /> {editing ? "Fertig" : "Layout"}
          </button>
          <button className="edit-button nav-edit-button" type="button" onClick={() => setIsLexiconOpen(true)}>
            <BookOpen size={15} /> Lexikon
          </button>
        </div>
      </header>

      <main className="terminal-main" id="terminal">
        <div className={`dashboard-grid-wrap${editing ? " is-editing" : ""}`} ref={containerRef}>
          {mounted ? (
            <ResponsiveGridLayout
              width={width}
              layouts={layouts}
              breakpoints={{ lg: 1100, md: 700, sm: 0 }}
              cols={gridColumns}
              rowHeight={76}
              margin={{ lg: [16, 16], md: [16, 16], sm: [12, 12] }}
              containerPadding={[0, 0]}
              compactor={boundedGridCompactor}
              dragConfig={{ enabled: editing, handle: ".drag-handle", bounded: true, threshold: 3 }}
              resizeConfig={{ enabled: editing, handles: ["n", "e", "s", "w"] }}
              onLayoutChange={handleLayoutChange}
            >
              {visibleWidgets.includes("chart") ? <div key="chart">
                <WidgetShell
                  title="Chart"
                  editable={editing}
                  onRemove={() => removeWidget("chart")}
                  settings={<ChartIndicatorSettings value={indicators} onChange={setIndicators} />}
                >
                  <ChartWidget symbol={symbol} marketData={selectedMarketData} indicators={indicators} onError={showErrorNotice} />
                </WidgetShell>
              </div> : null}
              {visibleWidgets.includes("watchlist") ? <div key="watchlist">
                <WidgetShell title="Watchlist" editable={editing} onRemove={() => removeWidget("watchlist")}>
                  <WatchlistWidget
                    tickerInput={tickerInput}
                    selectedSymbol={symbol}
                    selectedDataFetchedAt={selectedMarketData?.dataFetchedAt}
                    onTickerChange={setTickerInput}
                    onSubmit={submitTicker}
                    onAddTicker={() => addTickerToWatchlist(tickerInput)}
                    onSelectTicker={(nextSymbol) => void loadTicker(nextSymbol)}
                    onRemoveTicker={(nextSymbol) => {
                      setWatchlist((items) => items.filter((item) => item.symbol !== nextSymbol));
                      if (symbol === nextSymbol) {
                        setSymbol(null);
                        setSelectedMarketData(null);
                        setTickerInput("");
                      }
                    }}
                    onRefreshTicker={(nextSymbol) => void refreshTicker(nextSymbol)}
                    refreshingSymbol={refreshingSymbol}
                    onReorder={reorderWatchlist}
                    stocks={watchlist}
                  />
                </WidgetShell>
              </div> : null}
              {visibleWidgets.includes("positions") ? <div key="positions">
                <WidgetShell
                  title="Positionen"
                  editable={editing}
                  onRemove={() => removeWidget("positions")}
                  settings={<PositionSettings value={positionViewMode} onChange={setPositionViewMode} />}
                >
                  <PositionsWidget
                    key={`${symbol ?? "no-symbol"}-${positionViewMode}`}
                    selectedSymbol={symbol}
                    marketData={selectedMarketData}
                    positions={positions}
                    viewMode={positionViewMode}
                    priceSnapshots={positionSnapshots}
                    onAddPosition={addPosition}
                    onRemovePosition={(id) => setPositions((items) => items.filter((position) => position.id !== id))}
                    onSellPosition={sellPosition}
                    onReopenPosition={reopenPosition}
                    onError={showErrorNotice}
                  />
                </WidgetShell>
              </div> : null}
            </ResponsiveGridLayout>
          ) : null}
        </div>
      </main>
      {isLexiconOpen ? (
        <LexiconModal
          activeTab={lexiconTab}
          onClose={() => setIsLexiconOpen(false)}
          onTabChange={setLexiconTab}
        />
      ) : null}
    </div>
  );
}
