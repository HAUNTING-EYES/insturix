/**
 * Edit Profile Definitions — 54 Profiles Across 7 Categories
 *
 * Each profile is a complete automated editing program.
 * The Director Agent executes the actions[] array sequentially.
 *
 * Categories:
 * A (8)  — Platform Native
 * B (14) — Industry Vertical
 * C (12) — Content Format
 * D (8)  — Cinematic Style
 * E (6)  — Narrative Mode
 * F (4)  — Production Mode
 * G (2)  — Special Purpose
 */

import type { EditProfile, ProfileId } from './edit-profile-types';

// ─── Helper: Common action sequences ─────────────────────────────

const applyFilter = (filterId: string, order = 1) => ({
  tool: 'batch_update_overlays',
  params: { filterPresetId: filterId, targetTypes: ['image', 'video'] },
  description: `Apply ${filterId} filter to all visual overlays`,
  order,
  failBehavior: 'warn' as const,
});

const addCaptions = (style: string, order = 5) => ({
  tool: 'add_captions',
  params: { style },
  condition: 'hasVoiceover' as const,
  description: `Add ${style} captions`,
  order,
  failBehavior: 'skip' as const,
});

const addFancyCaptions = (style: string, order = 5) => ({
  tool: 'add_fancy_captions',
  params: { style },
  condition: 'hasVoiceover' as const,
  description: `Add ${style} kinetic captions`,
  order,
  failBehavior: 'skip' as const,
});

const addTransition = (type: string, durationMs = 500, order = 3) => ({
  tool: 'add_transition',
  params: { type, durationMs, applyToAll: true },
  condition: 'hasMultipleScenes' as const,
  description: `Add ${type} transitions between scenes`,
  order,
  failBehavior: 'skip' as const,
});

const audioDuck = (level: number, order = 6) => ({
  tool: 'audio_ducking',
  params: { duckLevel: level, rampDownMs: 300, rampUpMs: 600, lookAheadMs: 200 },
  condition: 'hasBGM' as const,
  description: `Audio ducking at ${level}`,
  order,
  failBehavior: 'warn' as const,
});

const qualityReview = (vision = false, order = 10) => ({
  tool: 'quality_review',
  params: { deterministic: true, geminiVision: vision },
  description: vision ? 'Quality review (deterministic + AI vision)' : 'Quality review (deterministic)',
  order,
  failBehavior: 'skip' as const,
});

const lowerThird = (order = 4) => ({
  tool: 'add_motion_graphic',
  params: { category: 'lower_third' },
  condition: 'hasVoiceover' as const,
  description: 'Add lower-third for speakers',
  order,
  failBehavior: 'skip' as const,
});

const beatSync = (filter: string, threshold: number, order = 3) => ({
  tool: 'sync_cuts_to_beats',
  params: { beatFilter: filter, strengthThreshold: threshold },
  condition: 'hasBGM' as const,
  description: `Sync cuts to ${filter} (threshold ${threshold})`,
  order,
  failBehavior: 'skip' as const,
});

// ═══════════════════════════════════════════════════════════════════
// CATEGORY A — PLATFORM NATIVE (8 profiles)
// ═══════════════════════════════════════════════════════════════════

const A01: EditProfile = {
  profileId: 'A-01', name: 'YouTube Long Form', description: '8-20 min educational/documentary optimized for retention',
  category: 'platform-native', filterPresetId: 'warm-neutral', pacing: 'medium', pacingMultiplier: 1.0,
  cutsPerMinRange: [8, 15], defaultTransition: 'hard-cut', captionStyle: 'subtitle', bgmDuckLevel: 0.20,
  graphicsDensity: 'moderate',
  actions: [
    applyFilter('warm-neutral'), addTransition('soft-cut'), addCaptions('subtitle'), lowerThird(),
    beatSync('downbeats', 0.7, 3), audioDuck(0.20), qualityReview(),
  ],
  signalKeywords: [
    { term: 'educational', field: 'narration', weight: 0.3 }, { term: 'learn', field: 'narration', weight: 0.2 },
    { term: 'background', field: 'music', weight: 0.2 }, { term: 'youtube', field: 'platform', weight: 0.5 },
    { term: 'presenter', field: 'visual', weight: 0.2 }, { term: 'screen recording', field: 'visual', weight: 0.2 },
  ],
};

const A02: EditProfile = {
  profileId: 'A-02', name: 'YouTube Short / Clip', description: 'Under 60s hook-first content',
  category: 'platform-native', filterPresetId: 'vivid', pacing: 'fast', pacingMultiplier: 0.75,
  cutsPerMinRange: [20, 35], defaultTransition: 'zoom-punch', captionStyle: 'fancy', bgmDuckLevel: 0.15,
  graphicsDensity: 'heavy',
  actions: [
    applyFilter('vivid'), addTransition('zoom-punch', 270), addFancyCaptions('tiktok'), beatSync('all', 0.5, 3), audioDuck(0.15), qualityReview(),
  ],
  signalKeywords: [
    { term: 'youtube shorts', field: 'platform', weight: 0.5 }, { term: 'energetic', field: 'music', weight: 0.3 },
    { term: 'hook', field: 'narration', weight: 0.3 },
  ],
};

const A03: EditProfile = {
  profileId: 'A-03', name: 'Instagram Reel / TikTok', description: 'Vertical short-form for algorithmic distribution',
  category: 'platform-native', filterPresetId: 'vivid', pacing: 'fast', pacingMultiplier: 0.70,
  cutsPerMinRange: [25, 40], defaultTransition: 'zoom-punch', captionStyle: 'fancy', bgmDuckLevel: 0.12,
  graphicsDensity: 'heavy',
  actions: [
    applyFilter('vivid'), addTransition('zoom-punch'), addFancyCaptions('tiktok'), beatSync('all', 0.5, 3), audioDuck(0.12), qualityReview(),
  ],
  signalKeywords: [
    { term: 'instagram', field: 'platform', weight: 0.5 }, { term: 'tiktok', field: 'platform', weight: 0.5 },
    { term: 'trending', field: 'music', weight: 0.3 }, { term: 'viral', field: 'music', weight: 0.3 },
    { term: 'closeup', field: 'visual', weight: 0.2 }, { term: 'creator', field: 'visual', weight: 0.2 },
  ],
};

