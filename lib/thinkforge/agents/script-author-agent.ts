import { BaseAgent, type AgentConfig } from './base-agent';
import type { AgentInput } from './types';
import type { NarrativeContract } from './script-contract-agent';
import type { ScriptOutline } from './script-outline-agent';
import type { ThinkForgeBlock } from '../schemas/thinkforge-block';
import { ScriptIntent, type AgentScriptResponse } from '../protocol/intent';
import { parseAgentJson } from '../protocol/parse-agent-json';
import { selectAllTechniques, selectTechniques, getConstraints, type TechniqueResult } from '../data/writing-graph-query';
import { extractSignalsFromContext } from '../data/extract-signals';
import {
  formatContentSignalProfileForPrompt,
  type ThinkForgeContentSignalProfile,
} from '../signals';

export interface ScriptAuthorInput extends AgentInput {
  outline?: ScriptOutline;
  contract?: NarrativeContract;
  documentType?: string;
  contentSignalProfile?: ThinkForgeContentSignalProfile;
}

export interface ScriptAuthorIntentInput extends AgentInput {
  intent: ScriptIntent;
  instruction: string;
  currentScript?: ThinkForgeBlock[];
  recentBlocks?: ThinkForgeBlock[];
  documentType?: string;
  contentSignalProfile?: ThinkForgeContentSignalProfile;
}

interface DocumentRoleProfile {
  role: string;
  executionTest: string;
  outputFeeling: string;
  sectionGuidance: string;
  defaultVoice: string;
  defaultMedium: string;
}

