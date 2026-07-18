import {
  SchemaType,
  type FunctionDeclarationSchema,
  type Schema,
} from '@google/generative-ai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  chatEditorialIntentSchema,
  chatReferenceStyleSchema,
} from '@/lib/editron/agent/chat-editorial-intent-tools';
import { buildGeminiFunctionDeclarations } from '@/lib/editron/agent/gemini-tool-schema';

function declaration(name: string, schema: Parameters<typeof buildGeminiFunctionDeclarations>[0][number]['schema']) {
  return buildGeminiFunctionDeclarations([{ name, description: `${name} description`, schema }])[0];
}

function property(schema: Schema | FunctionDeclarationSchema, key: string): Schema {
  expect(schema.type).toBe(SchemaType.OBJECT);
  if (schema.type !== SchemaType.OBJECT) throw new Error(`${key} parent is not an object`);
  const value = schema.properties[key];
  expect(value, `missing ${key}`).toBeDefined();
  return value;
}

describe('Gemini tool schema adapter', () => {
  it('preserves the real editorial-intent hierarchy while keeping defaults optional', () => {
    const result = declaration('apply_editorial_intent', chatEditorialIntentSchema);
    expect(result.parameters?.type).toBe(SchemaType.OBJECT);
    expect(result.parameters?.required).toEqual(['goal']);
    if (!result.parameters) throw new Error('missing parameters');

    const goal = result.parameters.properties.goal;
    expect(goal).toMatchObject({ type: SchemaType.STRING });
    expect(goal.description).toContain('Maximum length: 1200');

    const scope = property(result.parameters, 'scope');
    expect(scope.description).toContain('Default: {"kind":"project"}');
    expect(scope.type).toBe(SchemaType.OBJECT);
    if (scope.type !== SchemaType.OBJECT) throw new Error('scope is not an object');
    expect(scope.required).toBeUndefined();
    expect(scope.properties.kind).toMatchObject({
      type: SchemaType.STRING,
      format: 'enum',
      enum: ['project', 'selection', 'moment'],
    });
    expect(scope.properties.startFrame.type).toBe(SchemaType.INTEGER);
    const overlayIds = scope.properties.overlayIds;
    expect(overlayIds.type).toBe(SchemaType.ARRAY);
    if (overlayIds.type !== SchemaType.ARRAY) throw new Error('overlayIds is not an array');
    expect(overlayIds.maxItems).toBe(24);
    expect(overlayIds.items).toMatchObject({ type: SchemaType.STRING });
    expect(overlayIds.items.description).toContain('Accepts text or a number');

    const families = property(result.parameters, 'families');
    const motionGraphics = property(families, 'motionGraphics');
    const mode = property(motionGraphics, 'mode');
    expect(mode).toMatchObject({
      type: SchemaType.STRING,
      format: 'enum',
      enum: ['auto', 'off', 'prefer'],
    });
    expect(property(motionGraphics, 'frequency').type).toBe(SchemaType.NUMBER);
    expect(property(motionGraphics, 'intensity').type).toBe(SchemaType.NUMBER);

    expect(result.parameters.properties.constraints).toMatchObject({
      type: SchemaType.ARRAY,
      maxItems: 20,
    });
    expect(result.parameters.properties.script.type).toBe(SchemaType.STRING);
  });

  it('keeps reference strength optional while requiring the owned asset id', () => {
    const result = declaration('apply_reference_style', chatReferenceStyleSchema);
    expect(result.parameters?.required).toEqual(['referenceAssetId']);
    expect(result.parameters?.properties.referenceAssetId.type).toBe(SchemaType.STRING);
    expect(result.parameters?.properties.strength).toMatchObject({ type: SchemaType.NUMBER });
    expect(result.parameters?.properties.strength.description).toContain('Default: 0.5');
  });

  it('merges object alternatives without erasing their fields', () => {
    const styles = z.union([
      z.object({
        fontSize: z.union([z.string(), z.number()]),
        color: z.string().optional(),
      }),
      z.object({
        opacity: z.number().min(0).max(1),
      }),
    ]);
    const result = declaration('update_style', z.object({ styles }));
    if (!result.parameters) throw new Error('missing parameters');
    const converted = property(result.parameters, 'styles');
    expect(converted.type).toBe(SchemaType.OBJECT);
    if (converted.type !== SchemaType.OBJECT) throw new Error('styles is not an object');
    expect(Object.keys(converted.properties).sort()).toEqual(['color', 'fontSize', 'opacity']);
    expect(converted.required).toBeUndefined();
    expect(converted.properties.fontSize).toMatchObject({ type: SchemaType.STRING });
    expect(converted.properties.fontSize.description).toContain('Accepts text or a number');
  });

  it('preserves nullable scalar fields', () => {
    const result = declaration('nullable_tool', z.object({ note: z.string().nullable().optional() }));
    expect(result.parameters?.properties.note).toMatchObject({
      type: SchemaType.STRING,
      nullable: true,
    });
  });

  it('omits parameters for a genuinely argument-free tool', () => {
    expect(declaration('no_args', z.object({})).parameters).toBeUndefined();
  });

  it('fails loudly instead of silently stringifying unsupported schemas', () => {
    expect(() => declaration('unsafe_payload', z.object({ payload: z.any() })))
      .toThrow(/unsafe_payload\.payload.*unsupported or missing type/);
  });

  it('rejects duplicate and invalid function names before calling Gemini', () => {
    const schema = z.object({ value: z.string() });
    expect(() => buildGeminiFunctionDeclarations([
      { name: 'same', schema },
      { name: 'same', schema },
    ])).toThrow(/Duplicate tool name/);
    expect(() => declaration('not valid', schema)).toThrow(/Invalid tool name/);
  });
});
