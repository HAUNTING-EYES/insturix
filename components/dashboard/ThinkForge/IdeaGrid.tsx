"use client";
import React, { useEffect, useState } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import type { IdeaCardData } from "@/lib/thinkforge/state/types";
import {
  ThinkForgeAuthoringRequestSchema,
  describeThinkForgeAuthoringDeliverable,
  describeThinkForgePlatformSurface,
} from "@/lib/thinkforge/schemas/authoring-request";

interface IdeaGridProps {
  ideas: IdeaCardData[];
  loading: boolean;
  hasSubmitted: boolean;
  prompt: string;
  onSelect: (idea: IdeaCardData) => void;
  onRegenerate: () => void;
}

function formatDuration(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600} hr`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds}s`;
}

function describeIdeaContract(idea: IdeaCardData): {
  deliverable: string;
  platform: string;
  durationSec?: number;
} {
  if (idea.authoringRequest === undefined) {
    return {
      deliverable: idea.format,
      platform: idea.platform,
      ...(idea.durationSec !== undefined ? { durationSec: idea.durationSec } : {}),
    };
  }
  const request = ThinkForgeAuthoringRequestSchema.parse(idea.authoringRequest);
  return {
    deliverable: describeThinkForgeAuthoringDeliverable(request),
    platform: describeThinkForgePlatformSurface(request.platformSurface),
    ...(request.targetDurationSec !== undefined ? { durationSec: request.targetDurationSec } : {}),
  };
}

export const IdeaGrid: React.FC<IdeaGridProps> = ({ ideas, loading, hasSubmitted, prompt, onSelect, onRegenerate }) => {
  const [expandedIdea, setExpandedIdea] = useState<IdeaCardData | null>(null);

  useEffect(() => {
    setExpandedIdea(null);
  }, [ideas, loading]);

  if (!hasSubmitted) return null;

  return (
    <div className="ideas-view" id="s2" style={{ display: 'block' }}>
      <div className="echo-bar">
        <div className="echo-prompt" id="echoPrompt">{prompt}</div>
        <button className="echo-regen" onClick={onRegenerate} disabled={loading} aria-label="Generate a new set of ideas" title="Generate a new set of ideas"><RefreshCw className="h-4 w-4" /></button>
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
          ideas.map((idea, i) => {
            const contract = describeIdeaContract(idea);
            return (
            <div key={idea.id} className="idea-card" onClick={() => setExpandedIdea(idea)}>
              <div className="idea-card-head">
                <div className="dot-8" style={{ background: `var(--cat-${idea.tone === 'white' ? 'purple' : idea.tone === 'red' ? 'pink' : 'cyan'})` }}></div>
                <span className="mono">idea {i + 1}</span>
              </div>
              <h3>{idea.idea}</h3>
              <div className="meta">
                <strong>Output:</strong> {contract.deliverable}
              </div>
              <div className="idea-tags">
                <span className="idea-tag">{contract.platform}</span>
                {contract.durationSec !== undefined && <span className="idea-tag">{formatDuration(contract.durationSec)}</span>}
                {idea.tone && <span className="idea-tag">{idea.tone}</span>}
              </div>
            </div>
            );
          })
        )}
      </div>

      <div className={`idea-expand ${expandedIdea ? 'visible enter' : ''}`} id="ideaExpand">
        {expandedIdea && (
          <div className="expand-inner">
            <div className="expand-content">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span className="mono" style={{ color: 'var(--accent-gold)' }} id="expLabel">idea details</span>
                <div className="dot-8" id="expDot" style={{ background: `var(--cat-${expandedIdea.tone === 'white' ? 'purple' : expandedIdea.tone === 'red' ? 'pink' : 'cyan'})` }}></div>
                <span className="mono" style={{ color: 'var(--text-faint)', fontSize: '10px', marginLeft: 'auto' }}>edit title, purpose, or style</span>
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
                  <label>output</label>
                  <p id="expFormat">{describeIdeaContract(expandedIdea).deliverable}</p>
                </div>
                <div className="expand-field">
                  <label>platform</label>
                  <p id="expPlatform">{describeIdeaContract(expandedIdea).platform}</p>
                </div>
              </div>
            </div>
            <button className="start-btn" onClick={() => onSelect(expandedIdea)}>Start drafting <ArrowRight className="h-4 w-4" /></button>
          </div>
        )}
      </div>
    </div>
  );
};

export type { IdeaCardData } from "@/lib/thinkforge/state/types";