function inferRoleFromContext(projectSummary: string, userPrompt: string, explicitDocType?: string): DocumentRoleProfile {
  const docType = (explicitDocType || '').toLowerCase();
  const userLower = userPrompt.toLowerCase();
  const combined = `${projectSummary} ${userPrompt}`.toLowerCase();

  // Post/article/text content — check USER PROMPT first (overrides project context).
  // A user asking "write a LinkedIn post" means a post, even if the project is about video.
  if (docType === 'post' || docType === 'article' || /\b(linkedin\s*post|twitter\s*post|x\s*post|instagram\s*caption|facebook\s*post|social\s*media\s*post|blog\s*post|article|newsletter|email\s*campaign|email\s*copy|carousel\s*post)\b/i.test(userLower)) {
    return {
      role: 'a Senior Content Strategist and Copywriter',
      executionTest: 'A social media manager should be able to say: "I can publish this immediately — it fits the platform, hooks the audience, and drives the action I need."',
      outputFeeling: 'a polished, platform-ready post or article — not a brief, not a script, not an outline',
      sectionGuidance: '- Write the FINAL copy. Not a script. Not production notes. The actual words that will be published.\n- No scene headings. No **Visual:** or **Narration:** labels. This is TEXT content.\n- Use markdown for emphasis (**bold**, *italic*) but keep formatting minimal.\n- Match the platform voice: LinkedIn is professional-conversational, Twitter is punchy, Instagram is visual-first captions.',
      defaultVoice: 'author',
      defaultMedium: 'post',
    };
  }

  if (docType === 'character_bible' || /character|backstor|bible|arc|motivation|relationship/i.test(combined)) {
    return {
      role: 'a Senior Narrative Designer and Character Architect',
      executionTest: 'A writer should be able to say: "I know exactly who this character is and how they behave."',
      outputFeeling: 'a professional character bible, narrative profile, or story design document',
      sectionGuidance: '- Use sections like: Background, Motivation, Personality, Relationships, Arc, Key Quotes, Visual Description.',
      defaultVoice: 'narrator',
      defaultMedium: 'written_document',
    };
  }
  if (docType === 'world_bible' || /world|universe|physics|lore|history|rules|magic system/i.test(combined)) {
    return {
      role: 'a Senior Worldbuilder and Lore Architect',
      executionTest: 'A creator should be able to say: "I know exactly how this world works and its rules."',
      outputFeeling: 'an encyclopedic worldbuilding bible or lore document',
      sectionGuidance: '- Use sections like: Overview, Rules/Physics, History, Geography, Factions, Key Locations, Edge Cases.',
      defaultVoice: 'historian',
      defaultMedium: 'written_document',
    };
  }
  if (docType === 'vfx_brief' || /vfx|visual effect|cgi|composite|green ?screen/i.test(combined)) {
    return {
      role: 'a Senior VFX Supervisor and Technical Director',
      executionTest: 'A VFX artist should be able to say: "I know exactly what needs to be built and composited."',
      outputFeeling: 'a professional VFX brief, technical specification, or effects breakdown',
      sectionGuidance: '- Use sections like: Scene, Effect Description, Technical Requirements, Reference, Complexity, Dependencies.',
      defaultVoice: 'technical_lead',
      defaultMedium: 'technical_brief',
    };
  }
  if (docType === 'budget' || /budget|cost|financ|resource|crew|location|schedul/i.test(combined)) {
    return {
      role: 'a Senior Line Producer and Production Planner',
      executionTest: 'A producer should be able to say: "I know exactly what this costs and what resources I need."',
      outputFeeling: 'a professional production budget, resource plan, or cost breakdown',
      sectionGuidance: '- Use sections like: Summary, Line Items, Cost Breakdown, Resources, Timeline, Contingency.\n- Use tables where appropriate for costs and quantities.',
      defaultVoice: 'producer',
      defaultMedium: 'production_plan',
    };
  }
  if (docType === 'interview_questions' || /interview|question|subject|testimony/i.test(combined)) {
    return {
      role: 'a Senior Documentary Producer and Interview Director',
      executionTest: 'An interviewer should be able to say: "I know exactly what to ask and in what order."',
      outputFeeling: 'a professional interview guide, question deck, or documentary prep doc',
      sectionGuidance: '- Use sections like: Subject Profile, Opening Questions, Deep-Dive Questions, Emotional Beats, Closing, Follow-Ups.',
      defaultVoice: 'interviewer',
      defaultMedium: 'interview_guide',
    };
  }
  // Video: check USER PROMPT (not combined) with broad regex. Post detection already ran,
  // so "post about video" is filtered. "video" in user prompt = production intent.
  // "video" only in project summary = NOT production intent (falls through to generic).
  if (docType === 'video_script' || /video|ad\b|commercial|reel|short[- ]?form|youtube|tiktok|brand[- ]?film|product[- ]?ad|ugc/i.test(userLower)) {
    return {
      role: 'a Senior Creative Director and Video Scriptwriter',
      executionTest: 'A video editor should be able to say: "I know exactly what to show, say, and hear in every second."',
      outputFeeling: 'a professional video production script with scene-by-scene direction',
      sectionGuidance: `- This is a VIDEO SCRIPT. Follow the <output_format> block EXACTLY for per-scene structure.
- Think like a director: for every line of narration, ask "what do I SHOW while these words are spoken?"
- Each scene = one distinct visual moment. Two visuals = two scenes.
- The VO text IS the product. Visual direction SERVES the narration.
- Be SPECIFIC. Not "a person looks worried" but "freelancer stares at phone, jaw tight, laptop light on face."`,
      defaultVoice: 'voiceover',
      defaultMedium: 'video_script',
    };
  }
  if (docType === 'shot_list' || /shot ?list|storyboard|pre-?viz|visual plan/i.test(combined)) {
    return {
      role: 'a Senior Storyboard Artist and Cinematographer',
      executionTest: 'A filmmaker should be able to say: "I know exactly what shots to capture and how to frame them."',
      outputFeeling: 'a professional shot list, storyboard document, or visual plan',
      sectionGuidance: '- Use sections like: Shot Number, Description, Camera, Framing, Motion, Duration, Audio, Transition.\n- Use labels like: "Purpose:", "Shot:", "Camera:", "Framing:", "Motion:", "Lighting:", "Audio:", "Timing:", "Feeling:".',
      defaultVoice: 'director',
      defaultMedium: 'visual_plan',
    };
  }
  if (docType === 'score_direction' || /score\s*direction|soundtrack\s*brief|music\s*(brief|supervision|cue)|cue\s*sheet|composer\s*(brief|notes)/i.test(combined)) {
    return {
      role: 'a Senior Music Supervisor and Score Director',
      executionTest: 'A composer should be able to say: "I know exactly what emotion and texture each cue needs."',
      outputFeeling: 'a professional score direction document or music brief',
      sectionGuidance: '- Use sections like: Scene/Moment, Emotional Target, Genre/Style, Instrumentation, Tempo, Reference Tracks, Transition Notes.',
      defaultVoice: 'music_director',
      defaultMedium: 'score_direction',
    };
  }
  if (docType === 'research_brief' || /research|analysis|seo|repurpos|competitor/i.test(combined)) {
    return {
      role: 'a Senior Content Strategist and Research Analyst',
      executionTest: 'A content creator should be able to say: "I know exactly what angles to pursue and why."',
      outputFeeling: 'a professional research brief, content strategy deck, or competitive analysis',
      sectionGuidance: '- Use sections like: Executive Summary, Key Findings, Opportunities, Competitive Landscape, Recommendations, Data Sources.',
      defaultVoice: 'strategist',
      defaultMedium: 'research_brief',
    };
  }

  return {
    role: 'a Senior Creative Director and Production Strategist',
    executionTest: 'A creator should be able to say: "I know exactly what to make and how to execute it."',
    outputFeeling: 'a professional creative brief, production document, or strategy deck',
    sectionGuidance: '- Use natural section formats appropriate to the project type.\n- Frequently use labels like: "Purpose:", "Direction:", "Why this works:", "Note:".',
    defaultVoice: 'director',
    defaultMedium: 'voiceover',
  };
}

