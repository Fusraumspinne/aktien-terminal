"use client";

import type { PositionViewMode } from "../../lib/positions/types";

export function PositionSettings({ value, onChange }: { value: PositionViewMode; onChange: (next: PositionViewMode) => void }) {
  return (
    <div className="position-settings">
      <div className="indicator-settings-heading">
        <strong>Positionsansicht</strong>
      </div>
      <div className="position-view-tabs" role="tablist" aria-label="Positionsansicht">
        <button className={value === "ticker" ? "active" : ""} type="button" role="tab" aria-selected={value === "ticker"} onClick={() => onChange("ticker")}>
          Ticker
        </button>
        <button className={value === "all" ? "active" : ""} type="button" role="tab" aria-selected={value === "all"} onClick={() => onChange("all")}>
          Alle Positionen
        </button>
      </div>
    </div>
  );
}

