import { resolveExtensions } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { getThinkForgeExtensions } from '../../lib/thinkforge/extensions';

function resolvedExtensions(openLinkOnClick = false) {
  return resolveExtensions(getThinkForgeExtensions({ openLinkOnClick }));
}

describe('ThinkForge editor extension authority', () => {
  it('resolves exactly one owner for every Tiptap extension name', () => {
    const names = resolvedExtensions().map((extension) => extension.name);
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);

    expect(duplicates).toEqual([]);
    expect(names.filter((name) => name === 'link')).toHaveLength(1);
    expect(names.filter((name) => name === 'underline')).toHaveLength(1);
  });

  it('preserves ThinkForge link and underline behavior on StarterKit-owned marks', () => {
    const extensions = resolvedExtensions(true);
    const link = extensions.find((extension) => extension.name === 'link');
    const underline = extensions.find((extension) => extension.name === 'underline');

    expect(link?.options).toMatchObject({
      openOnClick: true,
      HTMLAttributes: {
        class: 'thinkforge-link',
        rel: 'noopener noreferrer',
        target: '_blank',
      },
    });
    expect(underline?.options).toMatchObject({
      HTMLAttributes: { class: 'thinkforge-underline' },
    });
  });
});