// ─── Platform Detection (userPrompt-first, docType fallback, default linkedin) ──

export type PlatformType = 'linkedin' | 'twitter' | 'instagram' | 'facebook' | 'generic';

interface PlatformConfig {
  name: string;
  charTarget: string;
  charMax: string;
  foldChars: number;
  hashtagRange: string;
  extraGuidance: string;
}

const PLATFORM_CONFIGS: Record<PlatformType, PlatformConfig> = {
  linkedin: {
    name: 'LinkedIn',
    charTarget: '1,300-1,900',
    charMax: '3,000',
    foldChars: 210,
    hashtagRange: '3-5',
    extraGuidance: 'Professional-conversational tone. Line breaks for rhythm. One-liners for punch.',
  },
  twitter: {
    name: 'Twitter/X',
    charTarget: '200-280',
    charMax: '280',
    foldChars: 280,
    hashtagRange: '1-2',
    extraGuidance: 'Punchy, direct. Every word counts. Thread format if content exceeds 280 chars.',
  },
  instagram: {
    name: 'Instagram',
    charTarget: '1,000-2,200',
    charMax: '2,200',
    foldChars: 125,
    hashtagRange: '5-10',
    extraGuidance: 'Visual-first language. Emoji sparingly. Caption supports the image.',
  },
  facebook: {
    name: 'Facebook',
    charTarget: '400-800',
    charMax: '63,206',
    foldChars: 477,
    hashtagRange: '1-3',
    extraGuidance: 'Conversational. Can be longer but front-load the value.',
  },
  generic: {
    name: 'social media',
    charTarget: '1,300-1,900',
    charMax: '3,000',
    foldChars: 210,
    hashtagRange: '3-5',
    extraGuidance: 'Professional-conversational. Platform-agnostic but engagement-focused.',
  },
};

export function detectPlatform(userPrompt: string, docType?: string, projectSummary?: string): PlatformType {
  const lower = userPrompt.toLowerCase();
  if (/\blinkedin\b/.test(lower)) return 'linkedin';
  if (/\btwitter\b|\btweet\b|\bx\s+post\b|\bx\s+thread\b/.test(lower)) return 'twitter';
  if (/\binstagram\b/.test(lower)) return 'instagram';
  if (/\bfacebook\b/.test(lower)) return 'facebook';
  const dt = (docType || '').toLowerCase();
  if (dt.includes('linkedin')) return 'linkedin';
  if (dt.includes('twitter') || dt.includes('tweet')) return 'twitter';
  if (dt.includes('instagram')) return 'instagram';
  if (dt.includes('facebook')) return 'facebook';
  // Check project summary for platform set via UI picker
  const ps = (projectSummary || '').toLowerCase();
  if (/platform:\s*linkedin/i.test(ps)) return 'linkedin';
  if (/platform:\s*(twitter|x)/i.test(ps)) return 'twitter';
  if (/platform:\s*instagram/i.test(ps)) return 'instagram';
  if (/platform:\s*facebook/i.test(ps)) return 'facebook';
  if (/post|social/i.test(dt)) return 'linkedin';
  return 'generic';
}

export class ScriptAuthorAgent extends BaseAgent {
  constructor(config?: Partial<Omit<AgentConfig, 'agentType'>>) {
    super({
      ...config,
      agentType: 'script_author',
      modelName: config?.modelName ?? 'gemini-2.5-flash',
      maxTokens: config?.maxTokens ?? 4096,
      temperature: config?.temperature ?? 0.7,
    });
  }

