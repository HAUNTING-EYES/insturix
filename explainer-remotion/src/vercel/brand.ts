import type {Brand} from '../bricks/brand';

// VERCEL brand tokens — "scanned" the way Brand Vault would: pure black canvas, near-white Geist-style type,
// hairline borders, ZERO glow/grid (Vercel is flat + stark, the antithesis of Insturix's warm-gold glow), tight
// negative tracking, white as the primary action colour (their buttons are white-on-black). Deployment status
// green is a product-UI colour, not a brand accent. Font: Geist isn't loadable here → close geometric-sans stack.
export const VERCEL: Brand = {
  name: 'Vercel',
  productName: 'Vercel',
  colors: {
    bg: '#000000',
    surface: '#0A0A0A',
    surfaceAlt: '#161616',
    text: '#EDEDED',
    muted: '#8F8F8F',
    border: 'rgba(255,255,255,0.14)',
    accent: '#FFFFFF', // Vercel's primary = white
    accentText: '#000000',
  },
  fontSans: 'Inter, "Geist", -apple-system, BlinkMacSystemFont, sans-serif',
  type: {headingWeight: 600, tracking: '-0.035em', lineHeight: 1.02, eyebrowCase: 'upper'},
  shape: {radius: 8, border: 1},
  density: 0.4,
  decor: {grid: false, glow: false},
  motion: {energy: 0.72, overshoot: 0.16},
};

export const VERCEL_MONO = '"Geist Mono", "SF Mono", "JetBrains Mono", ui-monospace, monospace';
export const VERCEL_GREEN = '#0CCE6B'; // deployment "Ready" status
export const VERCEL_BLUE = '#0070F3'; // links / building
