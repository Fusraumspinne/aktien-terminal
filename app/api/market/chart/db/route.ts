import { NextResponse } from "next/server";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { MarketChartBundle } from "../../../../../lib/market/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const chartDataTtlMs = 60 * 60 * 1000;

type StoredChartBundle = {
  bundle: MarketChartBundle;
  fetchedAt: string;
};

type ChartRoutePayload = MarketChartBundle & {
  dataSource?: "database" | "provider";
  dataFetchedAt?: string;
  dataExpiresAt?: string;
};

class ChartDatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChartDatabaseError";
  }
}

class ChartApiRouteError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = "ChartApiRouteError";
  }
}

declare global {
  var marketdeskPrisma: PrismaClient | undefined;
  var marketdeskChartLoads: Map<string, Promise<StoredChartBundle>> | undefined;
}

function normalizeTicker(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL fehlt. Starte PostgreSQL über Docker Compose und hinterlege die Verbindung in .env.");
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

function getPrisma() {
  if (!globalThis.marketdeskPrisma) globalThis.marketdeskPrisma = createPrismaClient();
  return globalThis.marketdeskPrisma;
}

function isStoredChartBundleFresh(fetchedAt: string) {
  const fetchedAtTime = new Date(fetchedAt).getTime();
  return Number.isFinite(fetchedAtTime) && Date.now() - fetchedAtTime < chartDataTtlMs;
}

function chartBundleExpiresAt(fetchedAt: string) {
  return new Date(new Date(fetchedAt).getTime() + chartDataTtlMs).toISOString();
}

async function readChartBundle(symbol: string): Promise<StoredChartBundle | null> {
  try {
    const row = await getPrisma().chartData.findUnique({ where: { symbol } });
    if (!row) return null;
    return {
      bundle: row.payload as unknown as MarketChartBundle,
      fetchedAt: row.fetchedAt.toISOString(),
    };
  } catch {
    throw new ChartDatabaseError("Chart-Datenbank nicht erreichbar. Prüfe DATABASE_URL und führe die Prisma-Migration aus.");
  }
}

async function writeChartBundle(bundle: MarketChartBundle, fetchedAt = new Date().toISOString()) {
  const payload = bundle as unknown as Prisma.InputJsonValue;
  const fetchedAtDate = new Date(fetchedAt);
  try {
    await getPrisma().chartData.upsert({
      where: { symbol: bundle.symbol },
      create: {
        symbol: bundle.symbol,
        provider: "twelve-data",
        payload,
        fetchedAt: fetchedAtDate,
      },
      update: {
        provider: "twelve-data",
        payload,
        fetchedAt: fetchedAtDate,
      },
    });
  } catch {
    throw new ChartDatabaseError("Chartdaten konnten nicht in PostgreSQL gespeichert werden. Prüfe DATABASE_URL und die Prisma-Migration.");
  }
  return fetchedAt;
}

async function fetchFromApiRoute(request: Request, symbol: string) {
  const providerRequest = new Request(
    new URL(`/api/market/chart/api?symbol=${encodeURIComponent(symbol)}`, request.url),
    { method: "GET" },
  );
  const providerResponse = await (await import("../api/route")).GET(providerRequest);
  const payload = await providerResponse.json() as ChartRoutePayload | { error?: string };
  if (!providerResponse.ok) {
    throw new ChartApiRouteError(
      "error" in payload ? payload.error ?? "Marktdaten konnten nicht vom Provider geladen werden." : "Marktdaten konnten nicht vom Provider geladen werden.",
      providerResponse.status,
    );
  }
  return payload as ChartRoutePayload;
}

async function fetchAndStoreChart(request: Request, symbol: string): Promise<StoredChartBundle> {
  const providerPayload = await fetchFromApiRoute(request, symbol);
  const providerBundle = { ...providerPayload };
  delete providerBundle.dataSource;
  delete providerBundle.dataFetchedAt;
  delete providerBundle.dataExpiresAt;
  const bundle = providerBundle as MarketChartBundle;
  const fetchedAt = await writeChartBundle(bundle);
  return { bundle, fetchedAt };
}

function loadAndStoreChart(request: Request, symbol: string) {
  const loads = globalThis.marketdeskChartLoads ??= new Map<string, Promise<StoredChartBundle>>();
  const existingLoad = loads.get(symbol);
  if (existingLoad) return existingLoad;

  const load = fetchAndStoreChart(request, symbol);
  loads.set(symbol, load);
  void load.then(
    () => { if (loads.get(symbol) === load) loads.delete(symbol); },
    () => { if (loads.get(symbol) === load) loads.delete(symbol); },
  );
  return load;
}

function providerResponse(loaded: StoredChartBundle) {
  return NextResponse.json({
    ...loaded.bundle,
    dataSource: "provider",
    dataFetchedAt: loaded.fetchedAt,
    dataExpiresAt: chartBundleExpiresAt(loaded.fetchedAt),
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const symbol = normalizeTicker(searchParams.get("symbol") ?? "");
  const forceRefresh = searchParams.get("refresh") === "1";
  if (!symbol) return NextResponse.json({ error: "Bitte einen gültigen Ticker eingeben." }, { status: 400 });

  try {
    const existingLoad = globalThis.marketdeskChartLoads?.get(symbol);
    if (existingLoad) return providerResponse(await existingLoad);

    const stored = forceRefresh ? null : await readChartBundle(symbol);
    if (!forceRefresh && stored && isStoredChartBundleFresh(stored.fetchedAt)) {
      return NextResponse.json({
        ...stored.bundle,
        dataSource: "database",
        dataFetchedAt: stored.fetchedAt,
        dataExpiresAt: chartBundleExpiresAt(stored.fetchedAt),
      }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    return providerResponse(await loadAndStoreChart(request, symbol));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Marktdaten konnten nicht geladen werden.";
    const status = error instanceof ChartDatabaseError || message.includes("DATABASE_URL")
      ? 503
      : error instanceof ChartApiRouteError ? error.statusCode : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
