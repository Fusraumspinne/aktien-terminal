# Marketdesk

Ein personalisierbares Aktien-Terminal auf Basis von Next.js. Die aktuelle Datenebene verwendet Twelve Data und hält den API-Key ausschließlich auf dem Server.

## Marktdaten

Lege den Twelve-Data-Key in `.env` oder `.env.local` ab:

```bash
TWELVE_API_KEY=dein_key
```

Pro erstmals geladenem Ticker werden vier Twelve-Data-Credits verwendet: Quote, 1-Minuten-, 15-Minuten- und Tagesdaten. Die App berechnet daraus die benötigten 5-Minuten- und Stundenkerzen. Ergebnisse werden im Browser und im Serverprozess fünf Minuten zwischengespeichert; der Aktualisieren-Button umgeht beide Caches.

Beim Zoomen auf der Zeitachse passt der Chart die Kerzenauflösung ausschließlich im Browser an: schmale Kerzen werden zu größeren OHLCV-Gruppen zusammengefasst, breite Gruppen wieder bis zur feinsten bereits geladenen API-Auflösung aufgeteilt.

## Entwicklung

```bash
npm install
npm run dev
```

Öffne anschließend [http://localhost:3000](http://localhost:3000).
