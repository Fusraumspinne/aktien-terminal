"use client";

import { indicatorDefinitions } from "./indicator-config";
import type { IndicatorGroup, IndicatorId, IndicatorSettings } from "./indicator-config";

export function ChartIndicatorSettings({ value, onChange }: { value: IndicatorSettings; onChange: (next: IndicatorSettings) => void }) {
  const toggle = (id: IndicatorId) => onChange({ ...value, [id]: !value[id] });
  const renderGroup = (group: IndicatorGroup, title: string) => (
    <div className="indicator-settings-group">
      <span className="indicator-settings-title">{title}</span>
      {indicatorDefinitions.filter((definition) => definition.group === group).map((definition) => (
        <button className="indicator-toggle-row" key={definition.id} type="button" onClick={() => toggle(definition.id)}>
          <span className="indicator-toggle-copy">
            <strong>{definition.label}</strong>
            <small>{definition.description}</small>
          </span>
          <span className={`indicator-switch${value[definition.id] ? " is-on" : ""}`} aria-hidden="true"><span /></span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="indicator-settings">
      <div className="indicator-settings-heading">
        <strong>Indikatoren</strong>
      </div>
      {renderGroup("overlay", "Im Chart")}
      {renderGroup("panel", "Unter dem Chart")}
    </div>
  );
}
