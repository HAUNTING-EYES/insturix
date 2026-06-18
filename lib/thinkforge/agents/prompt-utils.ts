export interface DocumentRoleProfile {
  role: string;
  executionTest: string;
  outputFeeling: string;
  sectionGuidance: string;
  defaultVoice: string;
  defaultMedium: string;
}

export function inferRoleFromContext(projectSummary: string, userPrompt: string, explicitDocType?: string): DocumentRoleProfile {
  const docType = (explicitDocType || '').toLowerCase();
  const userLower = userPrompt.toLowerCase();
  const combined = `${projectSummary} ${userPrompt}`.toLowerCase();

  // Post/article/text content — check USER PROMPT first
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

  // Video: check USER PROMPT
  if (docType === 'video_script' || /video|ad\b|commercial|reel|short[- ]?form|youtube|tiktok|brand[- ]?film|product[- ]?ad|ugc/i.test(userLower)) {
    return {
      role: 'a Senior Creative Director and Video Scriptwriter',
      executionTest: 'A video editor should be able to say: "I know exactly what to show, say, and hear in every second."',
      outputFeeling: 'a professional video production script with scene-by-scene direction',
      sectionGuidance: `- This is a VIDEO SCRIPT. Follow the <output_format> block EXACTLY for per-scene structure.\n- Think like a director: for every line of narration, ask "what do I SHOW while these words are spoken?"\n- Each scene = one distinct visual moment. Two visuals = two scenes.\n- The VO text IS the product. Visual direction SERVES the narration.`,
      defaultVoice: 'voiceover',
      defaultMedium: 'video_script',
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

export type PlatformType = 'linkedin' | 'twitter' | 'instagram' | 'facebook' | 'generic';

export interface PlatformConfig {
  name: string;
  charTarget: string;
  charMax: string;
  foldChars: number;
  hashtagRange: string;
  extraGuidance: string;
}

export const PLATFORM_CONFIGS: Record<PlatformType, PlatformConfig> = {
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
  const ps = (projectSummary || '').toLowerCase();
  if (/platform:\s*linkedin/i.test(ps)) return 'linkedin';
  if (/platform:\s*(twitter|x)/i.test(ps)) return 'twitter';
  if (/platform:\s*instagram/i.test(ps)) return 'instagram';
  if (/platform:\s*facebook/i.test(ps)) return 'facebook';
  if (/post|social/i.test(dt)) return 'linkedin';
  return 'generic';
}

export function detectContentPath(userPrompt: string, docType?: string): 'post' | 'script' {
  const dt = (docType || '').toLowerCase();
  const lower = userPrompt.toLowerCase();
  if (dt === 'post' || dt === 'article' || /\b(linkedin\s*post|twitter\s*post|x\s*post|instagram\s*caption|facebook\s*post|social\s*media\s*post|blog\s*post|article|newsletter|email\s*campaign|email\s*copy|carousel\s*post)\b/i.test(lower)) {
    return 'post';
  }
  return 'script';
}
