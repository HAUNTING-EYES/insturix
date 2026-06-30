'use client';

import { useLocation } from '@/lib/LocationProvider';

export const LOCAL_TREND_MARKET = '__local';
export const GLOBAL_TREND_MARKET = '__global';

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States',
  IN: 'India',
  GB: 'United Kingdom',
  CA: 'Canada',
  AU: 'Australia',
  SG: 'Singapore',
  AE: 'United Arab Emirates',
  DE: 'Germany',
  FR: 'France',
  BR: 'Brazil',
  ID: 'Indonesia',
};

const PRESET_MARKETS = [
  'United States',
  'India',
  'United Kingdom',
  'Canada',
  'Australia',
  'Singapore',
  'United Arab Emirates',
];

function readCountry(locationData: unknown): string | undefined {
  if (!locationData || typeof locationData !== 'object' || !('country' in locationData)) return undefined;
  const value = (locationData as { country?: unknown }).country;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function countryToTrendMarket(country?: string | null): string | undefined {
  const value = country?.trim();
  if (!value) return undefined;
  return COUNTRY_NAMES[value.toUpperCase()] ?? value;
}

export function resolveTrendLocation(value: string, country?: string | null): string | undefined {
  if (value === GLOBAL_TREND_MARKET) return undefined;
  if (value === LOCAL_TREND_MARKET) return countryToTrendMarket(country);
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 120) : undefined;
}

export function useResolvedTrendLocation(value: string) {
  const { locationData, isLoading } = useLocation();
  const country = readCountry(locationData);
  const trendLocation = resolveTrendLocation(value, country);
  const localLabel = isLoading ? 'detecting...' : countryToTrendMarket(country) ?? 'your location';
  return { trendLocation, localLabel, isLoading };
}

export default function TrendMarketSelector({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { localLabel } = useResolvedTrendLocation(value);

  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      aria-label="Trend market"
      title="Market used for live trend discovery"
      className={className}
    >
      <option value={LOCAL_TREND_MARKET}>Local: {localLabel}</option>
      <option value={GLOBAL_TREND_MARKET}>Global</option>
      {PRESET_MARKETS.map((market) => (
        <option key={market} value={market}>
          {market}
        </option>
      ))}
    </select>
  );
}
