import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import React from 'react';

export interface EditorialBlockOptions {
  HTMLAttributes: Record<string, unknown>;
}

const EDITORIAL_LABELS: Record<string, string> = {
  emotional_target: 'Emotional Target',
  instrumentation: 'Instrumentation',
  production_note: 'Production Note',
  style_guide: 'Style Guide',
  color_palette: 'Color Palette',
  pacing_note: 'Pacing',
  custom: 'Note',
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    editorialBlock: {
      setEditorialBlock: (attributes?: Record<string, unknown>) => ReturnType;
      toggleEditorialBlock: (attributes?: Record<string, unknown>) => ReturnType;
    };
  }
}

export const EditorialBlock = Node.create<EditorialBlockOptions>({
  name: 'editorialBlock',
  group: 'block',
  content: 'block+',
  defining: true,

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: el => el.getAttribute('data-id'),
        renderHTML: attrs => attrs.id ? { 'data-id': attrs.id } : {},
      },
      editorialType: {
        default: 'custom',
        parseHTML: el => el.getAttribute('data-editorial-type') || 'custom',
        renderHTML: attrs => ({ 'data-editorial-type': attrs.editorialType || 'custom' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="editorialBlock"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'editorialBlock',
        class: 'thinkforge-editorial-block',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setEditorialBlock: (attributes) => ({ commands }) => commands.wrapIn(this.name, attributes),
      toggleEditorialBlock: (attributes) => ({ commands }) => commands.toggleWrap(this.name, attributes),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(EditorialBlockView);
  },
});

interface EditorialBlockViewProps {
  node: {
    attrs: {
      id?: string;
      editorialType?: string;
    };
  };
  selected: boolean;
}

const EditorialBlockView: React.FC<EditorialBlockViewProps> = ({ node, selected }) => {
  const type = node.attrs.editorialType || 'custom';
  const label = EDITORIAL_LABELS[type] || type;

  return (
    <NodeViewWrapper
      className={`thinkforge-editorial-block ${selected ? 'selected' : ''}`}
      data-type="editorialBlock"
      data-editorial-type={type}
    >
      <div className="editorial-block-container">
        <div className="editorial-block-header">
          <span className="editorial-block-badge">{label}</span>
        </div>
        <NodeViewContent className="editorial-block-content" />
      </div>
    </NodeViewWrapper>
  );
};

export default EditorialBlock;
