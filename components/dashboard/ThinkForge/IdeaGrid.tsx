"use client";
import React, { useState } from "react";
import { IdeaCardData } from "@/components/dashboard/ThinkForge/IdeaGrid";

interface IdeaGridProps {
  ideas: IdeaCardData[];
  loading: boolean;
  hasSubmitted: boolean;
  prompt: string;
  onSelect: (idea: IdeaCardData) => void;
}

export const IdeaGrid: React.FC<IdeaGridProps> = ({ ideas, loading, hasSubmitted, prompt, onSelect }) => {
  const [expandedIdea, setExpandedIdea] = useState<IdeaCardData | null>(null);

  if (!hasSubmitted) return null;

  return (
    <div className="ideas-view" id="s2" style={{ display: 'block' }}>
      <div className="echo-bar">
        <div className="echo-prompt" id="echoPrompt">{prompt}</div>
        <button className="echo-regen" onClick={() => window.location.reload()}>↻</button>
      </div>
      
      <div className="ideas-grid" id="ideasGrid">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="idea-card" style={{ opacity: 0.5 }}>
              <div className="idea-card-head">
                <div className="dot-8" style={{ background: 'var(--border-subtle)' }}></div>
                <span className="mono">Loading</span>
              </div>
              <h3>Generating idea...</h3>
            </div>
          ))
        ) : (
          ideas.map((idea, i) => (
            <div key={idea.id} className="idea-card" onClick={() => setExpandedIdea(idea)}>
              <div className="idea-card-head">
                <div className="dot-8" style={{ background: `var(--cat-${idea.tone === 'white' ? 'purple' : idea.tone === 'red' ? 'pink' : 'cyan'})` }}></div>
                <span className="mono">idea {i + 1}</span>
              </div>
              <h3>{idea.idea}</h3>
              <div className="meta">
                <strong>Format:</strong> {idea.format}
              </div>
              <div className="idea-tags">
                <span className="idea-tag">{idea.platform}</span>
                {idea.tone && <span className="idea-tag">{idea.tone}</span>}
              </div>
            </div>
          ))
        )}
      </div>

      <div className={`idea-expand ${expandedIdea ? 'visible enter' : ''}`} id="ideaExpand">
        {expandedIdea && (
          <div className="expand-inner">
            <div className="expand-content">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span className="mono" style={{ color: 'var(--accent-gold)' }} id="expLabel">idea details</span>
                <div className="dot-8" id="expDot" style={{ background: `var(--cat-${expandedIdea.tone === 'white' ? 'purple' : expandedIdea.tone === 'red' ? 'pink' : 'cyan'})` }}></div>
                <span className="mono" style={{ color: 'var(--text-faint)', fontSize: '10px', marginLeft: 'auto' }}>click any field to edit</span>
              </div>
              <div
                className="expand-title"
                id="expTitle"
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => setExpandedIdea({ ...expandedIdea, idea: e.currentTarget.textContent || expandedIdea.idea })}
                style={{ outline: 'none', cursor: 'text', borderBottom: '1px solid transparent', transition: 'border-color 0.15s' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(212,166,82,0.3)'; }}
                onBlurCapture={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'transparent'; }}
              >{expandedIdea.idea}</div>
              <div className="expand-grid">
                <div className="expand-field">
                  <label>purpose</label>
                  <p id="expPurpose" contentEditable suppressContentEditableWarning
                    onBlur={(e) => setExpandedIdea({ ...expandedIdea, purpose: e.currentTarget.textContent || expandedIdea.purpose })}
                    style={{ outline: 'none', cursor: 'text' }}
                  >{expandedIdea.purpose}</p>
                </div>
                <div className="expand-field">
                  <label>style</label>
                  <p id="expStyle" contentEditable suppressContentEditableWarning
                    onBlur={(e) => setExpandedIdea({ ...expandedIdea, style: e.currentTarget.textContent || expandedIdea.style })}
                    style={{ outline: 'none', cursor: 'text' }}
                  >{expandedIdea.style}</p>
                </div>
                <div className="expand-field">
                  <label>format</label>
                  <p id="expFormat" contentEditable suppressContentEditableWarning
                    onBlur={(e) => setExpandedIdea({ ...expandedIdea, format: e.currentTarget.textContent || expandedIdea.format })}
                    style={{ outline: 'none', cursor: 'text' }}
                  >{expandedIdea.format}</p>
                </div>
                <div className="expand-field">
                  <label>platform</label>
                  <p id="expPlatform" contentEditable suppressContentEditableWarning
                    onBlur={(e) => setExpandedIdea({ ...expandedIdea, platform: e.currentTarget.textContent || expandedIdea.platform })}
                    style={{ outline: 'none', cursor: 'text' }}
                  >{expandedIdea.platform}</p>
                </div>
              </div>
            </div>
            <button className="start-btn" onClick={() => onSelect(expandedIdea)}>Start drafting <span>→</span></button>
          </div>
        )}
      </div>
    </div>
  );
};

// Also define the types so other files don't break
export interface IdeaCardData {
  id: string;
  idea: string;
  purpose: string;
  style: string;
  format: string;
  platform: string;
  tone: string;
  sessionName?: string;
}

