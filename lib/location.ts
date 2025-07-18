export function getCurrencyInfoFromCountry(country: string | null): { currency: string; symbol: string } {
  switch (country) {
    case "US": return { currency: "USD", symbol: "$" };
    case "IN": return { currency: "INR", symbol: "₹" };
    case "EUR":
    case "DE": case "FR": case "ES": case "IT": case "NL": case "BE": case "LU":
    case "IE": case "PT": case "GR": case "FI": case "AT": case "CY": case "EE":
    case "LV": case "LT": case "MT": case "SK": case "SI":
      return { currency: "EUR", symbol: "€" };
    case "GBP": case "GB": return { currency: "GBP", symbol: "£" };
    case "CAD": case "CA": return { currency: "CAD", symbol: "C$" };
    case "AUD": case "AU": return { currency: "AUD", symbol: "A$" };
    case "SGD": case "SG": return { currency: "SGD", symbol: "S$" };
    case "AED": case "AE": return { currency: "AED", symbol: "د.إ" };
    default:
      return { currency: "USD", symbol: "$" };
  }
}