  // ─── Writing Knowledge Injection ──────────────────────────────────
  private buildWritingKnowledgeBlock(
    signals: Partial<import('../../shared/signals/types').CreativeSignals>,
  ): string {
    try {
      const techniqueMap = selectAllTechniques(signals, 2);
      const antiAiConstraints = getConstraints('Anti-AI Constraints');

      if (techniqueMap.size === 0 && antiAiConstraints.length === 0) {
        console.log('[ThinkForge:WritingKnowledge] No techniques or constraints matched. Signals provided:', Object.keys(signals).length);
        return '';
      }

      const lines: string[] = ['<writing_knowledge>'];
      let techniqueCount = 0;

      techniqueMap.forEach((techniques: TechniqueResult[], category: string) => {
        const top = techniques[0];
        if (!top) return;
        techniqueCount++;
        lines.push(`${category.toUpperCase()}: ${top.id}`);
        if (top.primary) lines.push(`  DO: ${top.primary}`);
        if (top.example) lines.push(`  EXAMPLE: ${top.example}`);
        if (top.why) lines.push(`  WHY: ${top.why}`);
        if (top.antiPatterns && top.antiPatterns.length > 0) {
          lines.push(`  NEVER: ${top.antiPatterns.join(' | ')}`);
        }
      });

      lines.push('');
      lines.push('QUALITY: Be SPECIFIC (not "saves time" but "cuts 3-hour edits to 12 min"). Vary sentence rhythm. No AI filler.');

      lines.push('</writing_knowledge>');
      console.log(`[ThinkForge:WritingKnowledge] Injected ${techniqueCount} techniques + ${antiAiConstraints.length} constraints`);
      return lines.join('\n');
    } catch (e) {
      console.error('[ThinkForge:WritingKnowledge] Failed to build knowledge block:', e);
      return '';
    }
  }

  private buildContentSignalProfileBlock(profile?: ThinkForgeContentSignalProfile): string {
    if (!profile) return '';
    return `${formatContentSignalProfileForPrompt(profile)}

<signal_execution_rules>
- Treat content_signal_profile as the source of truth for format, platform, audience, goal, tone, proof, constraints, and visual/export needs.
- Use brand_context for supporting evidence and voice texture, but do not override explicit resolved signals.
- If the user's request conflicts with a resolved hard constraint, obey the hard constraint and keep the output useful.
- Do not mention the content_signal_profile or these internal rules in the final output.
</signal_execution_rules>`;
  }

