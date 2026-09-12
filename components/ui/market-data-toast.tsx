"use client";

import { AlertCircle, CheckCircle2, CloudDownload, Database, X } from "lucide-react";
import { formatMarketDataTimestamp } from "../../lib/market/format";

export type MarketDataNotice = {
  id: number;
  source: "database" | "provider" | "success" | "error";
  message: string;
  dataFetchedAt?: string;
};

export function MarketDataToast({ notice, onDismiss }: { notice: MarketDataNotice | null; onDismiss: () => void }) {
  if (!notice) return null;
  const Icon = notice.source === "error"
    ? AlertCircle
    : notice.source === "success"
      ? CheckCircle2
      : notice.source === "database" ? Database : CloudDownload;

  return (
    <div key={notice.id} className={`market-data-toast ${notice.source}`} role={notice.source === "error" ? "alert" : "status"} aria-live="polite">
      <Icon size={15} />
      <div className="market-data-toast-content">
        <span>{notice.message}</span>
        {formatMarketDataTimestamp(notice.dataFetchedAt) ? (
          <small>Datenstand {formatMarketDataTimestamp(notice.dataFetchedAt)}</small>
        ) : null}
      </div>
      <button type="button" onClick={onDismiss} aria-label="Hinweis schließen"><X size={13} /></button>
      <div className="market-data-toast-progress" aria-hidden="true" />
    </div>
  );
}
