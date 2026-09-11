"use client";

import type { FormEvent } from "react";
import { Search } from "lucide-react";

export function TickerSearch({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="ticker-search" onSubmit={onSubmit}>
      <Search size={16} />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value.toUpperCase())}
        aria-label="Ticker eingeben"
        placeholder="Ticker suchen"
        spellCheck={false}
      />
      <button type="submit">Anzeigen</button>
    </form>
  );
}
