export function getCurrencyInfoFromCountry(country: string | null): { currency: string; symbol: string } {
  switch (country) {
    case "GB":
      return { currency: "GBP", symbol: "£" };
    case "US":
      return { currency: "USD", symbol: "$" };
    case "CA":
      return { currency: "CAD", symbol: "C$" };
    case "AU":
      return { currency: "AUD", symbol: "A$" };
    case "SG":
      return { currency: "SGD", symbol: "S$" };
    case "AE": // UAE
      return { currency: "AED", symbol: "د.إ" };
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
      return { currency: "EUR", symbol: "€" };
    default:
      return { currency: "USD", symbol: "$" };
  }
}