  // ─── Output Format (RC1+RC2: signal-driven, not hardcoded) ────────
  private buildOutputFormatBlock(params: {
    documentType?: string;
    medium?: string;
    signals: Partial<import('../../shared/signals/types').CreativeSignals>;
    userPrompt?: string;
    projectSummary?: string;
    platform?: string;
  }): string {
    const { documentType, medium, signals, userPrompt, projectSummary, platform: resolvedPlatform } = params;
    const docType = (documentType || medium || '').toLowerCase();

    const isVideo = /video|film|ad|commercial|reel|short.?form|youtube|tiktok|ugc/i.test(docType);
    const isShotList = /shot.?list|storyboard|pre.?viz/i.test(docType);
    const isPost = /post|linkedin|twitter|instagram|facebook|social/i.test(docType) ||
      /\b(linkedin|twitter|tweet|instagram|facebook|post)\b/i.test(userPrompt || '');

    if (!isVideo && !isShotList && isPost) {
      const platform = detectPlatform([userPrompt, resolvedPlatform].filter(Boolean).join(' '), docType, projectSummary);
      const config = PLATFORM_CONFIGS[platform];
      console.log(`[ThinkForge:Platform] Detected: ${platform} from ${userPrompt ? 'userPrompt' : 'docType'}`);

      return `<output_format>
Write the ACTUAL publishable ${config.name} post. Not a brief. Not production notes. Not an outline ABOUT the content. The FINAL COPY.

Follow these steps IN ORDER:

STEP 1 — HOOK (first ${config.foldChars} characters)
  Write a specific, arresting first line that earns the click to "see more."
  Rules:
  - Must contain a specific claim, number, or named entity. NOT a generic opener.
  - NO "In today's...", "Have you ever...", "It's no secret...", "Let me tell you..."
  - The first ${config.foldChars} characters are visible before the fold. Front-load value.

STEP 2 — BODY
  Develop 2-4 short paragraphs. Each paragraph max 3 sentences.
  Rules:
  - Vary sentence length. Mix 4-word punches with 15-word explanations.
  - Be SPECIFIC. Not "saves time" but "cuts 3-hour edits to 12 minutes."
  - Replace abstract claims with measurable ones. NOT "fundamentally changes workflows" but "cuts revision cycles from 8 hours to 30 minutes." NOT "empowers teams" but "frees editors to spend 4x more time on creative work."
  - One-liners between paragraphs for rhythm and emphasis.
  - NO section headings (##). This is a post, not a document.
  - NO production notes, visual direction, or "Scene" labels.

STEP 3 — CTA (call to action)
  End with ONE specific engagement prompt.
  Rules:
  - Ask a SPECIFIC question. NOT "What do you think?" or "Thoughts?"
  - Example: "What's the one tool your team adopted that actually stuck?"
  - OR a specific repost prompt tied to the content.

STEP 4 — HASHTAGS (REQUIRED — post is incomplete without this)
  Add ${config.hashtagRange} hashtags at the very end.
  Rules:
  - Mix: 1 broad, 1-2 niche, 1 topic-specific.
  - Hashtags go on their own line after the CTA.
  - If you run long, CUT body paragraphs to make room. Never skip hashtags.

PLATFORM CONSTRAINTS (${config.name}):
  - Target: ${config.charTarget} characters. Platform max: ${config.charMax}.
  - ${config.extraGuidance}

QUALITY:
  - Write like a specific human who has opinions and experience. NOT a brand voice generator.
  - Use the vocabulary of someone who DOES this work, not someone who WRITES ABOUT this work.
  - Every paragraph must earn its place. If you can delete it and nothing is lost, delete it.

VERIFY BEFORE OUTPUT — check ALL before returning:
  ✓ First line has a specific claim/number/entity (not generic opener)?
  ✓ Total character count in range ${config.charTarget}? (estimate)
  ✓ CTA asks a SPECIFIC question (not "what do you think?")?
  ✓ ${config.hashtagRange} hashtags present?
  ✓ Zero corporate/AI buzzwords? (no "leverage", "synergy", "game-changer", "cutting-edge", etc.)
  ✓ Sentence length varies (not all same rhythm)?
  ✓ Does this match the voice described in <brand_context>? (if brand context provided)
</output_format>`;
    }

    if (!isVideo && !isShotList) {
      return `<output_format>
Write the ACTUAL publishable text. Not a brief. Not production notes. Not an outline ABOUT the content. The FINAL COPY.

DOCUMENT FORMAT:
  - Use ## for sections, ### for sub-sections.
  - Write for the reader, not for a system.

RULES:
  - Sound like a specific human with a point of view, not a brand voice generator.
  - Every paragraph must earn its place. If you can delete it and nothing is lost, delete it.
  - Be SPECIFIC. Not "many companies struggle" but "your onboarding takes 3 weeks and costs $4,200 per hire."
</output_format>`;
    }

    if (isShotList) {
      return `<output_format>
Return Markdown. Use ## for scene groups, ### for individual shots.
Labels per shot: **Shot:**, **Camera:**, **Framing:**, **Motion:**, **Audio:**, **Duration:**.
</output_format>`;
    }

    // No profile-specific label locking. All narration options available per scene.
    // The writing knowledge techniques guide the LLM's choice per scene.

    return `<output_format>
Return Markdown only. No JSON. No block IDs.

STEP 1 — Estimate total duration from the brief. Divide into 3-6 scenes with timing.
STEP 2 — Write the Music Direction section.
STEP 3 — For EACH scene, write ALL 7 labeled elements. Check: do I have spoken words, visual, audio, text, mood, transition? If any is missing, add it before moving to the next scene.

MUSIC DIRECTION — Write this FIRST, before any scenes:
  ## Music Direction
  **Style:** genre + mood + 1-2 reference tracks (real songs/artists)
  **Tempo:** BPM range or feel
  **Arc:** where it builds, where it drops, where it is ABSENT (silence is a choice)

SCENE HEADING FORMAT (mandatory — no exceptions):
  ## [0:00-0:08] Scene 1: The Hook
  The [start-end] timing bracket is REQUIRED on every scene heading.

PER-SCENE ELEMENTS (all 7 required on every scene, each on its own bold-labeled line):

  1. SPOKEN WORDS — choose the right label PER SCENE:
     **VO (delivery note):** voiceover over footage. e.g., "VO (dry, measured):"
     **On-Camera (delivery note):** someone speaking to camera. e.g., "On-Camera (casual, direct):"
     **Text Overlay:** no spoken words — visuals + text carry the message.
     A single video can MIX these across scenes.
  2. **Visual:** camera ACTION + shot type. NOT feelings — ACTIONS. "stares at phone, jaw tight" not "looks worried."
  3. **Audio:** sound design — room tone, SFX, silence, OR music modulation. Silence is valid.
  4. **Text:** on-screen text OR "[none — the image carries it]"
  5. **Mood:** one film/scene reference. "Think Whiplash opening." Removes ambiguity adjectives cannot.
  6. **Transition:** hard cut | dissolve | hold on black 0.5s | match cut to [what]. VARY these.

BANNED PHRASES (never use, zero tolerance):
  "let's dive in", "game-changer", "cutting-edge", "seamless", "robust", "innovative",
  "leverage", "unlock", "empower", "in today's fast-paced world", "at the end of the day",
  "it's important to note", "work its magic", "circle back", "take it to the next level"

SPECIFICITY: Not "a workspace" but "MacBook with 14 Chrome tabs, cold coffee, 2am."

VERIFY BEFORE OUTPUT:
  ✓ Does every scene have ## [time] heading + all 7 labeled elements? If not, fix it now.
  ✓ If the brief says "talking head", "direct to camera", or "to camera": did you use **On-Camera** labels (not VO)? VO is for off-screen narration over footage. On-Camera is someone speaking to the lens.
  ✓ Does this match the voice described in <brand_context>? (if brand context provided)
</output_format>`;
  }

