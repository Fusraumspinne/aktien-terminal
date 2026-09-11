"use client";

import { X } from "lucide-react";

export type LexiconTab = "indicators";

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

export function LexiconModal({
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
        </div>
      </section>
    </div>
  );
}
