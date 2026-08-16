import { describe, expect, it } from 'vitest';

import {
  measureThinkForgePublishableText,
  resolveThinkForgePublishingConstraintsForAuthoringRequest,
} from '@/lib/thinkforge/signals/publishing-constraints';
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
});
