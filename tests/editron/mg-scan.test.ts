import { describe, expect, it } from 'vitest';

import { scanCode } from '@/lib/editron/motion-graphics/codegen/scan';
import {
  PRIMITIVE_API,
  HARD_RULES,
  COMPOSITION_GUIDE,
  FOUNDATIONAL_MG_KNOWLEDGE,
  GROUNDING_RULE,
  JUDGE_PROMPT,
  KIT_IMPORT_PREAMBLE,
} from '@/lib/editron/motion-graphics/codegen/prompt';

// A minimal, valid generated component — passes every construction rule.
const VALID = `
import React from 'react';
import {useCurrentFrame, useVideoConfig, interpolate} from 'remotion';
import {Brand, withAlpha} from './kit/brand';
import {Stage, Region} from './kit/stage';
import {FitHeadline} from './kit/fit-text';
import {phases, countUp} from './kit/choreo';
export const MgScene: React.FC<{brand: Brand}> = ({brand}) => {
  const frame = useCurrentFrame();
  const ph = phases(90, brand);
  const n = countUp(frame, ph.intro, 30, 42);
  return (
    <Stage brand={brand}>
      <Region brand={brand} x={0.08} y={0.2} w={0.84} h={0.6} align="center" justify="center">
        <FitHeadline brand={brand} text={String(n) + '%'} size="display" />
      </Region>
    </Stage>
  );
};
`;

/** VALID plus an extra line, to trip a specific ban. */
const withLine = (line: string) => VALID + '\n' + line;

describe('scanCode - valid code passes', () => {
  it('a clean kit component passes', () => {
    const r = scanCode(VALID);
    expect(r.ok).toBe(true);
    expect(r.reason).toBeUndefined();
  });
  it("'transparent' and brand tokens are allowed", () => {
    expect(scanCode(withLine("const s = { color: 'transparent', background: withAlpha(brand.colors.accent, 0.2) };")).ok).toBe(true);
  });
  it('phases-anchored interpolate is allowed even with a later frame window', () => {
    expect(scanCode(withLine('const t = interpolate(frame, [ph.build, ph.resolve], [0, 1]);')).ok).toBe(true);
  });
});

describe('scanCode - ADVERSARIAL: every ban class must trip (Rule 29)', () => {
  it('★ missing <Stage> root → reject', () => {
    const r = scanCode(VALID.replace('<Stage brand={brand}>', '<div>').replace('</Stage>', '</div>'));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Stage/);
  });

  it('★ Law 1: <Stage backdrop={true}> → reject', () => {
    const r = scanCode(VALID.replace('<Stage brand={brand}>', '<Stage brand={brand} backdrop={true}>'));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/backdrop|Law 1/i);
  });

  it('★ disallowed import → reject', () => {
    for (const bad of ["import axios from 'axios';", "import {x} from '../composers';", "import {y} from './helpers';"]) {
      const r = scanCode(VALID.replace("import React from 'react';", `import React from 'react';\n${bad}`));
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/import/i);
    }
  });

  it('★ raw hex / rgb / hsl / named colour → reject (Law 4)', () => {
    expect(scanCode(withLine("const a = { color: '#ff0000' };")).ok).toBe(false);
    expect(scanCode(withLine("const b = { background: 'rgb(1,2,3)' };")).ok).toBe(false);
    expect(scanCode(withLine("const c = { fill: 'hsl(1,2%,3%)' };")).ok).toBe(false);
    expect(scanCode(withLine("const d = { color: 'red' };")).ok).toBe(false);
  });

  it('★ hand-typed fontSize > 30 → reject (small is allowed)', () => {
    expect(scanCode(withLine('const e = { fontSize: 48 };')).ok).toBe(false);
    expect(scanCode(withLine('const f = { fontSize: 20 };')).ok).toBe(true);
  });

  it('★ hand-typed frame window without phases() → reject', () => {
    const noPhases = `
import React from 'react';
import {useCurrentFrame, interpolate} from 'remotion';
import {Brand} from './kit/brand';
import {Stage} from './kit/stage';
export const MgScene: React.FC<{brand: Brand}> = ({brand}) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [14, 38], [0, 1]);
  return <Stage brand={brand}>{t}</Stage>;
};`;
    const r = scanCode(noPhases);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/frame window|phases/i);
  });

  it('★ non-deterministic / unsafe calls → reject', () => {
    for (const bad of [
      'const x = Math.random();',
      'const x = Date.now();',
      'const x = new Date();',
      'eval("1");',
      'fetch("/x");',
      'const x = require("fs");',
      'const m = await import("./x");',
      'window.scrollTo(0,0);',
      'document.querySelector("a");',
      'setTimeout(() => {}, 100);',
      'const p = process.env.X;',
    ]) {
      const r = scanCode(withLine(bad));
      expect(r.ok, `should reject: ${bad}`).toBe(false);
    }
  });

  it('★ brandless brand-requiring kit tag → reject (the undefined-density crash class, live 2026-07-18)', () => {
    // the exact live specimen shape: <Region> without brand crashed dv(brand) mid-render
    const r = scanCode(VALID.replace('<Region brand={brand} x={0.08}', '<Region x={0.08}'));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Region.*brand/);
    // multiline open tag without brand is also caught
    const multi = scanCode(VALID.replace('<FitHeadline brand={brand} text=', '<FitHeadline\n        text='));
    expect(multi.ok).toBe(false);
    expect(multi.reason).toMatch(/FitHeadline.*brand/);
    // Reveal takes no brand — exempt, must still pass
    expect(scanCode(VALID.replace('<FitHeadline brand={brand} text={String(n) + \'%\'} size="display" />', '<Reveal at={ph.intro}><FitHeadline brand={brand} text={String(n) + \'%\'} size="display" /></Reveal>')).ok).toBe(true);
  });

  it('★ hardcoded ambient() strength literal → reject; bound intensity passes (founder law: liveness is resolved)', () => {
    expect(scanCode(withLine("const h = ambient(frame, ph.intro, 'float', 0.5);")).ok).toBe(false);
    expect(scanCode(withLine("const h = ambient(frame, ph.intro, 'float', 0.5);")).reason).toMatch(/motionIntensity/);
    expect(scanCode(withLine("const h = ambient(frame, ph.intro, 'float', data.motionIntensity);")).ok).toBe(true);
    expect(scanCode(withLine("const h = ambient(frame, ph.intro, 'drift');")).ok).toBe(true); // no 4th arg = default, allowed
  });

  it('empty / non-string → reject, never throws', () => {
    expect(scanCode('').ok).toBe(false);
    expect(scanCode('   ').ok).toBe(false);
    expect(() => scanCode(undefined as unknown as string)).not.toThrow();
    expect(scanCode(undefined as unknown as string).ok).toBe(false);
  });
});

