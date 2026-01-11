/**
 * WhyBlock Tiptap Extension
 * 
 * Custom block node for explanation/reasoning content in ThinkForge scripts.
 * Renders with styling identical to the previous BlockNote appearance (quote-like).
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import React from 'react';

// =============================================================================
// WHY BLOCK NODE EXTENSION
// =============================================================================

export interface WhyBlockOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    whyBlock: {
      /**
       * Set a why block
       */
      setWhyBlock: (attributes?: { id?: string; role?: string; goal?: string }) => ReturnType;
      /**
       * Toggle a why block
       */
      toggleWhyBlock: (attributes?: { id?: string; role?: string; goal?: string }) => ReturnType;
    };
  }
}

export const WhyBlock = Node.create<WhyBlockOptions>({
  name: 'whyBlock',

  group: 'block',

  content: 'block+',

  defining: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: element => element.getAttribute('data-id'),
        renderHTML: attributes => {
          if (!attributes.id) return {};
          return { 'data-id': attributes.id };
        },
      },
      role: {
        default: null,
        parseHTML: element => element.getAttribute('data-role'),
        renderHTML: attributes => {
          if (!attributes.role) return {};
          return { 'data-role': attributes.role };
        },
      },
      goal: {
        default: null,
        parseHTML: element => element.getAttribute('data-goal'),
        renderHTML: attributes => {
          if (!attributes.goal) return {};
          return { 'data-goal': attributes.goal };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="whyBlock"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'whyBlock',
        class: 'thinkforge-why-block',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setWhyBlock:
        (attributes) =>
        ({ commands }) => {
          return commands.wrapIn(this.name, attributes);
        },
      toggleWhyBlock:
        (attributes) =>
        ({ commands }) => {
          return commands.toggleWrap(this.name, attributes);
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(WhyBlockView);
  },
});

// =============================================================================
// WHY BLOCK REACT VIEW COMPONENT
// =============================================================================

interface WhyBlockViewProps {
  node: {
    attrs: {
      id?: string;
      role?: string;
      goal?: string;
    };
  };
  selected: boolean;
}

const WhyBlockView: React.FC<WhyBlockViewProps> = ({ node, selected }) => {
  const { role, goal } = node.attrs;

  return (
    <NodeViewWrapper
      className={`thinkforge-why-block ${selected ? 'selected' : ''}`}
      data-type="whyBlock"
      data-role={role}
      data-goal={goal}
    >
      <div className="why-block-container">
        {/* Quote-style left border indicator */}
        <div className="why-block-border" />
        <div className="why-block-inner">
          {/* Optional header showing role/goal */}
          {(role || goal) && (
            <div className="why-block-header">
              {role && <span className="why-block-role">{role}</span>}
              {goal && <span className="why-block-goal">{goal}</span>}
            </div>
          )}
          {/* Content area - styled as quote/explanation */}
          <NodeViewContent className="why-block-content" />
        </div>
      </div>
    </NodeViewWrapper>
  );
};

export default WhyBlock;
