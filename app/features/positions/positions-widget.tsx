"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { Check, Plus, RotateCcw, Trash2, X } from "lucide-react";
import type { MarketChartBundle } from "../market/types";
import { calculatePositionSummary, findPositionEntry } from "./position-calculations";
import { PositionPerformanceChart } from "./position-performance-chart";
import type { NewPositionLot, PositionExit, PositionLot } from "./types";

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
  onAddPosition: (position: NewPositionLot) => void;
  onRemovePosition: (id: string) => void;
  onSellPosition: (id: string, exit: PositionExit) => void;
  onReopenPosition: (id: string) => void;
};

export function PositionsWidget({
  selectedSymbol,
  marketData,
  positions,
  onAddPosition,
  onRemovePosition,
  onSellPosition,
  onReopenPosition,
}: PositionsWidgetProps) {
  const latestAllowedTime = localDateTimeValue();
  const [purchasedAt, setPurchasedAt] = useState(latestAllowedTime);
  const [shares, setShares] = useState("");
  const [entryError, setEntryError] = useState<string | null>(null);
  const [sellingPositionId, setSellingPositionId] = useState<string | null>(null);
  const [soldAt, setSoldAt] = useState(latestAllowedTime);
  const [saleError, setSaleError] = useState<string | null>(null);

  const selectedPositions = useMemo(
    () => positions
      .filter((position) => position.symbol === selectedSymbol)
      .sort((first, second) => second.purchasedAt.localeCompare(first.purchasedAt)),
    [positions, selectedSymbol],
  );
  const currentPrice = marketData?.symbol === selectedSymbol ? marketData.lastPrice : null;
  const summary = calculatePositionSummary(selectedPositions, currentPrice);
  const totalProfitClass = summary.totalProfitLoss !== null && summary.totalProfitLoss < 0 ? "negative" : "positive";

  function submitPosition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedShares = Number(shares.replace(",", "."));

    if (!selectedSymbol || marketData?.symbol !== selectedSymbol) {
      setEntryError("Öffne zuerst einen Ticker mit verfügbaren Marktdaten.");
      return;
    }
    const purchaseTime = new Date(purchasedAt).getTime();
    if (!Number.isFinite(purchaseTime) || purchaseTime > Date.now()) {
      setEntryError("Bitte ein gültiges Kaufdatum mit Uhrzeit eingeben.");
      return;
    }
    if (!Number.isFinite(parsedShares) || parsedShares <= 0) {
      setEntryError("Die Anzahl der Anteile muss größer als null sein.");
      return;
    }
    const entry = findPositionEntry(marketData, purchasedAt);
    if (!entry) {
      setEntryError("Für diesen Zeitpunkt ist in den geladenen Chartdaten keine passende Kerze vorhanden.");
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
    if (!marketData || marketData.symbol !== selectedSymbol) {
      setSaleError("Für den Verkauf fehlen die Marktdaten des aktuellen Tickers.");
      return;
    }

    const saleTime = new Date(soldAt).getTime();
    const purchaseTime = new Date(position.purchasedAt).getTime();
    if (!Number.isFinite(saleTime) || saleTime > Date.now() || saleTime < purchaseTime) {
      setSaleError("Das Verkaufsdatum muss nach dem Kauf und darf nicht in der Zukunft liegen.");
      return;
    }
    const exit = findPositionEntry(marketData, soldAt);
    if (!exit) {
      setSaleError("Für diesen Verkaufszeitpunkt ist keine passende Kerze vorhanden.");
      return;
    }

    onSellPosition(position.id, {
      soldAt: new Date(soldAt).toISOString(),
      exitPrice: exit.entryPrice,
      exitPriceCandleTime: exit.priceCandleTime,
      exitPriceResolution: exit.priceResolution,
    });
    setSellingPositionId(null);
    setSaleError(null);
  }

  function openSaleForm(id: string) {
    setSellingPositionId(id);
    setSoldAt(localDateTimeValue());
    setSaleError(null);
  }

  return (
    <div className="positions-widget">
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

      {!selectedSymbol ? (
        <div className="position-empty">Öffne einen Ticker, um seine Positionen zu verwalten.</div>
      ) : !selectedPositions.length ? (
        <div className="position-empty">Für {selectedSymbol} ist noch keine Position eingetragen.</div>
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

          {marketData?.symbol === selectedSymbol ? (
            <PositionPerformanceChart
              candles={marketData.candlesByTimeframe.MAX}
              positions={selectedPositions}
              currentPrice={marketData.lastPrice}
              priceAsOf={marketData.priceAsOf}
            />
          ) : (
            <div className="position-chart-empty">Marktdaten werden geladen.</div>
          )}

          <section className="position-lots-section">
            <div className="position-lots-header">
              <div><h3>Käufe</h3></div>
            </div>
            <div className="position-lots">
              {selectedPositions.map((position) => {
                const closed = Boolean(position.soldAt && position.exitPrice !== undefined);
                const effectivePrice = closed ? position.exitPrice! : currentPrice;
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

                    {sellingPositionId === position.id ? (
                      <form className="position-sale-form" onSubmit={(event) => submitSale(event, position)}>
                        <label>
                          <span>Verkaufsdatum & Uhrzeit</span>
                          <input type="datetime-local" value={soldAt} min={toLocalDateTimeInput(position.purchasedAt)} max={latestAllowedTime} onChange={(event) => setSoldAt(event.target.value)} />
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
