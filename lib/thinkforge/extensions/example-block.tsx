/**
 * ExampleBlock Tiptap Extension
 * 
 * Custom block node for example/code content in ThinkForge scripts.
 * Renders with styling identical to the previous BlockNote appearance (code-like).
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import React from 'react';

// =============================================================================
// EXAMPLE BLOCK NODE EXTENSION
// =============================================================================

export interface ExampleBlockOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    exampleBlock: {
      /**
       * Set an example block
       */
      setExampleBlock: (attributes?: { id?: string; language?: string | null; role?: string; goal?: string }) => ReturnType;
      /**
       * Toggle an example block
       */
      toggleExampleBlock: (attributes?: { id?: string; language?: string | null; role?: string; goal?: string }) => ReturnType;
    };
  }
}

export const ExampleBlock = Node.create<ExampleBlockOptions>({
  name: 'exampleBlock',

  group: 'block',

  content: '(paragraph | codeBlock)+',

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
      language: {
        default: null,
        parseHTML: element => element.getAttribute('data-language'),
        renderHTML: attributes => {
          if (!attributes.language) return {};
          return { 'data-language': attributes.language };
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
        tag: 'div[data-type="exampleBlock"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'exampleBlock',
        class: 'thinkforge-example-block',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setExampleBlock:
        (attributes) =>
        ({ commands }) => {
          return commands.wrapIn(this.name, attributes);
        },
      toggleExampleBlock:
        (attributes) =>
        ({ commands }) => {
          return commands.toggleWrap(this.name, attributes);
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ExampleBlockView);
  },
});

// =============================================================================
// EXAMPLE BLOCK REACT VIEW COMPONENT
// =============================================================================

interface ExampleBlockViewProps {
  node: {
    attrs: {
      id?: string;
      language?: string | null;
      role?: string;
      goal?: string;
    };
  };
  selected: boolean;
}

const ExampleBlockView: React.FC<ExampleBlockViewProps> = ({ node, selected }) => {
  const { language, role, goal } = node.attrs;

  return (
    <NodeViewWrapper
      className={`thinkforge-example-block ${selected ? 'selected' : ''}`}
      data-type="exampleBlock"
      data-language={language}
      data-role={role}
      data-goal={goal}
    >
      <div className="example-block-container">
        {/* Header with language indicator and optional role/goal */}
        <div className="example-block-header">
          {language && <span className="example-block-language">{language}</span>}
          {role && <span className="example-block-role">{role}</span>}
          {goal && <span className="example-block-goal">{goal}</span>}
        </div>
        {/* Content area - styled as code/example */}
        <NodeViewContent className="example-block-content" />
      </div>
    </NodeViewWrapper>
  );
};

export default ExampleBlock;
