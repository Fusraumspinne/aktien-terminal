"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { Check, Plus, RotateCcw, Trash2, X } from "lucide-react";
import type { MarketChartBundle } from "../../lib/market/types";
import { calculatePortfolioSummary, calculatePositionSummary, findPositionEntry } from "../../lib/positions/position-calculations";
import { PositionPerformanceChart } from "./position-performance-chart";
import type { NewPositionLot, PositionExit, PositionLot, PositionPriceSnapshot, PositionViewMode } from "../../lib/positions/types";

function localDateTimeValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

function toLocalDateTimeInput(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatNumber(value: number, maximumFractionDigits = 2) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits });
}

function formatMoney(value: number) {
  return `${value < 0 ? "−" : ""}$${formatNumber(Math.abs(value))}`;
}

function formatSignedMoney(value: number | null) {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : "−"}$${formatNumber(Math.abs(value))}`;
}

function formatSignedPercent(value: number | null) {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatPurchaseTime(value: string) {
  if (!value.includes("T")) return new Date(`${value}T00:00:00`).toLocaleDateString("de-DE");
  return new Date(value).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type PositionsWidgetProps = {
  selectedSymbol: string | null;
  marketData: MarketChartBundle | null;
  positions: PositionLot[];
  viewMode: PositionViewMode;
  priceSnapshots: PositionPriceSnapshot[];
  onAddPosition: (position: NewPositionLot) => void;
  onRemovePosition: (id: string) => void;
  onSellPosition: (id: string, exit: PositionExit) => void;
  onReopenPosition: (id: string) => void;
  onError?: (message: string) => void;
};

export function PositionsWidget({
  selectedSymbol,
  marketData,
  positions,
  viewMode,
  priceSnapshots,
  onAddPosition,
  onRemovePosition,
  onSellPosition,
  onReopenPosition,
  onError,
}: PositionsWidgetProps) {
  const latestAllowedTime = localDateTimeValue();
  const [purchasedAt, setPurchasedAt] = useState(latestAllowedTime);
  const [shares, setShares] = useState("");
  const [entryError, setEntryError] = useState<string | null>(null);
  const [sellingPositionId, setSellingPositionId] = useState<string | null>(null);
  const [soldAt, setSoldAt] = useState(latestAllowedTime);
  const [manualProfitLossPercent, setManualProfitLossPercent] = useState("");
  const [saleError, setSaleError] = useState<string | null>(null);

  const selectedPositions = useMemo(
    () => positions
      .filter((position) => position.symbol === selectedSymbol)
      .sort((first, second) => second.purchasedAt.localeCompare(first.purchasedAt)),
    [positions, selectedSymbol],
  );
  const currentPrice = marketData?.symbol === selectedSymbol
    ? marketData.lastPrice
    : selectedPositions.find((position) => position.lastPrice !== undefined)?.lastPrice ?? null;
  const latestPrices = useMemo(() => {
    const prices = positions.reduce<Record<string, number>>((result, position) => {
      if (position.lastPrice !== undefined) result[position.symbol] = position.lastPrice;
      return result;
    }, {});
    if (marketData?.symbol) prices[marketData.symbol] = marketData.lastPrice;
    return prices;
  }, [marketData, positions]);
  const visiblePositions = viewMode === "all"
    ? [...positions].sort((first, second) => first.symbol.localeCompare(second.symbol) || second.purchasedAt.localeCompare(first.purchasedAt))
    : selectedPositions;
  const summary = viewMode === "all"
    ? calculatePortfolioSummary(visiblePositions, latestPrices)
    : calculatePositionSummary(selectedPositions, currentPrice);
  const totalProfitClass = summary.totalProfitLoss !== null && summary.totalProfitLoss < 0 ? "negative" : "positive";

  function reportEntryError(message: string) {
    setEntryError(message);
    onError?.(message);
  }

  function reportSaleError(message: string) {
    setSaleError(message);
    onError?.(message);
  }

  function submitPosition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedShares = Number(shares.replace(",", "."));

    if (!selectedSymbol || marketData?.symbol !== selectedSymbol) {
      reportEntryError("Öffne zuerst einen Ticker mit verfügbaren Marktdaten.");
      return;
    }
    const purchaseTime = new Date(purchasedAt).getTime();
    if (!Number.isFinite(purchaseTime) || purchaseTime > Date.now()) {
      reportEntryError("Bitte ein gültiges Kaufdatum mit Uhrzeit eingeben.");
      return;
    }
    if (!Number.isFinite(parsedShares) || parsedShares <= 0) {
      reportEntryError("Die Anzahl der Anteile muss größer als null sein.");
      return;
    }
    const entry = findPositionEntry(marketData, purchasedAt);
    if (!entry) {
      reportEntryError("Für diesen Zeitpunkt ist in den geladenen Chartdaten keine passende Kerze vorhanden.");
      return;
    }

    onAddPosition({
      symbol: selectedSymbol,
      purchasedAt: new Date(purchasedAt).toISOString(),
      shares: parsedShares,
      ...entry,
    });
    setShares("");
    setEntryError(null);
  }

  function submitSale(event: FormEvent<HTMLFormElement>, position: PositionLot) {
    event.preventDefault();
    const saleTime = new Date(soldAt).getTime();
    const purchaseTime = new Date(position.purchasedAt).getTime();
    if (!Number.isFinite(saleTime) || saleTime > Date.now() || saleTime < purchaseTime) {
      reportSaleError("Das Verkaufsdatum muss nach dem Kauf und darf nicht in der Zukunft liegen.");
      return;
    }

    const parsedManualPercent = manualProfitLossPercent.trim()
      ? Number(manualProfitLossPercent.replace(",", "."))
      : null;
    if (parsedManualPercent !== null && (!Number.isFinite(parsedManualPercent) || parsedManualPercent < -100)) {
      reportSaleError("Der manuelle Prozentsatz muss eine gültige Zahl sein, zum Beispiel +12,5 oder -4.");
      return;
    }

    if (parsedManualPercent !== null) {
      onSellPosition(position.id, {
        soldAt: new Date(soldAt).toISOString(),
        exitPrice: position.entryPrice * (1 + parsedManualPercent / 100),
        exitPriceCandleTime: new Date(soldAt).toISOString(),
        exitPriceResolution: "manuell",
        exitPriceSource: "manual-percent",
        manualProfitLossPercent: parsedManualPercent,
      });
      setSellingPositionId(null);
      setManualProfitLossPercent("");
      setSaleError(null);
      return;
    }

    const exit = marketData?.symbol === position.symbol ? findPositionEntry(marketData, soldAt) : null;
    if (!exit) {
      reportSaleError("Für diesen Verkaufszeitpunkt ist keine passende Kerze geladen. Trage einen manuellen P/L-Prozentsatz ein.");
      return;
    }

    onSellPosition(position.id, {
      soldAt: new Date(soldAt).toISOString(),
      exitPrice: exit.entryPrice,
      exitPriceCandleTime: exit.priceCandleTime,
      exitPriceResolution: exit.priceResolution,
      exitPriceSource: "market",
    });
    setSellingPositionId(null);
    setManualProfitLossPercent("");
    setSaleError(null);
  }

  function openSaleForm(id: string) {
    setSellingPositionId(id);
    setSoldAt(localDateTimeValue());
    setManualProfitLossPercent("");
    setSaleError(null);
  }

  return (
    <div className="positions-widget">
      {viewMode === "ticker" ? (
        <section className="position-entry-card">
          <form className="position-form" onSubmit={submitPosition}>
            <div className="position-ticker-field">
              <span>Ticker</span>
              <strong className="position-current-symbol">{selectedSymbol ?? "Kein Ticker"}</strong>
            </div>
            <label>
              <span>Kaufdatum & Uhrzeit</span>
              <input type="datetime-local" value={purchasedAt} max={latestAllowedTime} onChange={(event) => setPurchasedAt(event.target.value)} disabled={!selectedSymbol} />
            </label>
            <label>
              <span>Anteile</span>
              <input inputMode="decimal" value={shares} onChange={(event) => setShares(event.target.value)} placeholder="10" disabled={!selectedSymbol} />
            </label>
            <button className="position-add" type="submit" disabled={!selectedSymbol} aria-label="Kauf hinzufügen" title="Kauf hinzufügen"><Plus size={14} /></button>
          </form>
          {entryError ? <p className="position-error">{entryError}</p> : null}
        </section>
      ) : null}

      {viewMode === "ticker" && !selectedSymbol ? (
        <div className="position-empty">Öffne einen Ticker, um seine Positionen zu verwalten.</div>
      ) : !visiblePositions.length ? (
        <div className="position-empty">{viewMode === "all" ? "Noch keine Positionen eingetragen." : `Für ${selectedSymbol} ist noch keine Position eingetragen.`}</div>
      ) : (
        <div className="position-content">
          <div className="position-summary">
            <div className={`position-summary-total ${totalProfitClass}`}>
              <span>Gesamt P/L</span>
              <div className="position-summary-value">
                <strong>{formatSignedMoney(summary.totalProfitLoss)}</strong>
                <small>{formatSignedPercent(summary.totalProfitLossPercent)}</small>
              </div>
            </div>
            <div><span>Offene Anteile</span><strong>{formatNumber(summary.openShares, 6)}</strong></div>
            <div><span>Ø Einstand</span><strong>{summary.openCount ? formatMoney(summary.averageOpenPrice) : "—"}</strong></div>
            <div><span>Marktwert</span><strong>{summary.marketValue === null ? "—" : formatMoney(summary.marketValue)}</strong></div>
            <div className={summary.realizedProfitLoss < 0 ? "negative" : "positive"}>
              <span>Realisiert</span><strong>{summary.closedCount ? formatSignedMoney(summary.realizedProfitLoss) : "—"}</strong>
            </div>
          </div>

          {viewMode === "all" ? (
            <PositionPerformanceChart snapshots={priceSnapshots} positions={visiblePositions} />
          ) : marketData?.symbol === selectedSymbol ? (
            <PositionPerformanceChart candles={marketData.candlesByTimeframe.MAX} positions={selectedPositions} currentPrice={marketData.lastPrice} priceAsOf={marketData.priceAsOf} />
          ) : (
            <div className="position-chart-empty">Marktdaten werden geladen.</div>
          )}

          <section className="position-lots-section">
            <div className="position-lots-header">
              <div><h3>{viewMode === "all" ? "Alle Positionen" : "Käufe"}</h3></div>
            </div>
            <div className="position-lots">
              {visiblePositions.map((position) => {
                const closed = Boolean(position.soldAt && position.exitPrice !== undefined);
                const effectivePrice = closed
                  ? position.exitPrice!
                  : viewMode === "ticker" && position.symbol === selectedSymbol
                    ? currentPrice
                    : latestPrices[position.symbol] ?? position.lastPrice ?? null;
                const lotProfitLoss = effectivePrice === null || effectivePrice === undefined
                  ? null
                  : (effectivePrice - position.entryPrice) * position.shares;
                const lotProfitPercent = lotProfitLoss === null
                  ? null
                  : lotProfitLoss / (position.entryPrice * position.shares) * 100;

                return (
                  <article className={`position-lot${closed ? " is-closed" : ""}`} key={position.id}>
                    <div className="position-lot-main">
                      <div className="position-lot-title">
                        <span className={`position-status ${closed ? "closed" : "open"}`}>{closed ? "Verkauft" : "Offen"}</span>
                        {viewMode === "all" ? <strong className="position-lot-symbol">{position.symbol}</strong> : null}
                        <strong>{formatPurchaseTime(position.purchasedAt)}</strong>
                      </div>
                      <span>{formatNumber(position.shares, 6)} Anteile · Einstand {formatMoney(position.entryPrice)}</span>
                      {closed ? (
                        <span>Verkauft {formatPurchaseTime(position.soldAt!)} · {formatMoney(position.exitPrice!)}</span>
                      ) : null}
                    </div>
                    <div className={`position-lot-result ${lotProfitLoss !== null && lotProfitLoss < 0 ? "negative" : "positive"}`}>
                      <strong>{formatSignedMoney(lotProfitLoss)}</strong>
                      <span>{formatSignedPercent(lotProfitPercent)}</span>
                    </div>
                    {viewMode === "ticker" ? (
                      <div className="position-lot-actions">
                        {closed ? (
                          <button className="position-action-button" type="button" onClick={() => onReopenPosition(position.id)} title="Verkauf zurücknehmen">
                            <RotateCcw size={13} /> Öffnen
                          </button>
                        ) : (
                          <button className="position-action-button sell" type="button" onClick={() => openSaleForm(position.id)}>
                            Verkaufen
                          </button>
                        )}
                        <button className="position-delete-button" type="button" onClick={() => onRemovePosition(position.id)} aria-label={`Kauf vom ${formatPurchaseTime(position.purchasedAt)} löschen`} title="Kauf löschen">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ) : null}

                    {sellingPositionId === position.id ? (
                      <form className="position-sale-form" onSubmit={(event) => submitSale(event, position)}>
                        <label>
                          <span>Verkaufsdatum & Uhrzeit</span>
                          <input type="datetime-local" value={soldAt} min={toLocalDateTimeInput(position.purchasedAt)} max={latestAllowedTime} onChange={(event) => setSoldAt(event.target.value)} />
                        </label>
                        <label className="position-sale-percent-field">
                          <span>P/L % manuell</span>
                          <input
                            inputMode="decimal"
                            value={manualProfitLossPercent}
                            onChange={(event) => setManualProfitLossPercent(event.target.value)}
                            placeholder="überschreibt Kurs"
                            aria-label="Manueller Gewinn- oder Verlustprozentsatz; überschreibt den automatisch ermittelten Kurs"
                          />
                        </label>
                        <button className="position-sale-confirm" type="submit"><Check size={13} /> Bestätigen</button>
                        <button className="position-sale-cancel" type="button" onClick={() => {
                          setSellingPositionId(null);
                          setSaleError(null);
                        }}><X size={13} /> Abbrechen</button>
                        {saleError ? <p className="position-error">{saleError}</p> : null}
                      </form>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

