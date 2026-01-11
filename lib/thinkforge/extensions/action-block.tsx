/**
 * ActionBlock Tiptap Extension
 * 
 * Custom block node for action/instruction content in ThinkForge scripts.
 * Renders with styling identical to the previous BlockNote appearance.
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import React from 'react';

// =============================================================================
// ACTION BLOCK NODE EXTENSION
// =============================================================================

export interface ActionBlockOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    actionBlock: {
      /**
       * Set an action block
       */
      setActionBlock: (attributes?: { id?: string; role?: string; goal?: string }) => ReturnType;
      /**
       * Toggle an action block
       */
      toggleActionBlock: (attributes?: { id?: string; role?: string; goal?: string }) => ReturnType;
    };
  }
}

export const ActionBlock = Node.create<ActionBlockOptions>({
  name: 'actionBlock',

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
        tag: 'div[data-type="actionBlock"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'actionBlock',
        class: 'thinkforge-action-block',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setActionBlock:
        (attributes) =>
        ({ commands }) => {
          return commands.wrapIn(this.name, attributes);
        },
      toggleActionBlock:
        (attributes) =>
        ({ commands }) => {
          return commands.toggleWrap(this.name, attributes);
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ActionBlockView);
  },
});

// =============================================================================
// ACTION BLOCK REACT VIEW COMPONENT
// =============================================================================

interface ActionBlockViewProps {
  node: {
    attrs: {
      id?: string;
      role?: string;
      goal?: string;
    };
  };
  selected: boolean;
}

const ActionBlockView: React.FC<ActionBlockViewProps> = ({ node, selected }) => {
  const { role, goal } = node.attrs;

  return (
    <NodeViewWrapper
      className={`thinkforge-action-block ${selected ? 'selected' : ''}`}
      data-type="actionBlock"
      data-role={role}
      data-goal={goal}
    >
      <div className="action-block-container">
        {/* Optional header showing role/goal */}
        {(role || goal) && (
          <div className="action-block-header">
            {role && <span className="action-block-role">{role}</span>}
            {goal && <span className="action-block-goal">{goal}</span>}
          </div>
        )}
        {/* Content area */}
        <NodeViewContent className="action-block-content" />
      </div>
    </NodeViewWrapper>
  );
};

export default ActionBlock;
