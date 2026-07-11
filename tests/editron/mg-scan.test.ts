import { describe, expect, it } from 'vitest';

import { scanCode } from '@/lib/editron/motion-graphics/codegen/scan';
import { PRIMITIVE_API, hardRules, E0_COMPOSITION_GUIDE, JUDGE_PROMPT, KIT_IMPORT_PREAMBLE } from '@/lib/editron/motion-graphics/codegen/prompt';

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
  it('hard rules embed the frame count + tell the model NOT to write imports + determinism', () => {
    const r = hardRules(120);
    expect(r).toMatch(/120/);
    expect(r).toMatch(/do not write any import/i); // imports are injected, not authored
    expect(r).toMatch(/Math\.random/);
  });
  it('the canonical import preamble covers every kit module (deterministic imports)', () => {
    for (const mod of ['react', 'remotion', './kit/brand', './kit/stage', './kit/fit-text', './kit/choreo']) {
      expect(KIT_IMPORT_PREAMBLE).toContain(mod);
    }
  });
  it('composition guide bans keyword-highlighting / lower-thirds (founder rule)', () => {
    expect(E0_COMPOSITION_GUIDE).toMatch(/keyword|lower-third/i);
    expect(E0_COMPOSITION_GUIDE).toMatch(/percent/i); // perceptual honesty
  });
  it('judge prompt returns scored JSON and judges over footage', () => {
    expect(JUDGE_PROMPT).toMatch(/score/);
    expect(JUDGE_PROMPT).toMatch(/footage|over a real video/i);
  });
});
