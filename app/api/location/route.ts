import { geolocation } from "@vercel/edge";
import { getCurrencyInfoFromCountry } from "@/lib/location";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const { country } = geolocation(request);
  const { currency, symbol } = getCurrencyInfoFromCountry(country ?? null);

  return NextResponse.json({ country, currency, symbol });
}