  // ─── Shared prompt core (Rule 35: XML structure, DRY) ─────────────
  // Extracted from the two previously-duplicated builders.
  // Both buildStructuredPrompt and buildPrompt call this for the common
  // role/task/rules/contract/outline sections, then append their own
  // output format block.
  private buildCorePromptBlock(params: {
    roleProfile: DocumentRoleProfile;
    projectSummary: string;
    userRequest: string;
    contract?: NarrativeContract;
    outlineSummary: string;
    outlineTitle?: string;
    brandBlock?: string; // XML brand context from buildBrandContextBlock()
    signalBlock?: string;
  }): string {
    const { roleProfile, projectSummary, userRequest, contract, outlineSummary, outlineTitle, brandBlock, signalBlock } = params;

    const contractBlock = contract
      ? `<contract>
Narrative voice: ${contract.narrator_voice || roleProfile.defaultVoice}
Tone: ${contract.tone || 'confident'}
Medium: ${contract.medium || roleProfile.defaultMedium}
Style notes: ${(contract.style_notes || []).map((n) => `- ${n}`).join('\n') || '- (none)'}
Forbidden: ${(contract.forbidden || []).map((n) => `- ${n}`).join('\n') || '- (none)'}
</contract>`
      : '';

    return `<role>
You are ${roleProfile.role}.
You create documents that tell another professional exactly what to do or make.
Your job is not to write essays. Your job is to translate ideas into clear, executable direction.
${roleProfile.executionTest}
Your output must feel like ${roleProfile.outputFeeling}.
</role>

<task>
Project: ${projectSummary || '(No project context)'}
User request: ${userRequest}
</task>

${contractBlock}

${signalBlock || ''}
${brandBlock || ''}
<rules>
RULE 1 — CONTENT QUALITY:
- Every output must be usable by a professional without interpretation.
- If the document feels like prose instead of actionable content, it is incorrect.
- Documents must be modular and scannable. Prefer short sections over long narrative blocks.
- Headings are structural anchors, not literary chapter titles.
- Content must be written for reuse, clarity, and execution.
- Do NOT start with an H1 title heading — the system renders the title separately. Begin directly with the content.
${roleProfile.sectionGuidance}

RULE 2 — WHAT NOT TO DO:
- Do NOT write long continuous prose blocks or narrative essays.
- Do NOT write philosophical commentary.
- Do NOT prioritize emotional language over clarity.
- Do NOT write to impress. Write to enable execution.
- Do NOT mention internal systems, schemas, or validation rules.
- It must never feel like an article, blog post, or verbose AI ramble.

RULE 3 — OUTLINE GUIDANCE:
${outlineSummary}
</rules>`;
  }

