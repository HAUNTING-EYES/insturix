import { geolocation } from "@vercel/edge";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const { country } = geolocation(request);

  let currency: string;
  let symbol: string;

  switch (country) {
    case "IN":
      currency = "INR";
      symbol = "₹";
      break;
    case "GB":
      currency = "GBP";
      symbol = "£";
      break;
    case "US":
      currency = "USD";
      symbol = "$";
      break;
    default:
      currency = "USD";
      symbol = "$";
  }

  return NextResponse.json({ country, currency, symbol });
}
