import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import type {Brand} from './brand';
import {withAlpha} from './brand';
import {DeviceFrame} from './DeviceFrame';
import {UIMock} from './UIMock';
import {KineticHeadline, Eyebrow} from './KineticHeadline';
import {StatCard} from './StatCard';

// FORM: "hero reveal" — headline + product in a device, camera push-in. Copy is prop-driven (a director /
// GLM supplies it); structure/look come from brand tokens. Grid/glow only if the brand asks.
export type HeroProps = {
  eyebrow?: string;
  headline?: string;
  accentWord?: string;
  statValue?: number | string;
  statSuffix?: string;
  statLabel?: string;
  navActive?: number;
};

export const BrandRevealScene: React.FC<{brand: Brand} & HeroProps> = ({
  brand,
  eyebrow,
  headline = 'Your whole workflow, in one place.',
  accentWord = 'place',
  statValue = 92,
  statSuffix = '%',
  statLabel = 'less busywork',
  navActive = 1,
}) => {
  const frame = useCurrentFrame();
  const c = brand.colors;
  const push = interpolate(frame, [0, 90], [0.985, 1.02], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const deviceIn = interpolate(frame, [8, 34], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill style={{background: c.bg, fontFamily: brand.fontSans}}>
      {brand.decor.grid ? (
        <AbsoluteFill
          style={{
            backgroundImage: `linear-gradient(90deg, ${withAlpha(c.text, 0.04)} 1px, transparent 1px), linear-gradient(0deg, ${withAlpha(c.text, 0.035)} 1px, transparent 1px)`,
            backgroundSize: '72px 72px',
            opacity: 0.6,
          }}
        />
      ) : null}
      <AbsoluteFill style={{background: `radial-gradient(${brand.decor.glow ? '60% 50% at 78% 40%' : '70% 60% at 80% 30%'}, ${withAlpha(c.accent, brand.decor.glow ? 0.16 : 0.06)}, transparent 60%)`}} />

      <div style={{position: 'absolute', inset: '9% 7%', display: 'grid', gridTemplateColumns: '0.82fr 1.18fr', gap: '5%', alignItems: 'center'}}>
        <div style={{display: 'flex', flexDirection: 'column', gap: 28}}>
          <Eyebrow brand={brand} startAt={2}>{eyebrow ?? brand.productName}</Eyebrow>
          <KineticHeadline brand={brand} text={headline} accentWord={accentWord} startAt={6} fontSize={62} maxWidth={560} />
          <div style={{alignSelf: 'flex-start'}}>
            <StatCard brand={brand} value={statValue} suffix={statSuffix} label={statLabel} startAt={40} />
          </div>
        </div>

        <div style={{transform: `scale(${push * (0.96 + deviceIn * 0.04)})`, opacity: deviceIn, transformOrigin: '60% 50%'}}>
          <DeviceFrame brand={brand} style={{height: 620}}>
            <UIMock brand={brand} activeNav={navActive} />
          </DeviceFrame>
        </div>
      </div>
    </AbsoluteFill>
  );
};
