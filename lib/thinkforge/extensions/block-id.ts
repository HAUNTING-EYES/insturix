import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import { nanoid } from 'nanoid';

const BLOCK_TYPES = ['paragraph', 'heading', 'actionBlock', 'whyBlock', 'exampleBlock'];

const blockIdPluginKey = new PluginKey('thinkforge-block-id');

const createBlockIdPlugin = () => {
  return new Plugin({
    key: blockIdPluginKey,
    appendTransaction: (transactions, _oldState, newState) => {
      if (!transactions.some((tr) => tr.docChanged)) return null;

      let tr = newState.tr;
      let modified = false;

      newState.doc.descendants((node, pos) => {
        if (!node.isBlock) return;
        if (!BLOCK_TYPES.includes(node.type.name)) return;
        if (node.attrs && node.attrs.id) return;

        tr = tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          id: `blk_${nanoid(12)}`,
        });
        modified = true;
      });

      return modified ? tr : null;
    },
  });
};

export const BlockIdExtension = Extension.create({
  name: 'blockId',

  addStorage() {
    return {
      plugin: createBlockIdPlugin(),
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: BLOCK_TYPES,
        attributes: {
          id: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-id'),
            renderHTML: (attributes) => {
              if (!attributes.id) return {};
              return { 'data-id': attributes.id };
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
