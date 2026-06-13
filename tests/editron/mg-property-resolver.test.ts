import { describe, expect, it } from 'vitest';
import { resolveMotionTokens } from '../../lib/editron/data/motion-theme-resolver';
import { resolveElements } from '../../lib/editron/motion-graphics/engine/property-resolver';
import type { RecipeElement } from '../../lib/editron/motion-graphics/engine/recipe-types';

describe('motion-graphics property resolver', () => {
  it('resolves structural group elements that do not declare bindings', () => {
    const tokens = resolveMotionTokens({}, {});
    const elements = [
      {
        primitive: 'group',
        role: 'structure-wrap',
        layer: 'foreground',
        children: [
          {
            primitive: 'text',
            role: 'label',
            bind: {
              text: 'content:label',
              color: 'token:color.accent',
            },
          },
        ],
      },
    ] as unknown as RecipeElement[];

    const resolved = resolveElements(elements, tokens, { label: 'visible MG' });

    expect(resolved[0].resolvedProps).toEqual({});
    expect(resolved[0].children?.[0].resolvedProps.text).toBe('visible MG');
    expect(resolved[0].children?.[0].resolvedProps.color).toBe(tokens.color.accent);
  });
});