  private buildStructuredPrompt(input: ScriptAuthorIntentInput): string {
    if (input.intent === ScriptIntent.FORK) {
      throw new Error('ScriptAuthorAgent does not support FORK intent');
    }

    const { context, instruction, intent } = input;
    const currentBlocks = Array.isArray(input.currentScript) ? input.currentScript : [];
    const recentBlocks = Array.isArray(input.recentBlocks) ? input.recentBlocks : [];

    const serializedCurrent = currentBlocks.length > 0
      ? JSON.stringify(currentBlocks, null, 2)
      : '[]';
    const serializedRecent = recentBlocks.length > 0
      ? JSON.stringify(recentBlocks, null, 2)
      : '[]';

    const intentGuidance = (() => {
      switch (intent) {
        case ScriptIntent.REWRITE:
          return `INTENT: REWRITE\nYou must return {"mode":"replace","blocks":[...]} with a full replacement.`;
        case ScriptIntent.CONTINUE:
          return `INTENT: CONTINUE\nYou must return {"mode":"insert","position":{"atEnd":true},"blocks":[...]} with only new blocks.`;
        case ScriptIntent.EDIT:
          return `INTENT: EDIT\nYou must return {"mode":"patch","patches":[{"blockId":"...","content":[...]}]} referencing existing blockIds.`;
        default:
          return 'INTENT: EDIT';
      }
    })();

    const scriptContextBlock = intent === ScriptIntent.EDIT
      ? `Current script blocks (with blockIds):\n${serializedCurrent}`
      : intent === ScriptIntent.CONTINUE
        ? `Recent blocks (with blockIds):\n${serializedRecent}`
        : '';

    const outline = (input as any).outline as ScriptOutline | undefined;
    const contract = (input as any).contract as NarrativeContract | undefined;
    const outlineSummary = outline
      ? outline.sections.map((s) => `- ${s.title}: ${s.goal}`).join('\n')
      : 'None';

    const contentSignalProfile = input.contentSignalProfile;
    const resolvedDocumentType = input.documentType ?? contentSignalProfile?.profile.constraints.output_format;
    const roleProfile = inferRoleFromContext(context.projectSummary || '', instruction, resolvedDocumentType);
    const signalBlock = this.buildContentSignalProfileBlock(contentSignalProfile);

    // Brand context: use systemBrief from ThinkForge's 3-tier retrieval (BrandDNA, facts, patterns)
    const brandBlock = context.systemBrief
      ? `<brand_context>\n${context.systemBrief}\n</brand_context>`
      : '';

    const core = this.buildCorePromptBlock({
      roleProfile,
      projectSummary: context.projectSummary || '',
      userRequest: instruction,
      contract,
      outlineSummary,
      outlineTitle: outline?.title,
      brandBlock,
      signalBlock,
    });

    return `${core}

${intentGuidance}

${scriptContextBlock}

OUTPUT FORMAT REQUIREMENTS:
- You must output valid JSON matching the AgentScriptResponse schema.
- Do not include markdown.
- Do not include commentary.
- Do not include backticks.
- The response must be a single JSON object.

${contract ? `Narrative voice: ${contract.narrator_voice || roleProfile.defaultVoice}
Tone: ${contract.tone || 'confident'}
Medium: ${contract.medium || roleProfile.defaultMedium}

Style notes:
${(contract.style_notes || []).map((n) => `- ${n}`).join('\n') || '- (none)'}

Forbidden:
${(contract.forbidden || []).map((n) => `- ${n}`).join('\n') || '- (none)'}
` : ''}

Outline (for guidance only):
${outlineSummary}

## Output Requirements
- Return JSON only. No Markdown.
- Include blockIds in patches.
- Headings are structural anchors, not literary chapter titles.
- Use this as the H1 title when possible: ${outline?.title || 'Use a clear, professional title'}
${roleProfile.sectionGuidance}
${['vfx_brief', 'budget', 'shot_list', 'research'].includes(input.documentType || '')
  ? `- Documents must be modular and scannable. Prefer short sections over long narrative blocks.
- Content must be written for reuse, clarity, and execution.
- Do not write long continuous prose blocks.
- Do not prioritize emotional language over clarity.
- Do not write to impress, write to enable execution.`
  : `- Write with voice and personality. The script should sound like a talented human, not a template.
- Use vivid, specific language. Replace generic phrases with concrete imagery.
- Let narrative breathe — short sections are fine but don't chop sentences that need flow.
- Emotion and energy are assets, not liabilities. Use them when the content calls for it.`}
- Do not mention internal systems, schemas, or validation rules.

Final rule: This must feel like something a professional would use immediately — ${['vfx_brief', 'budget', 'shot_list', 'research'].includes(input.documentType || '') ? 'clear and executable.' : 'engaging, production-ready, and worth reading.'}
`;
  }

