/**
 * Phase 2 (brief §6.3): map a kit Brand → BrandTasteProfile.
 * §6.3 rule: never infer strong MOTION traits from a static logo+palette — kit evidence licenses only
 * typography/color (medium), never form/motion (low). Evidence stays 1:1 with real kit values.
 */
import type { Brand } from '../kit/brand';
import type { BrandTasteProfile } from './taste-schemas';

export function brandTasteProfileFromKit(brand: Brand, opts: { updatedAt?: string } = {}): BrandTasteProfile {
  const colorPairs: Array<[string, string]> = [
    ['bg', brand.bg], ['surface', brand.surface], ['surfaceAlt', brand.surfaceAlt],
    ['muted', brand.muted], ['accent', brand.accent], ['accentText', brand.accentText],
  ];
  return {
    brandId: (brand.name || 'brand').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    version: 'brand-kit-v1',
    evidence: [],
    typographyTraits: [`font: ${brand.fontSans}`, ...(brand.fontDisplay ? [`display: ${brand.fontDisplay}`] : [])],
    colorTraits: colorPairs.map(([k, v]) => `${k}=${v}`),
    formTraits: [],
    motionTraits: [], // §6.3: a static kit does NOT license motion traits
    preferredPatterns: [],
    rejectedPatterns: [],
    confidenceByDomain: { typography: 'medium', color: 'medium', form: 'low', motion: 'low' }, // §6.3 limited
    updatedAt: opts.updatedAt ?? new Date().toISOString(),
  };
}
