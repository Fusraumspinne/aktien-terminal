"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, CandlestickChart, GripVertical, LayoutGrid, Plus, RefreshCw, X } from "lucide-react";
import { getCompactor, ResponsiveGridLayout, useContainerWidth } from "react-grid-layout";
import type { Layout, ResponsiveLayouts } from "react-grid-layout";
import { ChartIndicatorSettings, ChartWidget, TickerSearch, defaultIndicatorSettings } from "../../features/chart/chart-widget";
import type { IndicatorSettings } from "../../features/chart/chart-widget";
import { getMarketChartBundle } from "../../../lib/market/client-repository";
import type { MarketChartBundle } from "../../../lib/market/types";
import { WidgetShell } from "./widget-shell";

type BreakpointKey = "lg" | "md" | "sm";
type WidgetId = "chart" | "watchlist";
type LexiconTab = "indicators";

const breakpointKeys: BreakpointKey[] = ["lg", "md", "sm"];
const gridColumns: Record<BreakpointKey, number> = { lg: 12, md: 8, sm: 4 };
const widgetDefinitions: { id: WidgetId; label: string }[] = [
  { id: "chart", label: "Chart" },
  { id: "watchlist", label: "Watchlist" },
];
const workspaceStorageKey = "marketdesk.workspace.v2";

const initialLayouts: ResponsiveLayouts<BreakpointKey> = {
  lg: [
    { i: "chart", x: 0, y: 0, w: 9, h: 6, minW: 6, minH: 4, resizeHandles: ["n", "e", "s", "w"] },
    { i: "watchlist", x: 9, y: 0, w: 3, h: 6, minW: 3, minH: 4, resizeHandles: ["n", "e", "s", "w"] },
  ],
  md: [
    { i: "chart", x: 0, y: 0, w: 5, h: 6, minW: 5, minH: 4, resizeHandles: ["n", "e", "s", "w"] },
    { i: "watchlist", x: 5, y: 0, w: 3, h: 6, minW: 3, minH: 4, resizeHandles: ["n", "e", "s", "w"] },
  ],
  sm: [
    { i: "chart", x: 0, y: 0, w: 4, h: 6, minW: 4, minH: 4, resizeHandles: ["n", "e", "s", "w"] },
    { i: "watchlist", x: 0, y: 6, w: 4, h: 6, minW: 4, minH: 4, resizeHandles: ["n", "e", "s", "w"] },
  ],
};

const boundedGridCompactor = getCompactor(null, false, true);
type WatchlistItem = {
  symbol: string;
  name: string;
};

const initialWatchlist: WatchlistItem[] = [];

function normalizeTicker(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
}

