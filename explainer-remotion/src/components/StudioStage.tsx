import React from 'react';
import {AbsoluteFill} from 'remotion';
import {theme} from '../theme';

// Shared "product shot" stage. Lovable/LangEase never show edge-to-edge app chrome — they float ONE
// focused surface on a vibrant gradient with breathing room. This is that backdrop in OUR palette:
// warm-dark canvas + a gold glow up top and a soft coloured tint in a corner. Product screens render
// their (sparser, bigger) content on top of this instead of filling the frame with dense UI.
export const StudioStage: React.FC<{
  children: React.ReactNode;
  glow?: string; // top gold wash
  tint?: string; // corner colour accent (e.g. the room's colour)
  tintAt?: string; // position of the corner tint
}> = ({children, glow = 'rgba(212,166,82,0.16)', tint = 'rgba(212,106,92,0.06)', tintAt = '90% 6%'}) => (
  <AbsoluteFill style={{background: theme.colors.canvas}}>
    <AbsoluteFill style={{background: `radial-gradient(ellipse 62% 46% at 50% -4%, ${glow}, transparent 60%)`}} />
    <AbsoluteFill style={{background: `radial-gradient(ellipse 48% 52% at ${tintAt}, ${tint}, transparent 56%)`}} />
    {children}
  </AbsoluteFill>
);
