import { geolocation } from "@vercel/edge";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const { country } = geolocation(request);

  let currency: string;
  let symbol: string;

  switch (country) {
    case "GB":
      currency = "GBP";
      symbol = "£";
      break;
    case "US":
      currency = "USD";
      symbol = "$";
      break;
    case "CA":
      currency = "CAD";
      symbol = "C$";
      break;
    case "AU":
      currency = "AUD";
      symbol = "A$";
      break;
    case "SG":
      currency = "SGD";
      symbol = "S$";
      break;
    case "AE": // UAE
      currency = "AED";
      symbol = "د.إ";
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