describe('prompt scaffolding - well-formed for E0', () => {
  it('primitive API points at the kit + forbids product composers', () => {
    expect(PRIMITIVE_API).toMatch(/FitHeadline/);
    expect(PRIMITIVE_API).toMatch(/backdrop is FALSE|backdrop.*false/i);
    expect(PRIMITIVE_API).not.toMatch(/ProductShot|VideoShot|FullBleedProduct/);
  });
  it('hard rules are stable (clip length read from useVideoConfig, not interpolated) + no imports + determinism', () => {
    const r = HARD_RULES;
    expect(r).not.toMatch(/\$\{/); // byte-identical → cacheable prefix; nothing interpolated in
    expect(r).toMatch(/useVideoConfig/); // the clip length is READ, not baked into the rules
    expect(r).toMatch(/do not write any import/i); // imports are injected, not authored
    expect(r).toMatch(/Math\.random/);
  });
  it('the canonical import preamble covers every kit module (deterministic imports)', () => {
    for (const mod of ['react', 'remotion', './kit/brand', './kit/stage', './kit/fit-text', './kit/choreo']) {
      expect(KIT_IMPORT_PREAMBLE).toContain(mod);
    }
  });
  it('composition guide is type-free + bans keyword-highlighting / lower-thirds (Rule 11)', () => {
    expect(COMPOSITION_GUIDE).toMatch(/keyword|lower-third/i);
    expect(COMPOSITION_GUIDE).toMatch(/fresh composition/i);
    expect(COMPOSITION_GUIDE).toMatch(/not a menu|directions, not/i); // priors, never a menu
  });
  it('foundational knowledge carries purpose + craft + range-as-priors (no template catalog)', () => {
    expect(FOUNDATIONAL_MG_KNOWLEDGE).toMatch(/purpose/i);
    expect(FOUNDATIONAL_MG_KNOWLEDGE).toMatch(/honest/i); // perceptual honesty
    expect(FOUNDATIONAL_MG_KNOWLEDGE).toMatch(/priors, NOT a menu/i);
  });
  it('grounding rule forbids fabrication and offers an honest DECLINE', () => {
    expect(GROUNDING_RULE).toMatch(/never invent/i);
    expect(GROUNDING_RULE).toMatch(/DECLINE:/);
    expect(GROUNDING_RULE).toMatch(/read them from `?data`?/i); // values are props, never baked
  });
  it('judge prompt returns scored JSON and judges over footage', () => {
    expect(JUDGE_PROMPT).toMatch(/score/);
    expect(JUDGE_PROMPT).toMatch(/footage|over a real video/i);
  });
});
