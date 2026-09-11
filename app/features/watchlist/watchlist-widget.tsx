"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { GripVertical, Plus, RefreshCw, X } from "lucide-react";
import { TickerSearch } from "../chart/ticker-search";

export type WatchlistItem = {
  symbol: string;
  name: string;
};

export function WatchlistWidget({
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

