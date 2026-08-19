import { describe, expect, it } from 'vitest';

import { validateJsonSchemaV2 } from '@/lib/editron/research/open-ended-planner/stage4-compilation-evaluator-v2';

describe('Stage-4 JSON-schema numeric bounds', () => {
  it('accepts inclusive number and integer bounds', () => {
    const boundedNumber = { type: 'number', minimum: 0.02, maximum: 0.8 };
    expect(validateJsonSchemaV2(0.02, boundedNumber, '$.duckLevel')).toEqual([]);
    expect(validateJsonSchemaV2(0.8, boundedNumber, '$.duckLevel')).toEqual([]);

    const boundedInteger = { type: 'integer', minimum: 50, maximum: 2_000 };
    expect(validateJsonSchemaV2(50, boundedInteger, '$.rampDownMs')).toEqual([]);
    expect(validateJsonSchemaV2(2_000, boundedInteger, '$.rampDownMs')).toEqual([]);
  });

  it('rejects values outside declared number and integer bounds', () => {
    const boundedNumber = { type: 'number', minimum: 0, maximum: 1 };
    expect(validateJsonSchemaV2(-0.01, boundedNumber, '$.x')).toEqual(['$.x:NUMBER']);
    expect(validateJsonSchemaV2(1.01, boundedNumber, '$.x')).toEqual(['$.x:NUMBER']);

    const boundedInteger = { type: 'integer', minimum: 50, maximum: 2_000 };
    expect(validateJsonSchemaV2(49, boundedInteger, '$.rampDownMs')).toEqual(['$.rampDownMs:INTEGER']);
    expect(validateJsonSchemaV2(2_001, boundedInteger, '$.rampDownMs')).toEqual(['$.rampDownMs:INTEGER']);
  });

  it('rejects non-canonical, unsafe, fractional, and non-finite numeric inputs', () => {
    const numberSchema = { type: 'number', minimum: 0, maximum: 1 };
    for (const value of [-0, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(validateJsonSchemaV2(value, numberSchema, '$.strength')).toEqual(['$.strength:NUMBER']);
    }

    const integerSchema = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
    for (const value of [-0, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN]) {
      expect(validateJsonSchemaV2(value, integerSchema, '$.frame')).toEqual(['$.frame:INTEGER']);
    }
  });

  it('fails closed for malformed bounds and nested bounded fields', () => {
    expect(validateJsonSchemaV2(0.5, { type: 'number', minimum: 'zero' }, '$.strength'))
      .toEqual(['$.strength:NUMBER']);
    expect(validateJsonSchemaV2(0.5, { type: 'number', maximum: Number.NaN }, '$.strength'))
      .toEqual(['$.strength:NUMBER']);

    const focalPointSchema = {
      type: 'object',
      required: ['x', 'y'],
      properties: {
        x: { type: 'number', minimum: 0, maximum: 1 },
        y: { type: 'number', minimum: 0, maximum: 1 },
      },
      additionalProperties: false,
    };
    expect(validateJsonSchemaV2({ x: 0.5, y: 1.1 }, focalPointSchema, '$.focalPoint'))
      .toEqual(['$.focalPoint.y:NUMBER']);
  });
});