const A04: EditProfile = {
  profileId: 'A-04', name: 'LinkedIn Thought Leadership', description: 'Professional authority-building content',
  category: 'platform-native', filterPresetId: 'clean-corporate', pacing: 'medium', pacingMultiplier: 1.1,
  cutsPerMinRange: [6, 12], defaultTransition: 'hard-cut', captionStyle: 'subtitle', bgmDuckLevel: 0.05,
  graphicsDensity: 'moderate',
  actions: [
    applyFilter('clean-corporate'), addTransition('hard-cut'), addCaptions('subtitle'), lowerThird(), audioDuck(0.05), qualityReview(),
  ],
  signalKeywords: [
    { term: 'linkedin', field: 'platform', weight: 0.5 }, { term: 'professional', field: 'narration', weight: 0.2 },
    { term: 'executive', field: 'character', weight: 0.3 }, { term: 'corporate', field: 'music', weight: 0.2 },
  ],
};

const A05: EditProfile = {
  profileId: 'A-05', name: 'Facebook / Meta Ad', description: 'AIDA-structured paid distribution',
  category: 'platform-native', filterPresetId: 'warm-neutral', pacing: 'fast', pacingMultiplier: 0.85,
  cutsPerMinRange: [15, 25], defaultTransition: 'hard-cut', captionStyle: 'subtitle', bgmDuckLevel: 0.18,
  graphicsDensity: 'heavy',
  actions: [
    applyFilter('warm-neutral'), addTransition('hard-cut'), addCaptions('subtitle'), audioDuck(0.18), qualityReview(),
  ],
  signalKeywords: [
    { term: 'facebook', field: 'platform', weight: 0.5 }, { term: 'ad', field: 'contentType', weight: 0.45 },
    { term: 'click', field: 'narration', weight: 0.2 }, { term: 'shop now', field: 'narration', weight: 0.3 },
  ],
};

const A06: EditProfile = {
  profileId: 'A-06', name: 'Twitter / X Clip', description: 'Maximum 2min front-loaded value',
  category: 'platform-native', filterPresetId: 'vivid', pacing: 'fast', pacingMultiplier: 0.80,
  cutsPerMinRange: [18, 28], defaultTransition: 'hard-cut', captionStyle: 'subtitle', bgmDuckLevel: 0.15,
  graphicsDensity: 'moderate',
  actions: [
    applyFilter('vivid'), addTransition('hard-cut'), addCaptions('subtitle'), beatSync('strong', 0.7, 3), audioDuck(0.15), qualityReview(),
  ],
  signalKeywords: [
    { term: 'twitter', field: 'platform', weight: 0.5 }, { term: 'x.com', field: 'platform', weight: 0.5 },
  ],
};

const A07: EditProfile = {
  profileId: 'A-07', name: 'Pinterest Video Pin', description: 'Silent-first tutorial/inspiration',
  category: 'platform-native', filterPresetId: 'golden-hour-pro', pacing: 'slow', pacingMultiplier: 1.2,
  cutsPerMinRange: [4, 10], defaultTransition: 'soft-cut', captionStyle: 'subtitle', bgmDuckLevel: 0.10,
  graphicsDensity: 'heavy',
  actions: [
    applyFilter('golden-hour-pro'), addTransition('soft-cut'), addCaptions('subtitle'), audioDuck(0.10), qualityReview(),
  ],
  signalKeywords: [
    { term: 'pinterest', field: 'platform', weight: 0.5 }, { term: 'flat lay', field: 'visual', weight: 0.3 },
    { term: 'tutorial step', field: 'visual', weight: 0.3 }, { term: 'recipe', field: 'visual', weight: 0.2 },
  ],
};