  buildPrompt(input: AgentInput): string {
    if ((input as ScriptAuthorIntentInput)?.intent) {
      return this.buildStructuredPrompt(input as ScriptAuthorIntentInput);
    }

    const { context, userPrompt } = input;
    const outline = (input as ScriptAuthorInput).outline;
    const contract = (input as ScriptAuthorInput).contract;
    const outlineSummary = outline
      ? outline.sections
        .map((s) => `- ${s.title}: ${s.goal}`)
        .join('\n')
      : 'None';

    const roleProfile = inferRoleFromContext(
      context.projectSummary || '',
      userPrompt,
      (input as ScriptAuthorInput).documentType ?? (input as ScriptAuthorInput).contentSignalProfile?.profile.constraints.output_format
    );

    // Brand context: use systemBrief from ThinkForge's 3-tier retrieval
    const brandBlock = context.systemBrief
      ? `<brand_context>\n${context.systemBrief}\n</brand_context>`
      : '';

    const contentSignalProfile = (input as ScriptAuthorInput).contentSignalProfile;
    const signalBlock = this.buildContentSignalProfileBlock(contentSignalProfile);

    const core = this.buildCorePromptBlock({
      roleProfile,
      projectSummary: context.projectSummary || '',
      userRequest: userPrompt,
      contract,
      outlineSummary,
      outlineTitle: outline?.title,
      brandBlock,
      signalBlock,
    });

    const documentType = (input as ScriptAuthorInput).documentType ?? contentSignalProfile?.profile.constraints.output_format;
    const medium = contract?.medium ?? contentSignalProfile?.profile.constraints.output_format;
    const signals = contentSignalProfile?.profile.signals ?? extractSignalsFromContext({
      documentType,
      medium,
      projectSummary: context.projectSummary,
      userPrompt,
    });

    const writingBlock = this.buildWritingKnowledgeBlock(signals);
    const outputFormat = this.buildOutputFormatBlock({
      documentType,
      medium,
      signals,
      userPrompt,
      projectSummary: context.projectSummary,
      platform: contentSignalProfile?.intent.platform,
    });

    return `${writingBlock}

${core}

${outputFormat}`;
  }

  async writeDocument(
    input: ScriptAuthorInput,
    overrides?: Partial<Pick<AgentConfig, 'maxTokens' | 'temperature'>>,
    abortSignal?: AbortSignal
  ): Promise<string> {
    const { text } = await this.runComplete(input, overrides, abortSignal);
    return text.trim();
  }

  async writeStructuredResponse(
    input: ScriptAuthorIntentInput,
    overrides?: Partial<Pick<AgentConfig, 'maxTokens' | 'temperature'>>,
    abortSignal?: AbortSignal
  ): Promise<AgentScriptResponse> {
    const { text } = await this.runComplete(
      {
        ...input,
        userPrompt: input.instruction,
      },
      overrides,
      abortSignal
    );

    let parsed: unknown;
    try {
      parsed = parseAgentJson(text.trim());
    } catch (error) {
      throw new Error(`Invalid JSON from ScriptAuthorAgent: ${(error as Error).message}`);
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid AgentScriptResponse: not an object');
    }
    const result = parsed as any;
    if (result.mode !== 'replace' && result.mode !== 'insert' && result.mode !== 'patch') {
      throw new Error('Invalid AgentScriptResponse: missing or invalid mode');
    }
    if (result.mode === 'replace' || result.mode === 'insert') {
      if (!Array.isArray(result.blocks) || result.blocks.length === 0) {
        throw new Error('Invalid AgentScriptResponse: blocks required');
      }
    }
    if (result.mode === 'insert') {
      if (!result.position || typeof result.position !== 'object') {
        throw new Error('Invalid AgentScriptResponse: position required for insert');
      }
    }
    if (result.mode === 'patch') {
      if (!Array.isArray(result.patches) || result.patches.length === 0) {
        throw new Error('Invalid AgentScriptResponse: patches required');
      }
    }

    return result as AgentScriptResponse;
  }
}

export function createScriptAuthorAgent(
  config?: Partial<Omit<AgentConfig, 'agentType'>>
): ScriptAuthorAgent {
  return new ScriptAuthorAgent(config);
}
