// Insturix design tokens — mirrors the locked system in the front-end repo
// (app/design-tokens.css / DESIGN_BIBLE.md). Dark-only, warm editorial, single gold accent.
import {jakarta, mono} from './fonts';

export const theme = {
  colors: {
    canvas: '#0B0B0A', // page bg (warm near-black)
    canvasDeep: '#08080A', // hero base behind starfield
    raised: '#0F0F0E', // cards
    deeper: '#131312', // popovers / table headers
    well: '#1B1A18', // wells, chips, button bg
    border: '#1C1B19', // subtle 1px borders
    borderEmph: '#282724', // hover/active, connection lines
    textPrimary: '#ECE9E1', // off-white — NEVER pure white
    textSecondary: '#B5B2A8',
    textMuted: '#7A776E',
    textDim: '#5F5E5A', // mono micro-labels
    textFaint: '#454340',
    gold: '#D4A652', // THE brand accent — decisions only, not decorative
    success: '#5EC97E',
    danger: '#D46A5C',
    purple: '#9088D4',
    pink: '#D088B4',
    cyan: '#5CB8CC',
  },
  font: {sans: jakarta, mono},
  // The single sanctioned text gradient (off-white → gold), used for hero titles.
  wordmarkGradient: 'linear-gradient(135deg, #ECE9E1, #D4A652)',
} as const;

export type RoomKey = 'script' | 'edit' | 'analyze' | 'design' | 'distribute' | 'share';

export type Room = {
  key: RoomKey;
  label: string;
  verb: string;
  color: string;
  headline: string;
};

// The six production rooms, in pipeline order. Each owns one of the brand category colors.
// Copy is verbatim from the live products page.
export const ROOMS: readonly Room[] = [
  {key: 'script', label: 'SCRIPT', verb: 'Script.', color: '#D4A652',
    headline: 'Start with a prompt. Get a production-ready script.'},
  {key: 'edit', label: 'EDIT', verb: 'Edit.', color: '#D46A5C',
    headline: 'From script or footage. A finished output.'},
  {key: 'analyze', label: 'ANALYZE', verb: 'Analyze.', color: '#9088D4',
    headline: 'Know what works before you publish.'},
  {key: 'design', label: 'DESIGN', verb: 'Design.', color: '#5CB8CC',
    headline: 'Thumbnails that get clicked.'},
  {key: 'distribute', label: 'DISTRIBUTE', verb: 'Distribute.', color: '#5EC97E',
    headline: 'Published everywhere. One click.'},
  {key: 'share', label: 'SHARE', verb: 'Share.', color: '#D088B4',
    headline: 'Your brand in one link.'},
];
