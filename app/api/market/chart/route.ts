import { NextResponse } from "next/server";
import { getMarketDataErrorStatus, getTwelveDataChartBundle } from "./_server/twelve-data";

export async function GET(request: Request) {
  const symbol = new URL(request.url).searchParams.get("symbol") ?? "";
  const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1";

  try {
    const bundle = await getTwelveDataChartBundle(symbol, { forceRefresh });
    return NextResponse.json(bundle, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Marktdaten konnten nicht geladen werden.";
    const status = getMarketDataErrorStatus(error);
    return NextResponse.json({ error: message }, { status });
  }
}
