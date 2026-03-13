"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { SidecarCard, SidecarCardAction } from "@/lib/thinkforge/state/types";
import {
  FileText, AlertTriangle, Lightbulb, Zap, CheckCircle, X,
  BookOpen, Eye, ChevronRight, Copy, ExternalLink, Sparkles
} from "lucide-react";

interface SidecarCardRendererProps {
  card: SidecarCard;
  onAction?: (action: SidecarCardAction) => void;
  onDismiss?: (cardId: string) => void;
}

const CARD_STYLES: Record<string, { icon: React.ComponentType<any>; iconColor: string; accentDot: string }> = {
  asset: { icon: BookOpen, iconColor: 'text-zinc-400', accentDot: 'bg-zinc-400' },
  context: { icon: Eye, iconColor: 'text-zinc-400', accentDot: 'bg-amber-500' },
  decision: { icon: Sparkles, iconColor: 'text-red-400', accentDot: 'bg-red-500' },
  error: { icon: AlertTriangle, iconColor: 'text-red-400', accentDot: 'bg-red-500' },
  action: { icon: Zap, iconColor: 'text-zinc-300', accentDot: 'bg-zinc-400' },
  suggestion: { icon: Lightbulb, iconColor: 'text-zinc-400', accentDot: 'bg-amber-500' },
  specialist_result: { icon: CheckCircle, iconColor: 'text-zinc-300', accentDot: 'bg-green-500' },
};

