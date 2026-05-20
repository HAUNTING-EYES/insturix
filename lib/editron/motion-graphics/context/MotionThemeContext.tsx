/**
 * Motion Theme Context
 *
 * Provides resolved MotionTokens to all structure components in a Remotion
 * composition. Set once per video at the composition root. All structure
 * components within that composition read from the same context, ensuring
 * the 3 Laws of Cohesion (Kinetic Unity, Material Consistency, Proportional
 * Hierarchy) are enforced by construction.
 */

import React, { createContext, useContext } from 'react';
import type { MotionTokens } from '../types';
import { resolveMotionTokens } from '../../data/motion-theme-resolver';

const MotionThemeContext = createContext<MotionTokens | null>(null);

interface MotionThemeProviderProps {
  tokens: MotionTokens;
  children: React.ReactNode;
}

export const MotionThemeProvider: React.FC<MotionThemeProviderProps> = ({
  tokens,
  children,
}) => (
  <MotionThemeContext.Provider value={tokens}>
    {children}
  </MotionThemeContext.Provider>
);

export function useMotionTheme(): MotionTokens {
  const tokens = useContext(MotionThemeContext);
  if (!tokens) {
    return resolveMotionTokens();
  }
  return tokens;
}
