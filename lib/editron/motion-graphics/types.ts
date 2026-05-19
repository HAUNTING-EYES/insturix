/**
 * Motion Graphics Type Definitions
 *
 * Shared types for the Structure × Theme composable motion graphics system.
 * Structure components receive content + tokens, render via Remotion native APIs.
 */

export type { MotionTokens, ContentSignals, BrandInputs } from '../data/motion-theme-resolver';

export type StructureType =
  | 'stat-counter'
  | 'lower-third'
  | 'callout-box'
  | 'title-card'
  | 'keyword-highlight'
  | 'quote-block'
  | 'logo-reveal'
  | 'progress-bar'
  | 'feature-highlight'
  | 'comparison-table'
  | 'step-list'
  | 'social-proof'
  | 'subscribe-cta'
  | 'notification';

export interface StatCounterContent {
  value: string;
  prefix?: string;
  suffix?: string;
  label: string;
}

export interface LowerThirdContent {
  name: string;
  title: string;
  icon?: string;
}

export interface CalloutBoxContent {
  icon?: string;
  title: string;
  body: string;
  variant?: 'info' | 'tip' | 'warning' | 'success';
}

export interface KeywordHighlightContent {
  keyword: string;
}

export interface QuoteBlockContent {
  quote: string;
  author?: string;
}

export interface LogoRevealContent {
  text: string;
}

export type StructureContent =
  | { type: 'stat-counter'; data: StatCounterContent }
  | { type: 'lower-third'; data: LowerThirdContent }
  | { type: 'callout-box'; data: CalloutBoxContent }
  | { type: 'keyword-highlight'; data: KeywordHighlightContent }
  | { type: 'quote-block'; data: QuoteBlockContent }
  | { type: 'logo-reveal'; data: LogoRevealContent };

export interface StructureComponentProps<T> {
  content: T;
  durationInFrames: number;
}
