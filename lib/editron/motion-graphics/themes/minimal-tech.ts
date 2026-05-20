/**
 * Minimal Tech Theme
 *
 * Clean Apple/SaaS aesthetic. Semi-bold geometric sans, glass surfaces,
 * snappy power3.out easing, cool temperature. Suitable for: tech reviews,
 * SaaS demos, product launches, developer content, AI tools.
 *
 * Generated from signals: formality=0.2, enthusiasm=0.6, warmth=0.3,
 * emotional_arousal=0.5, pacing_velocity=0.65, humor=0.15,
 * visceral_impact=0.3, visual_dependency=0.7
 *
 * This is a STATIC reference theme for testing and fallback.
 * In production, themes are generated dynamically via resolveMotionTokens().
 */

import type { MotionTokens } from '../types';

export const MINIMAL_TECH_THEME: MotionTokens = {
  animation: {
    entranceEasing: 'power3.out',
    exitEasing: 'power2.in',
    emphasisEasing: 'power2.out',
    entranceDurationMs: 380,
    exitDurationMs: 265,
    staggerMs: 60,
    overshoot: false,
    entrancePattern: 'slide-up',
    exitPattern: 'fade',
  },
  typography: {
    headingFamily: 'Inter, system-ui, sans-serif',
    bodyFamily: 'Inter, system-ui, sans-serif',
    monoFamily: 'JetBrains Mono, monospace',
    headingWeight: 600,
    bodyWeight: 400,
    headingTracking: '0.005em',
    headingTransform: 'none',
    sizeScale: 1.08,
  },
  color: {
    primary: '#6366F1',
    accent: '#10B981',
    textPrimary: '#FFFFFF',
    textSecondary: '#94A3B8',
    surfaceBase: '#0A0A14',
    surfaceOpacity: 0.87,
    temperature: 'cool',
  },
  surface: {
    style: 'glass',
    backdropBlur: 14,
    cornerRadius: 10,
    borderWeight: 1,
    borderOpacity: 0.08,
    shadow: '0 4px 16px rgba(0,0,0,0.16)',
  },
  layout: {
    density: 'rich',
    maxSimultaneous: 3,
    holdDurationMs: 2800,
    alignment: 'left',
    paddingScale: 1.0,
  },
};
