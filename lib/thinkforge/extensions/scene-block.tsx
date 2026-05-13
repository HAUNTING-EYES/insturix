import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import React from 'react';

export interface SceneBlockOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sceneBlock: {
      setSceneBlock: (attributes?: Record<string, unknown>) => ReturnType;
      toggleSceneBlock: (attributes?: Record<string, unknown>) => ReturnType;
    };
  }
}

export const SceneBlock = Node.create<SceneBlockOptions>({
  name: 'sceneBlock',
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
      visualDescription: {
        default: '',
        parseHTML: el => el.getAttribute('data-visual-description') || '',
        renderHTML: attrs => attrs.visualDescription ? { 'data-visual-description': attrs.visualDescription } : {},
      },
      subjects: {
        default: '[]',
        parseHTML: el => el.getAttribute('data-subjects') || '[]',
        renderHTML: attrs => attrs.subjects ? { 'data-subjects': attrs.subjects } : {},
      },
      duration: {
        default: null,
        parseHTML: el => {
          const v = el.getAttribute('data-duration');
          return v ? Number(v) : null;
        },
        renderHTML: attrs => attrs.duration != null ? { 'data-duration': String(attrs.duration) } : {},
      },
      durationExplicit: {
        default: false,
        parseHTML: el => el.getAttribute('data-duration-explicit') === 'true',
        renderHTML: attrs => attrs.durationExplicit ? { 'data-duration-explicit': 'true' } : {},
      },
      mood: {
        default: '',
        parseHTML: el => el.getAttribute('data-mood') || '',
        renderHTML: attrs => attrs.mood ? { 'data-mood': attrs.mood } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="sceneBlock"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'sceneBlock',
        class: 'thinkforge-scene-block',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setSceneBlock: (attributes) => ({ commands }) => commands.wrapIn(this.name, attributes),
      toggleSceneBlock: (attributes) => ({ commands }) => commands.toggleWrap(this.name, attributes),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(SceneBlockView);
  },
});

interface SceneBlockViewProps {
  node: {
    attrs: {
      id?: string;
      visualDescription?: string;
      subjects?: string;
      duration?: number | null;
      durationExplicit?: boolean;
      mood?: string;
    };
  };
  selected: boolean;
}

const SceneBlockView: React.FC<SceneBlockViewProps> = ({ node, selected }) => {
  const { visualDescription, duration, mood } = node.attrs;
  let subjectList: Array<{ name: string; category: string }> = [];
  try {
    subjectList = JSON.parse(node.attrs.subjects || '[]');
  } catch { /* ignore */ }

  return (
    <NodeViewWrapper
      className={`thinkforge-scene-block ${selected ? 'selected' : ''}`}
      data-type="sceneBlock"
    >
      <div className="scene-block-container">
        <div className="scene-block-header">
          <span className="scene-block-badge">SCENE</span>
          {mood && <span className="scene-block-mood">{mood}</span>}
          {duration != null && <span className="scene-block-duration">{duration}s</span>}
        </div>
        {visualDescription && (
          <div className="scene-block-slot">
            <span className="scene-block-label">Visual</span>
            <span className="scene-block-value">{visualDescription}</span>
          </div>
        )}
        {subjectList.length > 0 && (
          <div className="scene-block-slot">
            <span className="scene-block-label">Subjects</span>
            <span className="scene-block-value">{subjectList.map(s => s.name).join(', ')}</span>
          </div>
        )}
        <div className="scene-block-narration">
          <span className="scene-block-label">Narration</span>
          <NodeViewContent className="scene-block-content" />
        </div>
      </div>
    </NodeViewWrapper>
  );
};

export default SceneBlock;
