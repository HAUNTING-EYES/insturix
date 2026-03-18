import axios from "axios";


export interface LocationData {
  currency: string;
  symbol: string;
}

const LOCATION_FALLBACK: LocationData = { currency: 'USD', symbol: '$' };

export const fetchLocationData = async (): Promise<LocationData> => {
  const controller = new AbortController();
  // 3-second timeout — if /api/location hangs, fall back to USD instead of
  // blocking the entire DashboardProviders chain indefinitely.
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const { data } = await axios.get<LocationData>("/api/location", {
      signal: controller.signal,
    });
    return data;
  } catch {
    return LOCATION_FALLBACK;
  } finally {
    clearTimeout(timeout);
  }
};

// React Query Keys
export const QueryKeys = {
  location: ["location"],
} as const;