const widgetLayoutDefaults: Record<WidgetId, Record<BreakpointKey, Layout[number]>> = {
  chart: {
    lg: { i: "chart", x: 0, y: 0, w: 9, h: 6, minW: 6, minH: 4, resizeHandles: ["n", "e", "s", "w"] },
    md: { i: "chart", x: 0, y: 0, w: 5, h: 6, minW: 5, minH: 4, resizeHandles: ["n", "e", "s", "w"] },
    sm: { i: "chart", x: 0, y: 0, w: 4, h: 6, minW: 4, minH: 4, resizeHandles: ["n", "e", "s", "w"] },
  },
  watchlist: {
    lg: { i: "watchlist", x: 0, y: 0, w: 3, h: 6, minW: 3, minH: 4, resizeHandles: ["n", "e", "s", "w"] },
    md: { i: "watchlist", x: 0, y: 0, w: 3, h: 6, minW: 3, minH: 4, resizeHandles: ["n", "e", "s", "w"] },
    sm: { i: "watchlist", x: 0, y: 0, w: 4, h: 6, minW: 4, minH: 4, resizeHandles: ["n", "e", "s", "w"] },
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
      repaired.push(item.y >= 900
        ? findNextOpenPosition(repaired, item, gridColumns[breakpoint])
        : item);
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
  return value === "chart" || value === "watchlist";
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

export function DashboardShell() {
  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1280 });
  const [layouts, setLayouts] = useState<ResponsiveLayouts<BreakpointKey>>(initialLayouts);
  const [editing, setEditing] = useState(false);
  const [symbol, setSymbol] = useState<string | null>(null);
  const [tickerInput, setTickerInput] = useState("");
  const [watchlist, setWatchlist] = useState(initialWatchlist);
  const [indicators, setIndicators] = useState<IndicatorSettings>(defaultIndicatorSettings);
  const [chartRefreshKey, setChartRefreshKey] = useState(0);
  const [refreshingSymbol, setRefreshingSymbol] = useState<string | null>(null);
  const [tickerError, setTickerError] = useState<string | null>(null);
  const [visibleWidgets, setVisibleWidgets] = useState<WidgetId[]>(["chart", "watchlist"]);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [isWidgetMenuOpen, setIsWidgetMenuOpen] = useState(false);
  const [isLexiconOpen, setIsLexiconOpen] = useState(false);
  const [lexiconTab, setLexiconTab] = useState<LexiconTab>("indicators");
  const widgetMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isWidgetMenuOpen) return;

    function handleOutsidePointerDown(event: PointerEvent) {
      if (widgetMenuRef.current && !widgetMenuRef.current.contains(event.target as Node)) setIsWidgetMenuOpen(false);
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, [isWidgetMenuOpen]);

  useEffect(() => {
    if (!isLexiconOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsLexiconOpen(false);
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isLexiconOpen]);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      try {
        const storedWorkspace = window.localStorage.getItem(workspaceStorageKey);
        if (storedWorkspace) {
          const parsed = JSON.parse(storedWorkspace) as {
            layouts?: ResponsiveLayouts<BreakpointKey>;
            visibleWidgets?: unknown;
            watchlist?: unknown;
            indicators?: unknown;
          };
          const restoredWidgets = Array.isArray(parsed.visibleWidgets)
            ? parsed.visibleWidgets.filter(isWidgetId)
            : null;
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
    window.localStorage.setItem(workspaceStorageKey, JSON.stringify({ layouts, visibleWidgets, watchlist, indicators }));
  }, [layouts, visibleWidgets, watchlist, indicators, workspaceLoaded]);

  const handleBundleLoaded = useCallback((bundle: MarketChartBundle) => {
    setWatchlist((items) => items.map((item) => item.symbol === bundle.symbol
      ? { ...item, name: bundle.name === bundle.symbol ? item.name : bundle.name }
      : item));
  }, []);

  async function loadTicker(value: string) {
    const nextSymbol = normalizeTicker(value);
    if (!nextSymbol) {
      setTickerError("Bitte einen gültigen Ticker eingeben.");
      return;
    }

    setTickerInput(nextSymbol);
    setTickerError(null);

    try {
      const bundle = await getMarketChartBundle(nextSymbol);
      handleBundleLoaded(bundle);
      setSymbol(bundle.symbol);
    } catch (error) {
      setTickerError(error instanceof Error ? error.message : "Ticker konnte nicht geladen werden.");
    }
  }

  async function refreshTicker(symbolToRefresh: string) {
    setRefreshingSymbol(symbolToRefresh);
    setTickerError(null);
    try {
      const bundle = await getMarketChartBundle(symbolToRefresh, { forceRefresh: true });
      handleBundleLoaded(bundle);
      if (symbol === bundle.symbol) setChartRefreshKey((value) => value + 1);
    } catch (error) {
      setTickerError(error instanceof Error ? error.message : "Aktuelle Marktdaten konnten nicht geladen werden.");
    } finally {
      setRefreshingSymbol(null);
    }
  }

  function addTickerToWatchlist(value: string) {
    const nextSymbol = normalizeTicker(value);
    if (!nextSymbol) {
      setTickerError("Bitte einen gültigen Ticker eingeben.");
      return;
    }

    setTickerInput(nextSymbol);
    setTickerError(null);
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

  return (
    <div className="terminal-app">
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
                  <ChartWidget symbol={symbol} onDataLoaded={handleBundleLoaded} indicators={indicators} refreshKey={chartRefreshKey} />
                </WidgetShell>
              </div> : null}
              {visibleWidgets.includes("watchlist") ? <div key="watchlist">
                <WidgetShell title="Watchlist" editable={editing} onRemove={() => removeWidget("watchlist")}>
                  <WatchlistWidget
                    tickerInput={tickerInput}
                    onTickerChange={setTickerInput}
                    onSubmit={submitTicker}
                    onAddTicker={() => addTickerToWatchlist(tickerInput)}
                    onSelectTicker={(nextSymbol) => void loadTicker(nextSymbol)}
                    onRemoveTicker={(nextSymbol) => {
                      setWatchlist((items) => items.filter((item) => item.symbol !== nextSymbol));
                      if (symbol === nextSymbol) {
                        setSymbol(null);
                        setTickerInput("");
                        setTickerError(null);
                      }
                    }}
                    onRefreshTicker={(nextSymbol) => void refreshTicker(nextSymbol)}
                    refreshingSymbol={refreshingSymbol}
                    onReorder={reorderWatchlist}
                    stocks={watchlist}
                    error={tickerError}
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

const lexiconTabs: { id: LexiconTab; label: string }[] = [
  { id: "indicators", label: "Indikatoren" },
];

const indicatorLexiconEntries = [
  {
    name: "SMA",
    formula: "Summe der Schlusskurse ÷ Perioden",
    description: "Der Simple Moving Average glättet Kursschwankungen und zeigt den durchschnittlichen Preis über einen festen Zeitraum.",
    interpretation: "Steigende SMA 20 oder SMA 50 deuten auf einen zunehmenden kurzfristigen beziehungsweise mittelfristigen Trend hin. Kreuzungen können als Trendwechsel beobachtet werden.",
    warning: "Ein SMA reagiert verzögert. In schnellen Märkten kann das Signal bereits überholt sein.",
  },
  {
    name: "EMA",
    formula: "Aktueller Kurs stärker gewichtet als ältere Kurse",
    description: "Der Exponential Moving Average reagiert schneller auf neue Kursbewegungen als ein SMA.",
    interpretation: "EMA 9 und EMA 21 werden oft genutzt, um kurzfristige Trendrichtung und dynamische Unterstützungen oder Widerstände zu beobachten.",
    warning: "Die höhere Geschwindigkeit erzeugt auch mehr Fehlsignale und Whipsaws in Seitwärtsphasen.",
  },
  {
    name: "Bollinger Bands",
    formula: "SMA 20 ± 2 Standardabweichungen",
    description: "Die Bänder zeigen, wie stark sich der Kurs um seinen gleitenden Durchschnitt verteilt.",
    interpretation: "Ein enges Band weist auf niedrige Volatilität hin. Eine Aufweitung zeigt zunehmende Bewegung. Ein Kontakt mit dem Band ist allein noch kein Kauf- oder Verkaufssignal.",
    warning: "Kurse können in starken Trends längere Zeit am äußeren Band entlanglaufen.",
  },
  {
    name: "Donchian Channels 20",
    formula: "Oberes Band = höchstes Hoch; unteres Band = tiefstes Tief der letzten 20 Kerzen",
    description: "Der Donchian-Kanal bildet die Handelsspanne der vergangenen 20 Kerzen samt Mittellinie ab.",
    interpretation: "Neue Hochs oder Tiefs außerhalb des vorherigen Kanals können Breakouts markieren. Die Kanalbreite zeigt zugleich, wie weit die aktuelle Handelsspanne ist.",
    warning: "Ein Kanal-Ausbruch kann scheitern. Bestätigung durch Schlusskurs, Marktumfeld und gegebenenfalls Volumen bleibt wichtig.",
  },
  {
    name: "RSI 14",
    formula: "100 − 100 ÷ (1 + durchschnittlicher Gewinn ÷ Verlust)",
    description: "Der Relative Strength Index misst die Stärke und Geschwindigkeit der Kursbewegungen auf einer Skala von 0 bis 100.",
    interpretation: "Werte über 70 gelten häufig als überkauft, Werte unter 30 als überverkauft. In starken Trends kann der RSI lange in diesen Bereichen bleiben.",
    warning: "Überkauft bedeutet nicht automatisch fallend und überverkauft nicht automatisch steigend.",
  },
  {
    name: "MACD",
    formula: "EMA 12 − EMA 26; Signal = EMA 9; Histogramm = MACD − Signal",
    description: "Der MACD vergleicht zwei exponentielle Durchschnitte und zeigt MACD-Linie, Signallinie und deren Abstand als Histogramm.",
    interpretation: "Kreuzungen von MACD und Signallinie sowie die Nulllinie können Hinweise auf steigendes oder fallendes Momentum geben.",
    warning: "Der MACD ist ein nachlaufender Indikator und in Seitwärtsmärkten besonders anfällig für Fehlsignale.",
  },
  {
    name: "ATR 14",
    formula: "True Range über 14 Perioden mit Wilders Glättung",
    description: "Die Average True Range misst die typische Handelsspanne und damit die absolute Volatilität eines Titels.",
    interpretation: "Ein steigender ATR zeigt größere Bewegungen. Er kann helfen, Stop-Abstände oder Positionsgrößen an die aktuelle Volatilität anzupassen.",
    warning: "Der ATR zeigt keine Richtung und ist nicht direkt zwischen unterschiedlich teuren Aktien vergleichbar.",
  },
  {
    name: "VWAP",
    formula: "Kumuliertes typisches Preisvolumen ÷ kumuliertes Volumen",
    description: "Der Volume Weighted Average Price gewichtet den Preis nach dem gehandelten Volumen.",
    interpretation: "Kurse über dem VWAP werden häufig als intraday stärker und Kurse darunter als schwächer eingeordnet.",
    warning: "Intraday wird der VWAP zu jeder regulären Handelssitzung zurückgesetzt. Der kostenlose Realtime-Feed enthält nur einen Teil des US-Handelsvolumens; der Intraday-VWAP ist deshalb indikativ. Bei Tageskerzen beginnt er am ersten geladenen Datenpunkt.",
  },
  {
    name: "Stochastic 14 / 3",
    formula: "%K = 100 × (Close − Tief 14) ÷ (Hoch 14 − Tief 14); %D = SMA 3 von %K",
    description: "Der Stochastic Oscillator zeigt, wo der Schlusskurs innerhalb der Handelsspanne der letzten 14 Kerzen liegt.",
    interpretation: "Bereiche über 80 und unter 20 markieren starkes beziehungsweise schwaches Range-Momentum. Kreuzungen von %K und %D liefern zusätzlichen Kontext.",
    warning: "In starken Trends kann der Oszillator lange extrem bleiben. Ein hoher oder niedriger Wert ist allein kein Umkehrsignal.",
  },
  {
    name: "ADX / DMI 14",
    formula: "+DI und −DI aus Directional Movement und True Range; ADX = geglätteter DX",
    description: "DMI zeigt die stärkere Bewegungsrichtung, während ADX unabhängig von der Richtung die Trendstärke misst.",
    interpretation: "Ein steigender ADX über etwa 25 wird oft als stärkerer Trend eingeordnet. +DI über −DI spricht für positive, −DI über +DI für negative Richtungsstärke.",
    warning: "ADX zeigt nicht die Trendrichtung und reagiert verzögert. Schwellen wie 20 oder 25 sind Richtwerte, keine festen Handelssignale.",
  },
  {
    name: "Momentum 10",
    formula: "Aktueller Schlusskurs − Schlusskurs vor 10 Perioden",
    description: "Momentum zeigt die absolute Veränderung gegenüber einem früheren Schlusskurs.",
    interpretation: "Positive Werte zeigen, dass der Kurs über dem Vergleichswert liegt. Steigendes Momentum kann eine Bewegung bestätigen.",
    warning: "Das Ergebnis hängt stark von der gewählten Periode und dem Kursniveau der Aktie ab.",
  },
  {
    name: "Volume",
    formula: "Gehandeltes Volumen je Kerze",
    description: "Das Volumen zeigt, wie viele Stücke während einer Kerze gehandelt wurden.",
    interpretation: "Hohe Volumenspitzen können Ausbrüche, Nachrichten oder Kapitulation begleiten. Bewegungen mit höherem Volumen gelten oft als besser bestätigt.",
    warning: "Volumen allein erklärt nicht, ob Käufer oder Verkäufer dominieren. Intraday bildet der kostenlose Realtime-Feed nur einen Teil des US-Gesamtvolumens ab; historische Tagesdaten sind belastbarer.",
  },
  {
    name: "Support / Resistance",
    formula: "Gebündelte Swing-Hochs und Swing-Tiefs",
    description: "Der Indikator markiert Preisbereiche, an denen der Kurs in der geladenen Historie wiederholt gedreht oder reagiert hat.",
    interpretation: "Support-Zonen liegen typischerweise unter dem aktuellen Kurs und können als Nachfragebereich wirken. Resistance-Zonen liegen darüber und können als Angebotsbereich wirken.",
    warning: "Zonen sind Bereiche, keine exakten Linien. Pivot-Zonen benötigen nachfolgende Kerzen zur Bestätigung und können sich mit neuen Daten verändern. Ausbrüche sollten zusätzlich geprüft werden.",
  },
];

const fundamentalsLexiconEntries = [
  ["P/E", "Kurs-Gewinn-Verhältnis", "Setzt den Aktienkurs ins Verhältnis zum Gewinn je Aktie. Ein niedriger Wert ist nicht automatisch günstig; Wachstum und Geschäftsqualität müssen mitbetrachtet werden."],
  ["Forward P/E", "Erwartetes KGV", "Verwendet erwartete Gewinne. Die Prognosen können sich ändern und sollten mit dem tatsächlichen Gewinnwachstum verglichen werden."],
  ["Free Cashflow", "Freier Cashflow", "Zeigt, wie viel Cash nach notwendigen Investitionen verbleibt und für Schuldenabbau, Rückkäufe oder Dividenden verfügbar ist."],
  ["ROE", "Eigenkapitalrendite", "Setzt den Gewinn ins Verhältnis zum Eigenkapital. Hohe Werte sollten immer zusammen mit der Verschuldung geprüft werden."],
];

const macroLexiconEntries = [
  ["VIX", "Erwartete Volatilität", "Der VIX leitet die erwartete Schwankungsbreite des S&P 500 aus Optionspreisen ab. Steigende Werte begleiten häufig Marktstress."],
  ["Yield Curve", "Zinskurve", "Vergleicht kurzfristige und langfristige Renditen. Eine inverse Kurve kann auf schwächere Wachstumserwartungen hindeuten."],
  ["DXY", "US-Dollar-Index", "Misst die Entwicklung des US-Dollars gegenüber einem Währungskorb und beeinflusst internationale Umsätze sowie Rohstoffpreise."],
  ["Inflation", "Preissteigerungsrate", "Beeinflusst Kaufkraft, Margen, Zinsen und Bewertungsmultiplikatoren. Richtung und Tempo sind besonders wichtig."],
];

const tradingLexiconEntries = [
  ["Entry", "Einstieg", "Der geplante Preisbereich für die Eröffnung einer Position. Ein Entry braucht eine klare These und ein definiertes Risiko."],
  ["Target", "Kursziel", "Das Preisniveau, an dem Gewinne teilweise oder vollständig realisiert werden sollen."],
  ["Stop / Invalidation", "Ungültigkeit der These", "Der Punkt, an dem die ursprüngliche Annahme nicht mehr gilt. Dieser Punkt sollte vor dem Trade feststehen."],
  ["Risk/Reward", "Chance-Risiko-Verhältnis", "Vergleicht den möglichen Gewinn mit dem geplanten Verlust und hilft bei der Positionsplanung."],
];

function LexiconModal({
  activeTab,
  onClose,
  onTabChange,
}: {
  activeTab: LexiconTab;
  onClose: () => void;
  onTabChange: (tab: LexiconTab) => void;
}) {
  return (
    <div className="lexicon-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="lexicon-modal" role="dialog" aria-modal="true" aria-labelledby="lexicon-title">
        <header className="lexicon-header">
          <div>
            <h2 id="lexicon-title">Lexikon</h2>
          </div>
          <button className="lexicon-close" type="button" onClick={onClose} aria-label="Lexikon schließen" title="Schließen">
            <X size={18} />
          </button>
        </header>
        <nav className="lexicon-tabs" aria-label="Lexikon-Bereiche">
          {lexiconTabs.map((tab) => (
            <button className={activeTab === tab.id ? "active" : ""} key={tab.id} type="button" onClick={() => onTabChange(tab.id)}>
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="lexicon-body">
          {activeTab === "indicators" ? (
            <>
              <div className="lexicon-section-intro">
                <span className="lexicon-section-label">CHART-INDIKATOREN</span>
                <h3>Signale einordnen, nicht blind folgen</h3>
                <p>Indikatoren verdichten Kurs- und Volumendaten. Sie sind Werkzeuge für Kontext und Szenarien — keine eigenständigen Kauf- oder Verkaufssignale.</p>
              </div>
              <div className="lexicon-indicator-grid">
                {indicatorLexiconEntries.map((entry) => (
                  <article className="lexicon-card" key={entry.name}>
                    <header>
                      <div>
                        <h4>{entry.name}</h4>
                      </div>
                    </header>
                    <p>{entry.description}</p>
                    <dl>
                      <div><dt>Berechnung</dt><dd>{entry.formula}</dd></div>
                      <div><dt>Interpretation</dt><dd>{entry.interpretation}</dd></div>
                      <div><dt>Beachten</dt><dd>{entry.warning}</dd></div>
                    </dl>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <LexiconReferenceSection
              title={lexiconTabs.find((tab) => tab.id === activeTab)?.label ?? "Lexikon"}
              entries={activeTab === "fundamentals" ? fundamentalsLexiconEntries : activeTab === "macro" ? macroLexiconEntries : tradingLexiconEntries}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function LexiconReferenceSection({ title, entries }: { title: string; entries: string[][] }) {
  return (
    <div className="lexicon-reference-section">
      <div className="lexicon-section-intro">
        <span className="lexicon-section-label">MARKTGRUNDLAGEN</span>
        <h3>{title} verständlich erklärt</h3>
        <p>Kurze Einordnung für den ersten Überblick. Die Inhalte werden später um Beispiele, historische Vergleiche und kontextuelle Erklärungen erweitert.</p>
      </div>
      <div className="lexicon-reference-grid">
        {entries.map(([term, subtitle, explanation]) => (
          <article className="lexicon-reference-card" key={term}>
            <span>{term}</span>
            <h4>{subtitle}</h4>
            <p>{explanation}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function WatchlistWidget({
  tickerInput,
  onTickerChange,
  onSubmit,
  onAddTicker,
  onSelectTicker,
  onRemoveTicker,
  onRefreshTicker,
  refreshingSymbol,
  onReorder,
  stocks,
  error,
}: {
  tickerInput: string;
  onTickerChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onAddTicker: () => void;
  onSelectTicker: (symbol: string) => void;
  onRemoveTicker: (symbol: string) => void;
  onRefreshTicker: (symbol: string) => void;
  refreshingSymbol: string | null;
  onReorder: (sourceSymbol: string, targetSymbol: string) => void;
  stocks: WatchlistItem[];
  error: string | null;
}) {
  const [draggedSymbol, setDraggedSymbol] = useState<string | null>(null);

  return (
    <div className="compact-widget">
      <div className="watchlist-search-row">
        <TickerSearch value={tickerInput} onChange={onTickerChange} onSubmit={onSubmit} />
        <button className="watchlist-add" type="button" onClick={onAddTicker} title="Ticker zur Watchlist hinzufügen">
          <Plus size={14} />
          <span>Add</span>
        </button>
      </div>
      {error ? <p className="watchlist-error">{error}</p> : null}
      <div className="watchlist-rows">
        {stocks.map((stock) => (
          <div
            className="watchlist-row"
            key={stock.symbol}
            draggable
            role="button"
            tabIndex={0}
            onClick={() => onSelectTicker(stock.symbol)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") onSelectTicker(stock.symbol);
            }}
            onDragStart={() => setDraggedSymbol(stock.symbol)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (draggedSymbol) onReorder(draggedSymbol, stock.symbol);
              setDraggedSymbol(null);
            }}
            onDragEnd={() => setDraggedSymbol(null)}
          >
            <div className="watchlist-row-leading">
              <span className="watchlist-drag-grip" aria-hidden="true"><GripVertical size={14} /></span>
              <div className="mini-symbol"><span className="mini-symbol-icon">{stock.symbol.slice(0, 1)}</span><div><strong>{stock.symbol}</strong></div></div>
            </div>
            <div className="watchlist-row-actions">
              <button
                className="watchlist-refresh"
                type="button"
                aria-label={`${stock.symbol} aktualisieren`}
                title="Aktuelle Marktdaten laden"
                disabled={refreshingSymbol === stock.symbol}
                onClick={(event) => {
                  event.stopPropagation();
                  onRefreshTicker(stock.symbol);
                }}
              >
                <RefreshCw className={refreshingSymbol === stock.symbol ? "spin" : ""} size={14} />
              </button>
              <button
                className="watchlist-remove"
                type="button"
                aria-label={`${stock.symbol} aus Watchlist entfernen`}
                title="Aus Watchlist entfernen"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemoveTicker(stock.symbol);
                }}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
