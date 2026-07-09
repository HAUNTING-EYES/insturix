import React from 'react';
import {theme} from '../theme';

// The signature Insturix micro-label: uppercase JetBrains Mono with wide tracking.
export const MonoLabel: React.FC<{
  children: React.ReactNode;
  size?: number;
  color?: string;
  tracking?: number;
  weight?: number;
  style?: React.CSSProperties;
}> = ({children, size = 13, color = theme.colors.textDim, tracking = 0.18, weight = 500, style}) => (
  <div
    style={{
      fontFamily: theme.font.mono,
      fontSize: size,
      fontWeight: weight,
      letterSpacing: `${tracking}em`,
      textTransform: 'uppercase',
      color,
      ...style,
    }}
  >
    {children}
  </div>
);