export function SidecarCardRenderer({ card, onAction, onDismiss }: SidecarCardRendererProps) {
  const style = CARD_STYLES[card.type] || CARD_STYLES.action;
  const Icon = style.icon;

  return (
    <div className="rounded-xl border border-white/8 bg-neutral-950/80 backdrop-blur-sm p-3 space-y-2.5 transition-all hover:border-white/12">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative shrink-0">
            <Icon className={cn("h-4 w-4", style.iconColor)} />
            <span className={cn("absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ring-1 ring-neutral-950", style.accentDot)} />
          </div>
          <span className="text-xs font-semibold text-white truncate">{card.title}</span>
        </div>
        {card.dismissible && onDismiss && (
          <button
            onClick={() => onDismiss(card.id)}
            className="p-0.5 rounded hover:bg-white/10 transition-colors"
          >
            <X className="h-3 w-3 text-zinc-600 hover:text-zinc-400" />
          </button>
        )}
      </div>

      {/* Body */}
      {card.body && (
        <p className="text-xs text-zinc-400 leading-relaxed">{card.body}</p>
      )}

      {/* Data Preview (type-specific) */}
      {card.data && <CardDataPreview type={card.type} data={card.data} />}

      {/* Actions */}
      {card.actions && card.actions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/5">
          {card.actions.map((action) => (
            <React.Fragment key={`${action.id}-${action.label}`}>
              <button
                onClick={() => {
                  const enriched = { ...action };
                  if (action.id === 'initialize_blueprint' && card.data?.artifacts) {
                    enriched.payload = { ...enriched.payload, artifacts: card.data.artifacts };
                  }
                  if (action.id === 'customize_blueprint') {
                    enriched.payload = { ...enriched.payload, artifacts: card.data?.artifacts, cardId: card.id };
                  }
                  onAction?.(enriched);
                }}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all",
                  action.variant === 'primary'
                    ? "bg-red-500/15 text-red-300 hover:bg-red-500/25 ring-1 ring-red-500/20"
                    : action.variant === 'destructive'
                    ? "bg-red-900/20 text-red-400 hover:bg-red-900/30 ring-1 ring-red-500/10"
                    : "bg-white/5 text-zinc-400 hover:bg-white/8 hover:text-zinc-300 ring-1 ring-white/5"
                )}
              >
                {action.label}
              </button>
              {action.id === 'initialize_blueprint' && card.data?.artifacts?.length > 0 && (
                <span className="text-[10px] text-zinc-500 font-medium px-1.5 py-0.5 rounded bg-white/4 border border-white/5">
                  {card.data.artifacts.length * 5} credits
                </span>
              )}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

function CardDataPreview({ type, data }: { type: string; data: Record<string, any> }) {
  switch (type) {
    case 'asset':
      return <AssetPreview data={data} />;
    case 'suggestion':
      return <SuggestionPreview data={data} />;
    case 'decision':
      return <DecisionPreview data={data} />;
    case 'specialist_result':
      return <SpecialistPreview data={data} />;
    default:
      return null;
  }
}

function AssetPreview({ data }: { data: Record<string, any> }) {
  const facts = data.atomicFacts || [];
  const hooks = data.viralHooks || [];

  return (
    <div className="space-y-2 rounded-lg border border-white/5 bg-white/2 p-2.5">
      {facts.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">
            Atomic Facts ({facts.length})
          </div>
          <div className="space-y-0.5">
            {facts.slice(0, 3).map((f: any, i: number) => (
              <div key={i} className="text-[11px] text-zinc-300 flex items-start gap-1.5">
                <span className="text-zinc-600 mt-0.5 shrink-0">•</span>
                <span className="line-clamp-2">{f.fact}</span>
              </div>
            ))}
            {facts.length > 3 && (
              <div className="text-[10px] text-zinc-600">+{facts.length - 3} more</div>
            )}
          </div>
        </div>
      )}
      {hooks.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">
            Viral Hooks ({hooks.length})
          </div>
          <div className="space-y-0.5">
            {hooks.slice(0, 2).map((h: any, i: number) => (
              <div key={i} className="text-[11px] text-zinc-300 flex items-start gap-1.5">
                <Zap className="h-3 w-3 text-zinc-500 mt-0.5 shrink-0" />
                <span className="line-clamp-2 italic">"{h.hook}"</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SuggestionPreview({ data }: { data: Record<string, any> }) {
  const score = data.overallScore;
  const flags = data.flags || [];
  const interrupts = data.patternInterrupts || [];

  const scoreColor = score >= 90 ? 'text-green-400' : score >= 60 ? 'text-amber-400' : 'text-red-400';
  const scoreBg = score >= 90 ? 'bg-green-500/10' : score >= 60 ? 'bg-amber-500/10' : 'bg-red-500/10';

  return (
    <div className="space-y-2 rounded-lg border border-white/5 bg-white/2 p-2.5">
      <div className="flex items-center gap-3">
        <div className={cn("text-lg font-bold px-2 py-0.5 rounded", scoreColor, scoreBg)}>{score}</div>
        <div className="text-[10px] text-zinc-500">
          {score >= 90 ? 'Sounds human' : score >= 60 ? 'Needs tweaks' : 'AI slop detected'}
        </div>
      </div>
      {flags.length > 0 && (
        <div className="text-[10px] text-zinc-600">
          {flags.length} voice flag{flags.length > 1 ? 's' : ''} · {interrupts.length} pattern interrupt{interrupts.length > 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}

function DecisionPreview({ data }: { data: Record<string, any> }) {
  const artifacts = data.artifacts || [];

  return (
    <div className="rounded-lg border border-white/5 bg-white/2 divide-y divide-white/5">
      {artifacts.map((a: any, i: number) => (
        <div key={i} className="flex items-center gap-2.5 text-[11px] px-2.5 py-1.5">
          <span className={cn(
            "w-1.5 h-1.5 rounded-full shrink-0",
            a.priority === 'required' ? 'bg-red-400' : a.priority === 'recommended' ? 'bg-amber-400' : 'bg-zinc-600'
          )} />
          <span className="text-zinc-200 font-medium flex-1">{a.label}</span>
          {a.description && <span className="text-zinc-600 text-[10px] truncate max-w-[120px]">{a.description}</span>}
        </div>
      ))}
    </div>
  );
}

function SpecialistPreview({ data }: { data: Record<string, any> }) {
  return (
    <div className="flex items-center gap-2 text-[11px] rounded-lg border border-white/5 bg-white/2 px-2.5 py-1.5">
      <FileText className="h-3 w-3 text-zinc-500" />
      <span className="text-zinc-400 flex-1">
        {data.persona} created a {data.documentType?.replace('_', ' ')} document
      </span>
      <ChevronRight className="h-3 w-3 text-zinc-600" />
    </div>
  );
}
