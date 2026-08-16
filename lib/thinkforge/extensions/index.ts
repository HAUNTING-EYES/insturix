/**
 * ThinkForge Tiptap Extensions Bundle
 * 
 * Complete extension set for the ThinkForge script editor.
 * Includes StarterKit, custom ThinkForge blocks, and all required marks.
 */

import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import { Extension } from '@tiptap/core';

// Custom ThinkForge block extensions
import { ActionBlock } from './action-block';
import { WhyBlock } from './why-block';
import { ExampleBlock } from './example-block';
import { SceneBlock } from './scene-block';
import { EditorialBlock } from './editorial-block';
import { BlockIdExtension } from './block-id';

// Re-export custom extensions
export { ActionBlock } from './action-block';
export { WhyBlock } from './why-block';
export { ExampleBlock } from './example-block';
export { SceneBlock } from './scene-block';
export { EditorialBlock } from './editorial-block';

// =============================================================================
// EXTENSION CONFIGURATION
// =============================================================================

export interface ThinkForgeEditorOptions {
  /** Placeholder text when editor is empty */
  placeholder?: string;
  /** Enable collaboration features (Y.js) - future */
  collaboration?: boolean;
  /** Custom link opening behavior */
  openLinkOnClick?: boolean;
}

/**
 * Default placeholder text for empty editor
 */
const DEFAULT_PLACEHOLDER = 'Start writing your script...';

// =============================================================================
// EXTENSION BUNDLE
// =============================================================================

/**
 * Get the complete set of Tiptap extensions for ThinkForge.
 * 
 * This includes:
 * - StarterKit (core nodes and marks, including configured underline and link marks)
 * - Highlight mark
 * - Placeholder extension
 * - Custom ThinkForge blocks (actionBlock, whyBlock, exampleBlock)
 */
export function getThinkForgeExtensions(options: ThinkForgeEditorOptions = {}): Extension[] {
  const {
    placeholder = DEFAULT_PLACEHOLDER,
    openLinkOnClick = false,
  } = options;

  return [
    // StarterKit provides most basic nodes and marks.
    // History/undo-redo is included by StarterKit defaults.
    StarterKit.configure({
      // Configure heading to only allow levels 1-3
      heading: {
        levels: [1, 2, 3],
      },
      // Configure blockquote
      blockquote: {
        HTMLAttributes: {
          class: 'thinkforge-blockquote',
        },
      },
      // Configure code block
      codeBlock: {
        HTMLAttributes: {
          class: 'thinkforge-code-block',
        },
      },
      // Configure lists
      bulletList: {
        HTMLAttributes: {
          class: 'thinkforge-bullet-list',
        },
      },
      orderedList: {
        HTMLAttributes: {
          class: 'thinkforge-ordered-list',
        },
      },
      listItem: {
        HTMLAttributes: {
          class: 'thinkforge-list-item',
        },
      },
      // Configure paragraph
      paragraph: {
        HTMLAttributes: {
          class: 'thinkforge-paragraph',
        },
      },
      underline: {
        HTMLAttributes: {
          class: 'thinkforge-underline',
        },
      },
      link: {
        openOnClick: openLinkOnClick,
        HTMLAttributes: {
          class: 'thinkforge-link',
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      },
      // Configure horizontal rule
      horizontalRule: {
        HTMLAttributes: {
          class: 'thinkforge-hr',
        },
      },
    }),

    // Stable block IDs for all top-level blocks
    BlockIdExtension,

    Highlight.configure({
      multicolor: true,
      HTMLAttributes: {
        class: 'thinkforge-highlight',
      },
    }),

    // Placeholder text
    Placeholder.configure({
      placeholder,
      emptyEditorClass: 'is-editor-empty',
      emptyNodeClass: 'is-node-empty',
    }),

    // Custom ThinkForge blocks
    ActionBlock.configure({
      HTMLAttributes: {
        class: 'thinkforge-action-block',
      },
    }),

    WhyBlock.configure({
      HTMLAttributes: {
        class: 'thinkforge-why-block',
      },
    }),

    ExampleBlock.configure({
      HTMLAttributes: {
        class: 'thinkforge-example-block',
      },
    }),

    // V2: Editron-ready structured blocks
    SceneBlock.configure({
      HTMLAttributes: {
        class: 'thinkforge-scene-block',
      },
    }),

    EditorialBlock.configure({
      HTMLAttributes: {
        class: 'thinkforge-editorial-block',
      },
    }),
  ] as Extension[];
}

// =============================================================================
// CSS CLASSES
// =============================================================================

/**
 * CSS classes used by ThinkForge Tiptap editor.
 * These classes should be styled to match the BlockNote appearance.
 */
export const THINKFORGE_CSS_CLASSES = {
  // Editor container
  editor: 'tiptap-editor-dark',
  editorContent: 'tiptap-editor-content',
  
  // Block nodes
  paragraph: 'thinkforge-paragraph',
  heading: 'thinkforge-heading',
  bulletList: 'thinkforge-bullet-list',
  orderedList: 'thinkforge-ordered-list',
  listItem: 'thinkforge-list-item',
  blockquote: 'thinkforge-blockquote',
  codeBlock: 'thinkforge-code-block',
  horizontalRule: 'thinkforge-hr',
  
  // Custom blocks
  actionBlock: 'thinkforge-action-block',
  whyBlock: 'thinkforge-why-block',
  exampleBlock: 'thinkforge-example-block',
  
  // Marks
  link: 'thinkforge-link',
  highlight: 'thinkforge-highlight',
  underline: 'thinkforge-underline',
  
  // States
  empty: 'is-editor-empty',
  selected: 'selected',
  focused: 'is-focused',
} as const;

// =============================================================================
// KEYBOARD SHORTCUTS
// =============================================================================

/**
 * Keyboard shortcuts for ThinkForge editor.
 * These match the standard Tiptap/ProseMirror shortcuts.
 */
export const KEYBOARD_SHORTCUTS = {
  // Text formatting
  bold: 'Mod-b',
  italic: 'Mod-i',
  underline: 'Mod-u',
  strike: 'Mod-Shift-x',
  code: 'Mod-e',
  
  // Block formatting
  heading1: 'Mod-Alt-1',
  heading2: 'Mod-Alt-2',
  heading3: 'Mod-Alt-3',
  bulletList: 'Mod-Shift-8',
  orderedList: 'Mod-Shift-7',
  blockquote: 'Mod-Shift-b',
  codeBlock: 'Mod-Alt-c',
  horizontalRule: 'Mod-Enter',
  
  // Actions
  undo: 'Mod-z',
  redo: 'Mod-Shift-z',
  
  // Custom ThinkForge blocks
  actionBlock: 'Mod-Shift-a',
  whyBlock: 'Mod-Shift-w',
  exampleBlock: 'Mod-Shift-e',
} as const;

// =============================================================================
// DEFAULT EDITOR CONTENT
// =============================================================================

/**
 * Default empty document for new scripts
 */
export const DEFAULT_EMPTY_DOCUMENT = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [],
    },
  ],
};

/**
 * Create a default document with initial content
 */
export function createDefaultDocument(title?: string): Record<string, unknown> {
  if (!title) {
    return DEFAULT_EMPTY_DOCUMENT;
  }

  return {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: title }],
      },
      {
        type: 'paragraph',
        content: [],
      },
    ],
  };
}