const A08: EditProfile = {
  profileId: 'A-08', name: 'OTT / Streaming Platform', description: 'Long-form narrative for Netflix/Prime style',
  category: 'platform-native', filterPresetId: 'teal-orange', pacing: 'variable', pacingMultiplier: 1.0,
  cutsPerMinRange: [5, 15], defaultTransition: 'hard-cut', captionStyle: 'subtitle', bgmDuckLevel: 0.18,
  graphicsDensity: 'minimal',
  actions: [
    applyFilter('teal-orange'), addTransition('hard-cut'), addCaptions('subtitle'), lowerThird(), audioDuck(0.18), qualityReview(true),
  ],
  signalKeywords: [
    { term: 'documentary', field: 'contentType', weight: 0.4 }, { term: 'narrative', field: 'contentType', weight: 0.3 },
    { term: 'orchestral', field: 'music', weight: 0.3 }, { term: 'cinematic', field: 'music', weight: 0.3 },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// CATEGORY B — INDUSTRY VERTICAL (14 profiles)
// ═══════════════════════════════════════════════════════════════════

const B01: EditProfile = {
  profileId: 'B-01', name: 'SaaS / Tech Product', description: 'Software demos, feature announcements',
  category: 'industry-vertical', filterPresetId: 'clean-corporate', pacing: 'medium', pacingMultiplier: 0.90,
  cutsPerMinRange: [10, 18], defaultTransition: 'hard-cut', captionStyle: 'subtitle', bgmDuckLevel: 0.18,
  graphicsDensity: 'heavy',
  actions: [applyFilter('clean-corporate'), addTransition('hard-cut'), addCaptions('subtitle'), lowerThird(), audioDuck(0.18), qualityReview()],
  signalKeywords: [
    { term: 'screen', field: 'visual', weight: 0.3 }, { term: 'dashboard', field: 'visual', weight: 0.4 },
    { term: 'UI', field: 'visual', weight: 0.3 }, { term: 'app', field: 'visual', weight: 0.2 },
    { term: 'feature', field: 'narration', weight: 0.2 }, { term: 'workflow', field: 'narration', weight: 0.2 },
  ],
};

const B02: EditProfile = {
  profileId: 'B-02', name: 'E-Commerce / Product Launch', description: 'Product-hero conversion content',
  category: 'industry-vertical', filterPresetId: 'teal-orange', pacing: 'medium', pacingMultiplier: 0.90,
  cutsPerMinRange: [12, 20], defaultTransition: 'hard-cut', captionStyle: 'none', bgmDuckLevel: 0.15,
  graphicsDensity: 'moderate',
  actions: [applyFilter('teal-orange'), addTransition('hard-cut'), audioDuck(0.15), qualityReview()],
  signalKeywords: [
    { term: 'product', field: 'visual', weight: 0.4 }, { term: 'close-up', field: 'visual', weight: 0.2 },
    { term: 'studio', field: 'visual', weight: 0.2 }, { term: 'shop now', field: 'narration', weight: 0.3 },
  ],
};

const B03: EditProfile = {
  profileId: 'B-03', name: 'Fashion / Apparel', description: 'Lookbook, collection launch, rhythm-forward',
  category: 'industry-vertical', filterPresetId: 'desaturated-drama', pacing: 'beat-synced', pacingMultiplier: 0.85,
  cutsPerMinRange: [20, 35], defaultTransition: 'hard-cut', captionStyle: 'none', bgmDuckLevel: 0.80,
  graphicsDensity: 'minimal',
  actions: [applyFilter('desaturated-drama'), addTransition('hard-cut'), beatSync('all', 0.5, 3), qualityReview()],
  signalKeywords: [
    { term: 'model', field: 'visual', weight: 0.3 }, { term: 'outfit', field: 'visual', weight: 0.4 },
    { term: 'runway', field: 'visual', weight: 0.4 }, { term: 'collection', field: 'visual', weight: 0.3 },
    { term: 'fashion', field: 'visual', weight: 0.5 },
  ],
};

const B04: EditProfile = {
  profileId: 'B-04', name: 'Food & Beverage', description: 'Recipe tutorials, restaurant brand films',
  category: 'industry-vertical', filterPresetId: 'golden-hour-pro', pacing: 'medium', pacingMultiplier: 1.1,
  cutsPerMinRange: [8, 16], defaultTransition: 'soft-cut', captionStyle: 'subtitle', bgmDuckLevel: 0.20,
  graphicsDensity: 'moderate',
  actions: [applyFilter('golden-hour-pro'), addTransition('soft-cut'), addCaptions('subtitle'), audioDuck(0.20), qualityReview()],
  signalKeywords: [
    { term: 'food', field: 'visual', weight: 0.5 }, { term: 'ingredient', field: 'visual', weight: 0.4 },
    { term: 'cooking', field: 'visual', weight: 0.4 }, { term: 'recipe', field: 'visual', weight: 0.5 },
    { term: 'kitchen', field: 'environment', weight: 0.3 },
  ],
};

const B05: EditProfile = {
  profileId: 'B-05', name: 'Health & Wellness / Fitness', description: 'Workout or wellness content',
  category: 'industry-vertical', filterPresetId: 'vivid', pacing: 'fast', pacingMultiplier: 0.85,
  cutsPerMinRange: [15, 25], defaultTransition: 'hard-cut', captionStyle: 'subtitle', bgmDuckLevel: 0.15,
  graphicsDensity: 'moderate',
  actions: [applyFilter('vivid'), addTransition('hard-cut'), addCaptions('subtitle'), audioDuck(0.15), qualityReview()],
  signalKeywords: [
    { term: 'workout', field: 'visual', weight: 0.5 }, { term: 'exercise', field: 'visual', weight: 0.4 },
    { term: 'gym', field: 'visual', weight: 0.4 }, { term: 'yoga', field: 'visual', weight: 0.4 },
    { term: 'trainer', field: 'character', weight: 0.3 }, { term: 'motivational', field: 'music', weight: 0.2 },
  ],
};

const B06: EditProfile = {
  profileId: 'B-06', name: 'Real Estate', description: 'Property tours, architectural showcases',
  category: 'industry-vertical', filterPresetId: 'clean-corporate', pacing: 'slow', pacingMultiplier: 1.2,
  cutsPerMinRange: [5, 10], defaultTransition: 'dissolve', captionStyle: 'none', bgmDuckLevel: 0.20,
  graphicsDensity: 'moderate',
  actions: [applyFilter('clean-corporate'), addTransition('dissolve'), audioDuck(0.20), qualityReview()],
  signalKeywords: [
    { term: 'property', field: 'visual', weight: 0.5 }, { term: 'bedroom', field: 'visual', weight: 0.4 },
    { term: 'apartment', field: 'visual', weight: 0.4 }, { term: 'tour', field: 'visual', weight: 0.3 },
  ],
};

const B07: EditProfile = {
  profileId: 'B-07', name: 'Automotive', description: 'Vehicle launches, test drives, brand films',
  category: 'industry-vertical', filterPresetId: 'blade-runner', pacing: 'medium', pacingMultiplier: 0.90,
  cutsPerMinRange: [12, 22], defaultTransition: 'hard-cut', captionStyle: 'none', bgmDuckLevel: 0.12,
  graphicsDensity: 'minimal',
  actions: [applyFilter('blade-runner'), addTransition('hard-cut'), beatSync('downbeats', 0.7, 3), audioDuck(0.12), qualityReview()],
  signalKeywords: [
    { term: 'car', field: 'visual', weight: 0.5 }, { term: 'vehicle', field: 'visual', weight: 0.5 },
    { term: 'drive', field: 'visual', weight: 0.3 }, { term: 'engine', field: 'visual', weight: 0.3 },
    { term: 'speed', field: 'visual', weight: 0.3 },
  ],
};

const B08: EditProfile = {
  profileId: 'B-08', name: 'Finance / Fintech', description: 'Trust-first, data-heavy credibility',
  category: 'industry-vertical', filterPresetId: 'clean-corporate', pacing: 'medium', pacingMultiplier: 1.1,
  cutsPerMinRange: [6, 12], defaultTransition: 'hard-cut', captionStyle: 'subtitle', bgmDuckLevel: 0.20,
  graphicsDensity: 'moderate',
  actions: [applyFilter('clean-corporate'), addTransition('hard-cut'), addCaptions('subtitle'), lowerThird(), audioDuck(0.20), qualityReview()],
  signalKeywords: [
    { term: 'investment', field: 'narration', weight: 0.3 }, { term: 'portfolio', field: 'narration', weight: 0.3 },
    { term: 'financial', field: 'narration', weight: 0.3 }, { term: 'returns', field: 'narration', weight: 0.2 },
  ],
};

const B09: EditProfile = {
  profileId: 'B-09', name: 'Healthcare / Medical', description: 'Patient education, clinical explainers',
  category: 'industry-vertical', filterPresetId: 'clean-corporate', pacing: 'medium', pacingMultiplier: 1.1,
  cutsPerMinRange: [6, 10], defaultTransition: 'hard-cut', captionStyle: 'subtitle', bgmDuckLevel: 0.22,
  graphicsDensity: 'moderate',
  actions: [applyFilter('clean-corporate'), addTransition('hard-cut'), addCaptions('subtitle'), lowerThird(), audioDuck(0.22), qualityReview()],
  signalKeywords: [
    { term: 'patient', field: 'narration', weight: 0.3 }, { term: 'doctor', field: 'character', weight: 0.3 },
    { term: 'treatment', field: 'narration', weight: 0.3 }, { term: 'hospital', field: 'environment', weight: 0.3 },
  ],
};

const B10: EditProfile = {
  profileId: 'B-10', name: 'Education / EdTech', description: 'Online courses, explainer lessons',
  category: 'industry-vertical', filterPresetId: 'warm-neutral', pacing: 'medium', pacingMultiplier: 1.0,
  cutsPerMinRange: [8, 15], defaultTransition: 'dip-to-black', captionStyle: 'word-by-word', bgmDuckLevel: 0.18,
  graphicsDensity: 'heavy',
  actions: [applyFilter('warm-neutral'), addTransition('dip-to-black'), addCaptions('word-by-word'), audioDuck(0.18), qualityReview()],
  signalKeywords: [
    { term: 'learn', field: 'narration', weight: 0.3 }, { term: 'concept', field: 'narration', weight: 0.2 },
    { term: 'step', field: 'narration', weight: 0.2 }, { term: 'teacher', field: 'character', weight: 0.3 },
    { term: 'lo-fi', field: 'music', weight: 0.2 },
  ],
};

const B11: EditProfile = {
  profileId: 'B-11', name: 'Travel / Hospitality', description: 'Destination content, hotel brand',
  category: 'industry-vertical', filterPresetId: 'golden-hour-pro', pacing: 'medium', pacingMultiplier: 1.1,
  cutsPerMinRange: [8, 16], defaultTransition: 'dissolve', captionStyle: 'subtitle', bgmDuckLevel: 0.20,
  graphicsDensity: 'moderate',
  actions: [applyFilter('golden-hour-pro'), addTransition('dissolve'), addCaptions('subtitle'), audioDuck(0.20), qualityReview()],
  signalKeywords: [
    { term: 'destination', field: 'visual', weight: 0.4 }, { term: 'travel', field: 'visual', weight: 0.4 },
    { term: 'hotel', field: 'visual', weight: 0.4 }, { term: 'beach', field: 'visual', weight: 0.3 },
  ],
};

const B12: EditProfile = {
  profileId: 'B-12', name: 'Non-Profit / Social Cause', description: 'Emotional storytelling for change',
  category: 'industry-vertical', filterPresetId: 'film-portra', pacing: 'slow', pacingMultiplier: 1.2,
  cutsPerMinRange: [5, 10], defaultTransition: 'dissolve', captionStyle: 'subtitle', bgmDuckLevel: 0.22,
  graphicsDensity: 'minimal',
  actions: [applyFilter('film-portra'), addTransition('dissolve'), addCaptions('subtitle'), audioDuck(0.22), qualityReview()],
  signalKeywords: [
    { term: 'impact', field: 'narration', weight: 0.3 }, { term: 'community', field: 'narration', weight: 0.3 },
    { term: 'donate', field: 'narration', weight: 0.4 }, { term: 'emotional', field: 'music', weight: 0.3 },
  ],
};

const B13: EditProfile = {
  profileId: 'B-13', name: 'Gaming / Esports', description: 'Game trailers, highlight reels, maximum energy',
  category: 'industry-vertical', filterPresetId: 'neon-nights', pacing: 'fast', pacingMultiplier: 0.65,
  cutsPerMinRange: [30, 50], defaultTransition: 'glitch', captionStyle: 'fancy', bgmDuckLevel: 0.10,
  graphicsDensity: 'heavy',
  actions: [applyFilter('neon-nights'), addTransition('glitch'), addFancyCaptions('kinetic'), beatSync('all', 0.4, 3), audioDuck(0.10), qualityReview()],
  signalKeywords: [
    { term: 'gameplay', field: 'visual', weight: 0.5 }, { term: 'game', field: 'visual', weight: 0.4 },
    { term: 'esports', field: 'visual', weight: 0.5 }, { term: 'electronic', field: 'music', weight: 0.2 },
    { term: 'dnb', field: 'music', weight: 0.3 },
  ],
};

const B14: EditProfile = {
  profileId: 'B-14', name: 'Beauty / Cosmetics', description: 'Product tutorials, transformation reveals',
  category: 'industry-vertical', filterPresetId: 'film-portra', pacing: 'medium', pacingMultiplier: 1.0,
  cutsPerMinRange: [8, 15], defaultTransition: 'hard-cut', captionStyle: 'subtitle', bgmDuckLevel: 0.18,
  graphicsDensity: 'moderate',
  actions: [applyFilter('film-portra'), addTransition('hard-cut'), addCaptions('subtitle'), audioDuck(0.18), qualityReview()],
  signalKeywords: [
    { term: 'makeup', field: 'visual', weight: 0.5 }, { term: 'skin', field: 'visual', weight: 0.3 },
    { term: 'beauty', field: 'visual', weight: 0.5 }, { term: 'transformation', field: 'visual', weight: 0.3 },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// CATEGORY C — CONTENT FORMAT (12 profiles)
// ═══════════════════════════════════════════════════════════════════

const C01: EditProfile = { profileId: 'C-01', name: 'Talking Head / Interview', description: 'On-camera speaking, B-roll covers', category: 'content-format', filterPresetId: 'warm-neutral', pacing: 'medium', pacingMultiplier: 1.0, cutsPerMinRange: [6, 12], defaultTransition: 'hard-cut', captionStyle: 'subtitle', bgmDuckLevel: 0.05, graphicsDensity: 'moderate', actions: [applyFilter('warm-neutral'), addTransition('hard-cut'), addCaptions('subtitle'), lowerThird(), audioDuck(0.05), qualityReview()], signalKeywords: [{ term: 'presenter', field: 'visual', weight: 0.3 }, { term: 'interview', field: 'visual', weight: 0.4 }, { term: 'talking', field: 'visual', weight: 0.3 }, { term: 'studio', field: 'environment', weight: 0.2 }] };

const C02: EditProfile = { profileId: 'C-02', name: 'Tutorial / How-To', description: 'Step-by-step instruction', category: 'content-format', filterPresetId: 'clean-corporate', pacing: 'medium', pacingMultiplier: 1.0, cutsPerMinRange: [8, 14], defaultTransition: 'dip-to-black', captionStyle: 'word-by-word', bgmDuckLevel: 0.20, graphicsDensity: 'heavy', actions: [applyFilter('clean-corporate'), addTransition('dip-to-black'), addCaptions('word-by-word'), audioDuck(0.20), qualityReview()], signalKeywords: [{ term: 'step 1', field: 'narration', weight: 0.3 }, { term: 'how to', field: 'narration', weight: 0.3 }, { term: 'tutorial', field: 'contentType', weight: 0.45 }, { term: 'demonstration', field: 'visual', weight: 0.2 }] };

const C03: EditProfile = { profileId: 'C-03', name: 'Documentary / Mini-Doc', description: 'Reality-grounded storytelling', category: 'content-format', filterPresetId: 'muted-doc', pacing: 'slow', pacingMultiplier: 1.2, cutsPerMinRange: [5, 12], defaultTransition: 'hard-cut', captionStyle: 'subtitle', bgmDuckLevel: 0.22, graphicsDensity: 'minimal', actions: [applyFilter('muted-doc'), addTransition('hard-cut'), addCaptions('subtitle'), lowerThird(), audioDuck(0.22), qualityReview(true)], signalKeywords: [{ term: 'documentary', field: 'contentType', weight: 0.5 }, { term: 'authentic', field: 'mood', weight: 0.2 }, { term: 'observational', field: 'mood', weight: 0.3 }] };

const C04: EditProfile = { profileId: 'C-04', name: 'Explainer / Animated', description: 'Concept communication with visual aids', category: 'content-format', filterPresetId: 'vivid', pacing: 'medium', pacingMultiplier: 0.95, cutsPerMinRange: [10, 18], defaultTransition: 'hard-cut', captionStyle: 'keyword-highlight', bgmDuckLevel: 0.18, graphicsDensity: 'heavy', actions: [applyFilter('vivid'), addTransition('hard-cut'), addCaptions('keyword-highlight'), audioDuck(0.18), qualityReview()], signalKeywords: [{ term: 'explainer', field: 'contentType', weight: 0.45 }, { term: 'diagram', field: 'visual', weight: 0.3 }, { term: 'think of it as', field: 'narration', weight: 0.2 }] };

const C05: EditProfile = { profileId: 'C-05', name: 'Testimonial / Social Proof', description: 'Customer speaks, authenticity is value', category: 'content-format', filterPresetId: 'film-portra', pacing: 'slow', pacingMultiplier: 1.1, cutsPerMinRange: [5, 10], defaultTransition: 'dip-to-black', captionStyle: 'subtitle', bgmDuckLevel: 0.05, graphicsDensity: 'minimal', actions: [applyFilter('film-portra'), addTransition('dip-to-black'), addCaptions('subtitle'), lowerThird(), audioDuck(0.05), qualityReview()], signalKeywords: [{ term: 'customer', field: 'character', weight: 0.3 }, { term: 'client', field: 'character', weight: 0.3 }, { term: 'testimonial', field: 'contentType', weight: 0.45 }] };

const C06: EditProfile = { profileId: 'C-06', name: 'Event Highlight Reel', description: 'Conference, launch, concert coverage', category: 'content-format', filterPresetId: 'vivid', pacing: 'fast', pacingMultiplier: 0.85, cutsPerMinRange: [15, 25], defaultTransition: 'whip-pan', captionStyle: 'none', bgmDuckLevel: 0.15, graphicsDensity: 'moderate', actions: [applyFilter('vivid'), addTransition('whip-pan'), beatSync('downbeats', 0.6, 3), audioDuck(0.15), qualityReview()], signalKeywords: [{ term: 'event', field: 'visual', weight: 0.3 }, { term: 'keynote', field: 'visual', weight: 0.3 }, { term: 'conference', field: 'environment', weight: 0.3 }] };

const C07: EditProfile = { profileId: 'C-07', name: 'Keynote / Presentation', description: 'Speaker-forward with slide support', category: 'content-format', filterPresetId: 'clean-corporate', pacing: 'medium', pacingMultiplier: 1.1, cutsPerMinRange: [5, 10], defaultTransition: 'hard-cut', captionStyle: 'subtitle', bgmDuckLevel: 0.05, graphicsDensity: 'moderate', actions: [applyFilter('clean-corporate'), addTransition('hard-cut'), addCaptions('subtitle'), lowerThird(), audioDuck(0.05), qualityReview()], signalKeywords: [{ term: 'speaker', field: 'character', weight: 0.3 }, { term: 'stage', field: 'environment', weight: 0.3 }, { term: 'conference', field: 'environment', weight: 0.3 }] };

const C08: EditProfile = { profileId: 'C-08', name: 'Vlog / Day-in-Life', description: 'Creator personality content', category: 'content-format', filterPresetId: 'golden-hour-pro', pacing: 'medium', pacingMultiplier: 0.95, cutsPerMinRange: [12, 20], defaultTransition: 'hard-cut', captionStyle: 'fancy', bgmDuckLevel: 0.20, graphicsDensity: 'moderate', actions: [applyFilter('golden-hour-pro'), addTransition('hard-cut'), addFancyCaptions('creator'), audioDuck(0.20), qualityReview()], signalKeywords: [{ term: 'today', field: 'narration', weight: 0.2 }, { term: 'vlog', field: 'contentType', weight: 0.4 }, { term: 'lo-fi', field: 'music', weight: 0.2 }] };

const C09: EditProfile = { profileId: 'C-09', name: 'Podcast / Audio Clip', description: 'Audio-primary with visual accompaniment', category: 'content-format', filterPresetId: 'clean-corporate', pacing: 'medium', pacingMultiplier: 1.0, cutsPerMinRange: [4, 8], defaultTransition: 'hard-cut', captionStyle: 'subtitle', bgmDuckLevel: 0.05, graphicsDensity: 'moderate', actions: [applyFilter('clean-corporate'), addTransition('hard-cut'), addCaptions('subtitle'), lowerThird(), audioDuck(0.05), qualityReview()], signalKeywords: [{ term: 'podcast', field: 'contentType', weight: 0.45 }, { term: 'hosts', field: 'character', weight: 0.2 }, { term: 'guests', field: 'character', weight: 0.2 }] };

const C10: EditProfile = { profileId: 'C-10', name: 'Music Video', description: 'Rhythm-locked, performance + narrative', category: 'content-format', filterPresetId: 'teal-orange', pacing: 'beat-synced', pacingMultiplier: 1.0, cutsPerMinRange: [20, 40], defaultTransition: 'hard-cut', captionStyle: 'none', bgmDuckLevel: 0.90, graphicsDensity: 'minimal', actions: [applyFilter('teal-orange'), addTransition('hard-cut'), beatSync('all', 0.4, 3), qualityReview()], signalKeywords: [{ term: 'music video', field: 'contentType', weight: 0.5 }, { term: 'performance', field: 'visual', weight: 0.3 }] };

const C11: EditProfile = { profileId: 'C-11', name: 'Training / Corporate Onboarding', description: 'Process compliance, accessibility required', category: 'content-format', filterPresetId: 'clean-corporate', pacing: 'medium', pacingMultiplier: 1.0, cutsPerMinRange: [6, 12], defaultTransition: 'dip-to-black', captionStyle: 'subtitle', bgmDuckLevel: 0.20, graphicsDensity: 'moderate', actions: [applyFilter('clean-corporate'), addTransition('dip-to-black'), addCaptions('subtitle'), audioDuck(0.20), qualityReview()], signalKeywords: [{ term: 'training', field: 'contentType', weight: 0.45 }, { term: 'onboarding', field: 'contentType', weight: 0.4 }, { term: 'policy', field: 'narration', weight: 0.2 }, { term: 'compliance', field: 'narration', weight: 0.3 }] };

const C12: EditProfile = { profileId: 'C-12', name: 'Recruitment / Culture Video', description: 'Employer brand, attract talent', category: 'content-format', filterPresetId: 'golden-hour-pro', pacing: 'medium', pacingMultiplier: 1.0, cutsPerMinRange: [10, 16], defaultTransition: 'dissolve', captionStyle: 'subtitle', bgmDuckLevel: 0.20, graphicsDensity: 'moderate', actions: [applyFilter('golden-hour-pro'), addTransition('dissolve'), addCaptions('subtitle'), lowerThird(), audioDuck(0.20), qualityReview()], signalKeywords: [{ term: 'team', field: 'narration', weight: 0.2 }, { term: 'culture', field: 'narration', weight: 0.3 }, { term: 'join us', field: 'narration', weight: 0.3 }, { term: 'recruitment', field: 'contentType', weight: 0.4 }] };

// ═══════════════════════════════════════════════════════════════════
// CATEGORY D — CINEMATIC STYLE (8 profiles)
// ═══════════════════════════════════════════════════════════════════

const D01: EditProfile = { profileId: 'D-01', name: 'Cinematic Premium', description: 'Film-quality brand films, every frame intentional', category: 'cinematic-style', filterPresetId: 'teal-orange', pacing: 'slow', pacingMultiplier: 1.40, cutsPerMinRange: [4, 8], defaultTransition: 'dip-to-black', captionStyle: 'none', bgmDuckLevel: 0.18, graphicsDensity: 'minimal', actions: [applyFilter('teal-orange'), addTransition('dip-to-black'), audioDuck(0.18), qualityReview(true)], signalKeywords: [{ term: 'orchestral', field: 'music', weight: 0.4 }, { term: 'cinematic', field: 'notes', weight: 0.5 }, { term: 'premium', field: 'notes', weight: 0.3 }, { term: 'film', field: 'notes', weight: 0.3 }] };

const D02: EditProfile = { profileId: 'D-02', name: 'Documentary Verite', description: 'Raw, observational, truth-feeling', category: 'cinematic-style', filterPresetId: 'muted-doc', pacing: 'slow', pacingMultiplier: 1.2, cutsPerMinRange: [5, 10], defaultTransition: 'hard-cut', captionStyle: 'subtitle', bgmDuckLevel: 0.25, graphicsDensity: 'minimal', actions: [applyFilter('muted-doc'), addTransition('hard-cut'), addCaptions('subtitle'), lowerThird(), audioDuck(0.25), qualityReview()], signalKeywords: [{ term: 'verite', field: 'notes', weight: 0.5 }, { term: 'observational', field: 'notes', weight: 0.4 }, { term: 'raw', field: 'notes', weight: 0.2 }, { term: 'authentic', field: 'notes', weight: 0.3 }] };

const D03: EditProfile = { profileId: 'D-03', name: 'Bold / High Energy', description: 'Maximum visual impact, sensory overload strategy', category: 'cinematic-style', filterPresetId: 'vivid', pacing: 'fast', pacingMultiplier: 0.65, cutsPerMinRange: [30, 50], defaultTransition: 'zoom-punch', captionStyle: 'fancy', bgmDuckLevel: 0.10, graphicsDensity: 'heavy', actions: [applyFilter('vivid'), addTransition('zoom-punch'), addFancyCaptions('kinetic'), beatSync('all', 0.4, 3), audioDuck(0.10), qualityReview()], signalKeywords: [{ term: 'bold', field: 'notes', weight: 0.4 }, { term: 'energetic', field: 'notes', weight: 0.3 }, { term: 'viral', field: 'notes', weight: 0.3 }, { term: 'trap', field: 'music', weight: 0.3 }] };

const D04: EditProfile = { profileId: 'D-04', name: 'Minimalist / Clean', description: 'Less is more, typography-forward', category: 'cinematic-style', filterPresetId: 'clean-corporate', pacing: 'slow', pacingMultiplier: 1.2, cutsPerMinRange: [5, 8], defaultTransition: 'hard-cut', captionStyle: 'none', bgmDuckLevel: 0.20, graphicsDensity: 'minimal', actions: [applyFilter('clean-corporate'), addTransition('hard-cut'), audioDuck(0.20), qualityReview()], signalKeywords: [{ term: 'minimal', field: 'notes', weight: 0.5 }, { term: 'clean', field: 'notes', weight: 0.3 }, { term: 'simple', field: 'notes', weight: 0.3 }, { term: 'white space', field: 'notes', weight: 0.4 }] };

const D05: EditProfile = { profileId: 'D-05', name: 'Retro / Vintage', description: 'Nostalgic aesthetic, film grain, analog imperfections', category: 'cinematic-style', filterPresetId: 'retro', pacing: 'medium', pacingMultiplier: 1.1, cutsPerMinRange: [6, 12], defaultTransition: 'dissolve', captionStyle: 'subtitle', bgmDuckLevel: 0.20, graphicsDensity: 'moderate', actions: [applyFilter('retro'), addTransition('dissolve'), addCaptions('subtitle'), audioDuck(0.20), qualityReview()], signalKeywords: [{ term: 'retro', field: 'notes', weight: 0.5 }, { term: 'vintage', field: 'notes', weight: 0.5 }, { term: 'nostalgic', field: 'notes', weight: 0.4 }, { term: 'vinyl', field: 'music', weight: 0.3 }] };

const D06: EditProfile = { profileId: 'D-06', name: 'Dark / Moody Thriller', description: 'Tension, mystery, psychological weight', category: 'cinematic-style', filterPresetId: 'desaturated-drama', pacing: 'slow', pacingMultiplier: 1.3, cutsPerMinRange: [4, 8], defaultTransition: 'hard-cut', captionStyle: 'none', bgmDuckLevel: 0.12, graphicsDensity: 'minimal', actions: [applyFilter('desaturated-drama'), addTransition('hard-cut'), audioDuck(0.12), qualityReview()], signalKeywords: [{ term: 'dark', field: 'notes', weight: 0.4 }, { term: 'thriller', field: 'notes', weight: 0.5 }, { term: 'tension', field: 'notes', weight: 0.3 }, { term: 'ominous', field: 'music', weight: 0.3 }] };

const D07: EditProfile = { profileId: 'D-07', name: 'Warm / Emotional Story', description: 'Human connection, golden warmth, held moments', category: 'cinematic-style', filterPresetId: 'film-portra', pacing: 'slow', pacingMultiplier: 1.2, cutsPerMinRange: [5, 10], defaultTransition: 'dissolve', captionStyle: 'subtitle', bgmDuckLevel: 0.22, graphicsDensity: 'minimal', actions: [applyFilter('film-portra'), addTransition('dissolve'), addCaptions('subtitle'), audioDuck(0.22), qualityReview()], signalKeywords: [{ term: 'emotional', field: 'music', weight: 0.4 }, { term: 'heartfelt', field: 'notes', weight: 0.4 }, { term: 'piano', field: 'music', weight: 0.3 }, { term: 'strings', field: 'music', weight: 0.3 }] };

const D08: EditProfile = { profileId: 'D-08', name: 'Luxury / Editorial', description: 'Premium restraint, zero clutter, confidence through pace', category: 'cinematic-style', filterPresetId: 'teal-orange', pacing: 'slow', pacingMultiplier: 1.50, cutsPerMinRange: [3, 6], defaultTransition: 'dip-to-black', captionStyle: 'none', bgmDuckLevel: 0.15, graphicsDensity: 'minimal', actions: [applyFilter('teal-orange'), addTransition('dip-to-black'), audioDuck(0.15), qualityReview(true)], signalKeywords: [{ term: 'luxury', field: 'notes', weight: 0.5 }, { term: 'premium', field: 'notes', weight: 0.4 }, { term: 'editorial', field: 'notes', weight: 0.4 }, { term: 'sophisticated', field: 'notes', weight: 0.3 }, { term: 'jazz', field: 'music', weight: 0.3 }] };

// ═══════════════════════════════════════════════════════════════════
// CATEGORY E — NARRATIVE MODE (6 profiles)
// ═══════════════════════════════════════════════════════════════════

const E01: EditProfile = { profileId: 'E-01', name: 'Problem → Solution (AIDA)', description: 'Pain → amplify → solve → prove → CTA', category: 'narrative-mode', filterPresetId: 'warm-neutral', pacing: 'variable', pacingMultiplier: 1.0, cutsPerMinRange: [10, 18], defaultTransition: 'dip-to-black', captionStyle: 'subtitle', bgmDuckLevel: 0.20, graphicsDensity: 'moderate', actions: [applyFilter('warm-neutral'), addTransition('dip-to-black'), addCaptions('subtitle'), audioDuck(0.20), qualityReview()], signalKeywords: [{ term: 'problem', field: 'narration', weight: 0.2 }, { term: 'solution', field: 'narration', weight: 0.2 }, { term: 'ad', field: 'contentType', weight: 0.3 }, { term: 'marketing', field: 'contentType', weight: 0.3 }] };

const E02: EditProfile = { profileId: 'E-02', name: 'Before → After Transformation', description: 'Felt before, transformation peak, aspirational after', category: 'narrative-mode', filterPresetId: 'vivid', pacing: 'variable', pacingMultiplier: 1.0, cutsPerMinRange: [8, 16], defaultTransition: 'zoom-punch', captionStyle: 'subtitle', bgmDuckLevel: 0.20, graphicsDensity: 'moderate', actions: [applyFilter('vivid'), addTransition('zoom-punch'), addCaptions('subtitle'), audioDuck(0.20), qualityReview()], signalKeywords: [{ term: 'before', field: 'narration', weight: 0.3 }, { term: 'after', field: 'narration', weight: 0.3 }, { term: 'transformation', field: 'narration', weight: 0.4 }, { term: 'results', field: 'narration', weight: 0.2 }] };

const E03: EditProfile = { profileId: 'E-03', name: 'Data-Driven / Evidence', description: 'Numbers tell the story, charts build live', category: 'narrative-mode', filterPresetId: 'clean-corporate', pacing: 'medium', pacingMultiplier: 1.0, cutsPerMinRange: [8, 14], defaultTransition: 'hard-cut', captionStyle: 'subtitle', bgmDuckLevel: 0.20, graphicsDensity: 'heavy', actions: [applyFilter('clean-corporate'), addTransition('hard-cut'), addCaptions('subtitle'), audioDuck(0.20), qualityReview()], signalKeywords: [{ term: 'data', field: 'narration', weight: 0.3 }, { term: 'statistics', field: 'narration', weight: 0.3 }, { term: 'percentage', field: 'narration', weight: 0.2 }, { term: 'chart', field: 'visual', weight: 0.3 }] };

const E04: EditProfile = { profileId: 'E-04', name: 'Origin Story / Brand Narrative', description: 'The founding moment, the why, the mission', category: 'narrative-mode', filterPresetId: 'film-portra', pacing: 'slow', pacingMultiplier: 1.2, cutsPerMinRange: [5, 10], defaultTransition: 'dissolve', captionStyle: 'subtitle', bgmDuckLevel: 0.22, graphicsDensity: 'minimal', actions: [applyFilter('film-portra'), addTransition('dissolve'), addCaptions('subtitle'), audioDuck(0.22), qualityReview()], signalKeywords: [{ term: 'founded', field: 'narration', weight: 0.3 }, { term: 'mission', field: 'narration', weight: 0.3 }, { term: 'story', field: 'narration', weight: 0.2 }, { term: 'brand film', field: 'contentType', weight: 0.4 }] };

const E05: EditProfile = { profileId: 'E-05', name: 'Expert Authority Build', description: 'Credentials → evidence → demonstration → social proof', category: 'narrative-mode', filterPresetId: 'clean-corporate', pacing: 'medium', pacingMultiplier: 1.0, cutsPerMinRange: [8, 14], defaultTransition: 'hard-cut', captionStyle: 'subtitle', bgmDuckLevel: 0.20, graphicsDensity: 'moderate', actions: [applyFilter('clean-corporate'), addTransition('hard-cut'), addCaptions('subtitle'), lowerThird(), audioDuck(0.20), qualityReview()], signalKeywords: [{ term: 'expert', field: 'character', weight: 0.3 }, { term: 'results show', field: 'narration', weight: 0.3 }, { term: 'data proves', field: 'narration', weight: 0.3 }] };

const E06: EditProfile = { profileId: 'E-06', name: 'Comedy / Entertainment', description: 'Punchline is the edit, timing IS the joke', category: 'narrative-mode', filterPresetId: 'vivid', pacing: 'variable', pacingMultiplier: 1.0, cutsPerMinRange: [12, 25], defaultTransition: 'hard-cut', captionStyle: 'subtitle', bgmDuckLevel: 0.15, graphicsDensity: 'moderate', actions: [applyFilter('vivid'), addTransition('hard-cut'), addCaptions('subtitle'), audioDuck(0.15), qualityReview()], signalKeywords: [{ term: 'funny', field: 'mood', weight: 0.4 }, { term: 'comedy', field: 'contentType', weight: 0.45 }, { term: 'satirical', field: 'mood', weight: 0.3 }] };

// ═══════════════════════════════════════════════════════════════════
// CATEGORY F — PRODUCTION MODE (4 profiles)
// ═══════════════════════════════════════════════════════════════════

const F01: EditProfile = { profileId: 'F-01', name: 'Full AI Generated', description: 'All scenes AI-generated via ThinkForge. Anti-slop mandatory.', category: 'production-mode', filterPresetId: 'cinematic', pacing: 'medium', pacingMultiplier: 1.0, cutsPerMinRange: [8, 15], defaultTransition: 'soft-cut', captionStyle: 'subtitle', bgmDuckLevel: 0.20, graphicsDensity: 'moderate', actions: [applyFilter('cinematic'), addTransition('soft-cut'), addCaptions('subtitle'), audioDuck(0.20), qualityReview(true)], signalKeywords: [{ term: 'AI-generated', field: 'contentType', weight: 0.5 }] };

const F02: EditProfile = { profileId: 'F-02', name: 'Real Footage + Script', description: 'Shot footage against ThinkForge script, transcription-aligned', category: 'production-mode', filterPresetId: 'cinematic', pacing: 'medium', pacingMultiplier: 1.0, cutsPerMinRange: [8, 15], defaultTransition: 'hard-cut', captionStyle: 'subtitle', bgmDuckLevel: 0.20, graphicsDensity: 'moderate', actions: [applyFilter('cinematic'), addTransition('hard-cut'), addCaptions('subtitle'), audioDuck(0.20), qualityReview()], signalKeywords: [{ term: 'real footage', field: 'contentType', weight: 0.4 }] };

const F03: EditProfile = { profileId: 'F-03', name: 'Screen Recording / Software Demo', description: 'UI recording with annotations and step-by-step graphics', category: 'production-mode', filterPresetId: 'clean-corporate', pacing: 'medium', pacingMultiplier: 1.0, cutsPerMinRange: [8, 14], defaultTransition: 'hard-cut', captionStyle: 'word-by-word', bgmDuckLevel: 0.18, graphicsDensity: 'heavy', actions: [applyFilter('clean-corporate'), addTransition('hard-cut'), addCaptions('word-by-word'), audioDuck(0.18), qualityReview()], signalKeywords: [{ term: 'screen', field: 'visual', weight: 0.5 }, { term: 'UI', field: 'visual', weight: 0.4 }, { term: 'click', field: 'visual', weight: 0.3 }, { term: 'software', field: 'visual', weight: 0.3 }] };

const F04: EditProfile = { profileId: 'F-04', name: 'Hybrid (AI + Real Footage)', description: 'Mixed AI and real footage, consistency bridging mandatory', category: 'production-mode', filterPresetId: 'cinematic', pacing: 'medium', pacingMultiplier: 1.0, cutsPerMinRange: [8, 15], defaultTransition: 'dip-to-black', captionStyle: 'subtitle', bgmDuckLevel: 0.20, graphicsDensity: 'moderate', actions: [applyFilter('cinematic'), addTransition('dip-to-black'), addCaptions('subtitle'), audioDuck(0.20), qualityReview(true)], signalKeywords: [] };

// ═══════════════════════════════════════════════════════════════════
// CATEGORY G — SPECIAL PURPOSE (2 profiles)
// ═══════════════════════════════════════════════════════════════════

const G01: EditProfile = { profileId: 'G-01', name: 'Universal Clean (Fallback)', description: 'Applied when detection confidence < 0.40. Clean, professional, safe.', category: 'special-purpose', filterPresetId: 'clean-corporate', pacing: 'medium', pacingMultiplier: 1.0, cutsPerMinRange: [10, 15], defaultTransition: 'hard-cut', captionStyle: 'subtitle', bgmDuckLevel: 0.20, graphicsDensity: 'moderate', actions: [applyFilter('clean-corporate'), addTransition('hard-cut'), addCaptions('subtitle'), lowerThird(), beatSync('downbeats', 0.7, 3), audioDuck(0.20), qualityReview()], signalKeywords: [] };

const G02: EditProfile = { profileId: 'G-02', name: 'Style Blend (Two-Profile Merge)', description: 'User specifies two profiles to blend at a given ratio', category: 'special-purpose', filterPresetId: 'cinematic', pacing: 'medium', pacingMultiplier: 1.0, cutsPerMinRange: [8, 15], defaultTransition: 'hard-cut', captionStyle: 'subtitle', bgmDuckLevel: 0.20, graphicsDensity: 'moderate', actions: [qualityReview()], signalKeywords: [] };

// ═══════════════════════════════════════════════════════════════════
// REGISTRY — All 54 profiles indexed by ID
// ═══════════════════════════════════════════════════════════════════

export const EDIT_PROFILES: Record<ProfileId, EditProfile> = {
  'A-01': A01, 'A-02': A02, 'A-03': A03, 'A-04': A04, 'A-05': A05, 'A-06': A06, 'A-07': A07, 'A-08': A08,
  'B-01': B01, 'B-02': B02, 'B-03': B03, 'B-04': B04, 'B-05': B05, 'B-06': B06, 'B-07': B07, 'B-08': B08,
  'B-09': B09, 'B-10': B10, 'B-11': B11, 'B-12': B12, 'B-13': B13, 'B-14': B14,
  'C-01': C01, 'C-02': C02, 'C-03': C03, 'C-04': C04, 'C-05': C05, 'C-06': C06, 'C-07': C07, 'C-08': C08,
  'C-09': C09, 'C-10': C10, 'C-11': C11, 'C-12': C12,
  'D-01': D01, 'D-02': D02, 'D-03': D03, 'D-04': D04, 'D-05': D05, 'D-06': D06, 'D-07': D07, 'D-08': D08,
  'E-01': E01, 'E-02': E02, 'E-03': E03, 'E-04': E04, 'E-05': E05, 'E-06': E06,
  'F-01': F01, 'F-02': F02, 'F-03': F03, 'F-04': F04,
  'G-01': G01, 'G-02': G02,
};

/** Get a profile by ID. Returns G-01 (Universal Clean) as fallback. */
export function getProfileById(id: ProfileId | string): EditProfile {
  return EDIT_PROFILES[id as ProfileId] || EDIT_PROFILES['G-01'];
}

/** Get all profiles in a category. */
export function getProfilesByCategory(category: string): EditProfile[] {
  return Object.values(EDIT_PROFILES).filter(p => p.category === category);
}

/** Get all profile IDs. */
export function getAllProfileIds(): ProfileId[] {
  return Object.keys(EDIT_PROFILES) as ProfileId[];
}
