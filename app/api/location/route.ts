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
    case "DE": // Germany
    case "FR": // France
    case "ES": // Spain
    case "IT": // Italy
    case "NL": // Netherlands
    case "BE": // Belgium
    case "LU": // Luxembourg
    case "IE": // Ireland
    case "PT": // Portugal
    case "GR": // Greece
    case "FI": // Finland
    case "AT": // Austria
    case "CY": // Cyprus
    case "EE": // Estonia
    case "LV": // Latvia
    case "LT": // Lithuania
    case "MT": // Malta
    case "SK": // Slovakia
    case "SI": // Slovenia
      currency = "EUR";
      symbol = "€";
      break;
    default:
      currency = "USD";
      symbol = "$";
  }

  return NextResponse.json({ country, currency, symbol });
}
