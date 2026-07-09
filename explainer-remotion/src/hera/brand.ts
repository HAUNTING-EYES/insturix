import type {Brand} from '../bricks/brand';

// HERA brand tokens — SCANNED from hera.video only (no priors; I'd never seen Hera). A LIGHT brand: white
// canvas, near-black navy type, a warm orange-red accent (the send button + the 4-petal clover logo), and a
// pink→purple→blue gradient for the hero CTA. Playful motion (they're an AI motion-graphics tool). Font is a
// bold geometric grotesque (Inter as the loadable stand-in). Tests the system on a LIGHT theme end-to-end.
export const HERA: Brand = {
  name: 'Hera',
  productName: 'Hera',
  colors: {
    bg: '#FFFFFF',
    surface: '#F5F5F7',
    surfaceAlt: '#ECECEF',
    text: '#0B1220',
    muted: '#71717A',
    border: 'rgba(11,18,32,0.10)',
    accent: '#F5501E', // Hera orange-red
    accentText: '#FFFFFF',
  },
  fontSans: 'Inter, "Hanken Grotesk", -apple-system, sans-serif',
  type: {headingWeight: 700, tracking: '-0.035em', lineHeight: 0.98, eyebrowCase: 'upper'},
  shape: {radius: 14, border: 1},
  density: 0.36,
  decor: {grid: false, glow: false},
  motion: {energy: 0.82, overshoot: 0.34},
};

export const HERA_GRADIENT = 'linear-gradient(95deg, #EC4899 0%, #A855F7 48%, #3B82F6 100%)'; // the "Start creating" CTA
export const HERA_INK = '#0B1220';
export const HERA_CANVAS = '#0E0E10'; // the dark preview canvas inside the editor
