"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { GripVertical, Settings2, X } from "lucide-react";

interface WidgetShellProps {
  title: string;
  editable: boolean;
  onRemove?: () => void;
  settings?: ReactNode;
  children: ReactNode;
}

export function WidgetShell({ title, editable, onRemove, settings, children }: WidgetShellProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!settingsOpen) return;

    function handleOutsidePointerDown(event: PointerEvent) {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) setSettingsOpen(false);
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, [settingsOpen]);

  return (
    <section className="widget-shell">
      <header className="widget-header">
        <div className="widget-heading">
          {editable ? (
            <button className="drag-handle" type="button" aria-label={`${title} verschieben`} title="Widget verschieben">
              <GripVertical size={16} strokeWidth={2.1} />
            </button>
          ) : null}
          <h2>{title}</h2>
        </div>
        <div className="widget-header-actions">
          <div className="widget-settings-wrap" ref={settingsRef}>
            <button
              className={`widget-settings${settingsOpen ? " active" : ""}`}
              type="button"
              onClick={() => setSettingsOpen((value) => !value)}
              aria-expanded={settingsOpen}
              aria-label={`${title} Einstellungen`}
              title="Fenster-Einstellungen"
            >
              <Settings2 size={15} />
            </button>
            {settingsOpen ? (
              <div className="widget-settings-popover">
                {settings ?? <span className="widget-settings-empty">Keine weiteren Einstellungen verfügbar.</span>}
              </div>
            ) : null}
          </div>
          {editable && onRemove ? (
            <button className="widget-remove" type="button" onClick={onRemove} aria-label={`${title} entfernen`} title="Fenster entfernen">
              <X size={15} />
            </button>
          ) : null}
        </div>
      </header>
      <div className="widget-content">{children}</div>
    </section>
  );
}
