import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  assertThinkForgePublishingRequestFeasible,
  measureThinkForgePublishableText,
  resolveThinkForgePublishingConstraintsForAuthoringRequest,
} from '@/lib/thinkforge/signals/publishing-constraints';
import { toThinkForgeErrorResponse } from '@/lib/thinkforge/errors/thinkforge-error';
import {
  createDefaultThinkForgePostControls,
  createThinkForgeAuthoringRequest,
  type ThinkForgeAuthoringRequest,
} from '@/lib/thinkforge/schemas/authoring-request';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';

function postRequest(
  platformSurface: ThinkForgeAuthoringRequest['platformSurface'],
): ThinkForgeAuthoringRequest {
  return createThinkForgeAuthoringRequest({
    platformSurface,
    contentContract: createThinkForgeWriterContract('social_post'),
    postControls: createDefaultThinkForgePostControls(),
  });
}

describe('ThinkForge publishing constraints', () => {
  it('uses X weighted counting for URLs instead of raw string length', () => {
    const constraints = resolveThinkForgePublishingConstraintsForAuthoringRequest(
      postRequest({ id: 'x' }),
    );
    const text = 'Read https://example.com/a/very/long/path/that/does/not/count/at/raw/length';

    const measurement = measureThinkForgePublishableText(text, constraints);

    expect(measurement.characterCount).toBe(28);
    expect(measurement.characterCount).toBeLessThan(text.length);
    expect(measurement.valid).toBe(true);
  });

  it('uses X emoji and CJK weights from the official parser', () => {
    const constraints = resolveThinkForgePublishingConstraintsForAuthoringRequest(
      postRequest({ id: 'x' }),
    );

    expect(measureThinkForgePublishableText('a', constraints).characterCount).toBe(1);
    expect(measureThinkForgePublishableText('\u6f22', constraints).characterCount).toBe(2);
    expect(
      measureThinkForgePublishableText(
        '\u{1f468}\u200d\u{1f469}\u200d\u{1f467}\u200d\u{1f466}',
        constraints,
      ).characterCount,
    ).toBe(2);
  });

  it('rejects an X post over the standard 280 weighted-character limit', () => {
    const constraints = resolveThinkForgePublishingConstraintsForAuthoringRequest(
      postRequest({ id: 'x' }),
    );

    const measurement = measureThinkForgePublishableText('a'.repeat(281), constraints);

    expect(measurement.characterCount).toBe(281);
    expect(measurement.maximumCharacters).toBe(280);
    expect(measurement.valid).toBe(false);
  });

  it('normalizes X text to NFC before measuring it', () => {
    const constraints = resolveThinkForgePublishingConstraintsForAuthoringRequest(
      postRequest({ id: 'x' }),
    );

    const measurement = measureThinkForgePublishableText('Cafe\u0301', constraints);

    expect(measurement.normalizedText).toBe('Caf\u00e9');
    expect(measurement.characterCount).toBe(4);
  });

  it('keeps LinkedIn counting explicitly conservative', () => {
    const constraints = resolveThinkForgePublishingConstraintsForAuthoringRequest(
      postRequest({ id: 'linkedin' }),
    );
    const measurement = measureThinkForgePublishableText('A\u{1f600}', constraints);

    expect(constraints.characterCounting).toBe('utf16_code_units_conservative');
    expect(measurement.characterCount).toBe(3);
    expect(measurement.maximumCharacters).toBe(3_000);
  });

  it('does not invent limits for a custom platform label', () => {
    const constraints = resolveThinkForgePublishingConstraintsForAuthoringRequest(
      postRequest({ id: 'custom', customLabel: 'Instagram partner newsroom' }),
    );
    const measurement = measureThinkForgePublishableText('A'.repeat(10_000), constraints);

    expect(constraints.surface).toBe('unknown');
    expect(measurement.maximumCharacters).toBeUndefined();
    expect(measurement.valid).toBe(true);
  });

  it('returns a named actionable error for an explicit overlong YouTube Short', () => {
    const request = createThinkForgeAuthoringRequest({
      platformSurface: { id: 'youtube' },
      publishingSurface: 'youtube_shorts',
      contentContract: createThinkForgeWriterContract('video_script'),
      targetDurationSec: 181,
    });

    let caught: unknown;
    try {
      assertThinkForgePublishingRequestFeasible(request);
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: 'PUBLISHING_REQUEST_INCOMPATIBLE' });
    expect(toThinkForgeErrorResponse(caught)).toEqual({
      status: 422,
      body: {
        error: {
          type: 'needs_user_input',
          code: 'PUBLISHING_REQUEST_INCOMPATIBLE',
          message: 'youtube_shorts supports at most 180 seconds; requested 181 seconds',
          retryable: false,
        },
      },
    });
  });

  it('maps chapter-required scripts to a named user-action response', () => {
    expect(toThinkForgeErrorResponse(Object.assign(new Error('Use chaptered generation.'), {
      code: 'SCRIPT_REQUIRES_CHAPTERED_GENERATION',
    }))).toMatchObject({
      status: 422,
      body: { error: { type: 'needs_user_input', code: 'SCRIPT_REQUIRES_CHAPTERED_GENERATION' } },
    });
  });

  it('enforces publishing feasibility before either paid ThinkForge entry point', () => {
    const chatRoute = readFileSync('app/api/services/thinkforge/chat/route.ts', 'utf8');
    const ideasRoute = readFileSync('app/api/services/thinkforge/ideas/route.ts', 'utf8');

    expect(chatRoute.indexOf('assertThinkForgePublishingRequestFeasible(authoringRequest)'))
      .toBeLessThan(chatRoute.indexOf('checkCredits('));
    expect(ideasRoute.indexOf('assertThinkForgePublishingRequestFeasible(authoringRequest)'))
      .toBeLessThan(ideasRoute.indexOf('checkCredits('));
  });
});
