import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';

const BLOCK_TYPES = ['paragraph', 'heading', 'actionBlock', 'whyBlock', 'exampleBlock'];

const blockIdentityPluginKey = new PluginKey('thinkforge-block-identity');

function generateBlockId(): string {
  try {
    if (typeof globalThis?.crypto?.randomUUID === 'function') {
      return `blk_${globalThis.crypto.randomUUID()}`;
    }
  } catch {}
  return `blk_${Math.random().toString(36).slice(2, 12)}`;
}

const createBlockIdentityPlugin = () => {
  return new Plugin({
    key: blockIdentityPluginKey,
    appendTransaction: (transactions, _oldState, newState) => {
      if (!transactions.some((tr) => tr.docChanged)) return null;

      let tr = newState.tr;
      let modified = false;

      newState.doc.descendants((node, pos) => {
        if (!node.isBlock) return;
        if (!BLOCK_TYPES.includes(node.type.name)) return;
        if (node.attrs && node.attrs.blockId) return;

        const newId = generateBlockId();
        console.warn('[ThinkForge] Missing blockId during deserialize; generated new id:', newId);

        tr = tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          blockId: newId,
        });
        modified = true;
      });

      return modified ? tr : null;
    },
  });
};

export const BlockIdentityExtension = Extension.create({
  name: 'blockIdentity',

  addStorage() {
    return {
      plugin: createBlockIdentityPlugin(),
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: BLOCK_TYPES,
        attributes: {
          blockId: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-block-id'),
            renderHTML: (attributes) => {
              if (!attributes.blockId) return {};
              return { 'data-block-id': attributes.blockId };
            },
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [this.storage.plugin];
  },
});
