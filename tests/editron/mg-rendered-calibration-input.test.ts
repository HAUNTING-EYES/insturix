import { describe, expect, it } from 'vitest';

import {
  buildMgRenderedCalibrationInput,
  MG_RENDERED_CALIBRATION_CASES,
} from '../../scripts/build-mg-rendered-calibration-input';

describe('MG rendered calibration input', () => {
  it('covers the required rendered taste calibration content shapes', () => {
    expect(MG_RENDERED_CALIBRATION_CASES.map((testCase) => testCase.id)).toEqual([
      'sparse-rate',
      'bounded-percent',
      'big-magnitude',
      'fraction',
      'keyword-concept',
      'speaker-intro',
    ]);

    const input = buildMgRenderedCalibrationInput();

    expect(input.projectId).toBe('mg-rendered-calibration');
    expect(input.width).toBe(1080);
    expect(input.height).toBe(1920);
    expect(input.overlays).toHaveLength(MG_RENDERED_CALIBRATION_CASES.length);
    expect(input.sampleFrames).toHaveLength(input.overlays.length);
  });

  it('generates live planner recipes with atomic plans and decisions for every case', () => {
    const input = buildMgRenderedCalibrationInput();

    for (const overlay of input.overlays) {
      expect(overlay.type).toBe('motion-graphic');
      expect((overlay.recipe as { elements?: unknown[] }).elements?.length).toBeGreaterThan(0);
      expect((overlay.metadata as { atomicOverlayPlan?: unknown }).atomicOverlayPlan).toBeDefined();
      expect((overlay.metadata as { atomicOverlayDecision?: unknown }).atomicOverlayDecision).toBeDefined();
      expect(Object.prototype.hasOwnProperty.call(overlay.metadata, 'graphicType')).toBe(false);
    }
  });

  it('keeps text-heavy calibration MGs out of cramped corner lanes when bottom text occupancy is protected', () => {
    const input = buildMgRenderedCalibrationInput();
    const wideCases = new Set(['sparse-rate', 'bounded-percent', 'big-magnitude', 'fraction']);

    for (const overlay of input.overlays) {
      const calibrationCase = (overlay.metadata as { calibrationCase?: string }).calibrationCase;
      if (!calibrationCase || !wideCases.has(calibrationCase)) continue;
      expect((overlay.recipe as { layout?: { position?: string } }).layout).toMatchObject({
        position: 'full-width-top',
      });
    }

    const speaker = input.overlays.find((overlay) => (
      (overlay.metadata as { calibrationCase?: string }).calibrationCase === 'speaker-intro'
    ));
    expect((speaker?.recipe as { visualIntent?: { stageMode?: string }; layout?: { position?: string; maxWidth?: string } }).visualIntent?.stageMode)
      .toBe('full-frame-graphic-scene');
    expect((speaker?.recipe as { layout?: { position?: string; maxWidth?: string } }).layout).toMatchObject({
      position: 'center',
      maxWidth: '88%',
    });
  });

  it('runs keyword concepts through expression authority into a full-frame visual contract', () => {
    const input = buildMgRenderedCalibrationInput();
    const concept = input.overlays.find((overlay) => (
      (overlay.metadata as { calibrationCase?: string }).calibrationCase === 'keyword-concept'
    ));
    const authority = concept?.metadata as {
      mgExpressionAuthority?: {
        allowMotionGraphic?: boolean;
        visualExplanationContract?: { stageMode?: string; obligations?: Array<{ kind?: string }> };
      };
    };

    expect(authority.mgExpressionAuthority?.allowMotionGraphic).toBe(true);
    expect(authority.mgExpressionAuthority?.visualExplanationContract?.stageMode).toBe('full-frame-graphic-scene');
    expect(authority.mgExpressionAuthority?.visualExplanationContract?.obligations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'summarize-section' }),
    ]));
    expect((concept?.recipe as { visualIntent?: { stageMode?: string }; layout?: { position?: string; maxWidth?: string } }).visualIntent?.stageMode)
      .toBe('full-frame-graphic-scene');
    expect((concept?.recipe as { layout?: { position?: string; maxWidth?: string } }).layout).toMatchObject({
      position: 'center',
      maxWidth: '88%',
    });
    expect(JSON.stringify(concept)).not.toMatch(/keyword-highlight|template|preset/i);
  });

  it('keeps sparse-rate calibration out of generic stat shell atoms', () => {
    const input = buildMgRenderedCalibrationInput();
    const sparse = input.overlays.find((overlay) => (
      (overlay.metadata as { calibrationCase?: string }).calibrationCase === 'sparse-rate'
    ));
    const recipeRoles = ((sparse?.recipe as { elements?: Array<{ role?: string }> }).elements ?? [])
      .map((element) => element.role);
    const atomicRoles = (((sparse?.metadata as { atomicOverlayPlan?: { elements?: Array<{ role?: string }> } })
      .atomicOverlayPlan?.elements) ?? [])
      .map((element) => element.role);
    const roles = [...recipeRoles, ...atomicRoles];

    expect(roles).toContain('numeric-sparse-rate-trace');
    expect(roles).not.toContain('sm-backdrop');
    expect(roles).not.toContain('semantic-stat-field');
    expect(roles).not.toContain('semantic-stat-axis');
  });
});
