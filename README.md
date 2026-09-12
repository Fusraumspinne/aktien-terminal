# Marketdesk

Ein personalisierbares Aktien-Terminal auf Basis von Next.js, Twelve Data, Prisma und PostgreSQL. API-Keys und Datenbankzugriffe bleiben ausschließlich auf dem Server.

## Datenfluss

Der Browser fragt nur `GET /api/market/chart/db` an. Dieser Endpunkt prüft zuerst PostgreSQL:

- Daten jünger als eine Stunde werden direkt aus `chart_data` geliefert.
- Fehlende oder mindestens eine Stunde alte Daten werden über Twelve Data neu geladen und anschließend per Upsert gespeichert.
- `refresh=1` erzwingt einen Provider-Abruf und ersetzt den gespeicherten Datensatz.
- `GET /api/market/chart/api` ist der getrennte Twelve-Data-Endpunkt. Die DB-Route ruft ihn bei fehlenden oder veralteten Daten intern auf, speichert die Antwort und gibt sie an den Browser zurück.

Ein Ticker-Datensatz enthält das vollständige Chart-Bundle mit Quote, 1-Minuten-, 15-Minuten- und Tages/MAX-Daten. Die weiteren Kerzenauflösungen werden weiterhin ohne zusätzliche API-Aufrufe in der App berechnet. Im Browser existiert kein Chartdaten-Cache mehr.

## Konfiguration

Kopiere die Beispielwerte und trage deinen Twelve-Data-Key ein:

```bash
cp .env.example .env
```

Für die lokale Entwicklung läuft nur PostgreSQL in Docker:

```bash
npm run db:up
npm run db:migrate
npm run dev
```

Öffne anschließend [http://localhost:3000](http://localhost:3000).

Für bestehende Umgebungen werden bereits erzeugte Prisma-Migrationen so angewendet:

```bash
npm run db:deploy
```

Docker Compose startet bewusst nur PostgreSQL 16. Die einzige Tabelle `chart_data` wird über die Prisma-Migration in `prisma/migrations` angelegt und kann über `npm run db:studio` angesehen werden.
