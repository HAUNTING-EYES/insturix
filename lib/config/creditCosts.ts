/**
 * Credit Cost Configuration
 * 
 * Defines how credits are consumed per service/action.
 * Pricing baseline: 30 credits = 1 USD.
 */

export type CreditBillingType = 'per_request' | 'per_minute' | 'per_second' | 'per_token' | 'per_character';

export interface CreditCostConfig {
  service: string;
  action: string;
  billingType: CreditBillingType;
  baseCost: number;
  description: string;
  // Model-specific multipliers (multiplied against baseCost)
  // Note: To be populated based on implemented models in codebase
  modelMultipliers?: Record<string, number>;
  // Request type multipliers (for services with different request types)
  requestTypeMultipliers?: Record<string, number>;
}

export class CreditCostConfigurationError extends Error {
  readonly service: string;
  readonly action?: string;

  constructor(service: string, action?: string) {
    const target = action ? `${service}.${action}` : service;
    super(`Credit cost is not configured for ${target}`);
    this.name = 'CreditCostConfigurationError';
    this.service = service;
    this.action = action;
  }
}

export const CREDITS_PER_USD = 30;
export const USD_PER_CREDIT = 1 / CREDITS_PER_USD;
export const ANNUAL_BILLING_MULTIPLIER = 10;

export function creditsForUsd(usd: number): number {
  return Math.round(usd * CREDITS_PER_USD);
}

/**
 * Credit pools.
 *
 * The wallet has two independent balances:
 * - `main`  — everyday workflow: chat, scripts, calendar, scans, posting,
 *             render/export, analysis, transcription, orchestration.
 * - `media` — AI generation of image / video / audio only. This is the
 *             margin-dangerous spend (Fal image/video, music), so it is metered
 *             separately: heavy generation cannot drain the workflow pool, and
 *             everyday usage cannot drain the generation pool.
 *
 * Source: docs/financials/provider-cost-telemetry-final-plan-2026-07-01.md
 *   "AI video/image/audio should keep a separate quota, but normal LLM,
 *    analysis, storage, posting, and infra still need unit economics."
 */
export type CreditPool = 'main' | 'media';

/**
 * `service.action` pairs that draw the MEDIA pool (image/video/audio generation).
 * Every other configured action draws the MAIN pool (see `getCreditPool`).
 *
 * Audit note (senior-dev override): kept as one authoritative, greppable list so
 * the full media surface can be reviewed at a glance. When adding a new AI
 * generation action to CREDIT_COSTS, add its `service.action` here too, or it
 * will (safely) bill the main pool by default.
 */
export const MEDIA_POOL_ACTIONS: ReadonlySet<string> = new Set<string>([
  // Text-to-image
  'thinkforge.image_generation',
  'clickatron.variation',
  // Audio generation
  'musitron.music_generation',
  'pipeline.voiceover_generation',
  'pipeline.bgm_generation',
  'pipeline.sfx_generation',
  // Storyboard / reference image generation
  'pipeline.storyboard_generation',
  'pipeline.storyboard_image_generation',
  'pipeline.storyboard_image_regeneration',
  'pipeline.storyboard_context_regeneration',
  'pipeline.reference_generation',
  'pipeline.reference_image',
  'pipeline.reference_image_regen',
  // Video generation
  'pipeline.video_generation',
]);

/**
 * Which pool an action draws from. Defaults to 'main' for any action not
 * explicitly marked as media generation (fail-safe: unknown = main workflow).
 * Does NOT throw — classification is orthogonal to whether a cost is configured
 * (getCreditCost handles the fail-closed unknown-action check).
 */
export function getCreditPool(service: string, action: string): CreditPool {
  return MEDIA_POOL_ACTIONS.has(`${service}.${action}`) ? 'media' : 'main';
}

function normalizeCreditQuantity(quantity?: number): number {
  if (quantity === undefined) return 1;
  if (!Number.isFinite(quantity) || quantity <= 0) return 1;
  return Math.ceil(quantity);
}

/**
 * Credit costs per service
 * 
 * Consumption order:
 * 1. Subscription credits first (they expire monthly)
 * 2. Top-up credits second (they never expire)
 */
export const CREDIT_COSTS: Record<string, CreditCostConfig[]> = {
  thinkforge: [
    {
      service: 'thinkforge',
      action: 'chat_message',
      billingType: 'per_request',
      baseCost: 0.2,
      description: 'Per chat message/interaction (target: 1 credit per 5 messages)',
      modelMultipliers: {},
    },
    {
      service: 'thinkforge',
      action: 'image_generation',
      billingType: 'per_request',
      baseCost: 5,
      description: 'Per image generated',
      modelMultipliers: {},
    },
    {
      service: 'thinkforge',
      action: 'document_creation',
      billingType: 'per_request',
      baseCost: 5,
      description: 'Per document created via blueprint',
      modelMultipliers: {},
    },
  ],
  
  alyzitron: [
    {
      service: 'alyzitron',
      action: 'video_analysis',
      billingType: 'per_minute',
      baseCost: 8,
      description: 'Per minute of video analyzed on flash-lite analysis path',
      modelMultipliers: {
        'gemini-3.1-flash-lite-preview': 1,
        'gemini-3.1-flash-lite': 1,
        'gemini-2.5-flash': 1.25,
        'gemini-3.1-pro-preview': 3.75,
        'gemini-3.1-pro-heavy': 9.125,
      },
    },
    {
      service: 'alyzitron',
      action: 'transcription',
      billingType: 'per_minute',
      baseCost: 3,
      description: 'Per minute of standalone transcription via Deepgram/fal fallback',
      modelMultipliers: {},
    },
    {
      service: 'alyzitron',
      action: 'chat_message',
      billingType: 'per_token',
      baseCost: 0.5,
      description: 'Per 1000 estimated tokens for Alyzitron report chat and summarization',
      modelMultipliers: {
        'gemini-2.5-flash': 1,
        'gemini-3.1-flash-lite': 1,
        'gemini-3.1-pro-preview': 4,
      },
    },
  ],
  
  editron: [
    {
      service: 'editron',
      action: 'ai_chat',
      billingType: 'per_token',
      baseCost: 0.5, // Credits per 1000 tokens (input + output combined)
      description: 'Per 1000 tokens consumed',
      // Model-specific multipliers (gemini-2.5-flash is baseline 1x)
      modelMultipliers: {
        'gemini-3.1-flash-lite-preview': 1,
        'gemini-3.1-flash-lite': 1,
        'gemini-2.5-flash': 1,
        'gemini-1.5-pro': 3,
        'gemini-3.1-pro-preview': 4,
      },
    },
    {
      service: 'editron',
      action: 'render_export',
      billingType: 'per_minute',
      baseCost: 3,
      description: 'Per output minute of Editron render/export',
      requestTypeMultipliers: {
        standard: 1,
        chapter: 1.5,
        uhd: 3,
      },
    },
    {
      service: 'editron',
      action: 'auto_edit_analysis',
      billingType: 'per_minute',
      baseCost: 12,
      description: 'Per source video minute for Editron auto-edit analysis and director planning',
      requestTypeMultipliers: {
        standard: 1,
        reference_guided: 1.25,
        long_form: 1.5,
      },
    },
    {
      service: 'editron',
      action: 'asset_analysis',
      billingType: 'per_minute',
      baseCost: 6,
      description: 'Per uploaded asset analysis unit for Editron media-library AI tagging, embeddings, and graph enrichment',
      requestTypeMultipliers: {
        video: 1,
        image: 0.5,
        audio: 0.5,
      },
    },
  ],
  
  musitron: [
    {
      service: 'musitron',
      action: 'music_generation',
      billingType: 'per_request',
      baseCost: 1, // Base is 1, multipliers define the actual model cost
      description: 'Per music track generated',
      modelMultipliers: {
        'fal-ai/minimax-music/v2': 5,
        'fal-ai/minimax-music/v1': 5,
        'sonauto/v2/text-to-music': 11,
        'fal-ai/ace-step/prompt-to-audio': 1,
        'beatoven/music-generation': 15,
        'beatoven/sound-effect-generation': 15,
        'fal-ai/stable-audio/v2.5': 30,
      },
    },
  ],
  
  clickatron: [
    {
      service: 'clickatron',
      action: 'variation',
      billingType: 'per_request',
      baseCost: 5,
      description: 'Per image variation generated',
      modelMultipliers: {
        'fal-ai/imagen4/preview': 1,
        'fal-ai/bytedance/seedream/v4/edit': 1,
        'fal-ai/bytedance/seedream/v4/text-to-image': 1,
        'fal-ai/flux-kontext/dev': 1,
        'fal-ai/flux/dev/inpainting': 0.8,
        'fal-ai/nano-banana': 1,
        'fal-ai/nano-banana/edit': 1,
        'fal-ai/bytedance/seedream/v4.5/text-to-image': 1.2,
        'fal-ai/bytedance/seedream/v4.5/edit': 1.2,
        'fal-ai/nano-banana-pro': 4.6,
        'fal-ai/nano-banana-pro/edit': 4.6,
        'fal-ai/gemini-3-pro-image-preview': 4,
      },
      requestTypeMultipliers: {
        'variation': 1,
        'generation': 1.5,
        'upscale': 0.5,
        'background_removal': 0.3,
      },
    },
  ],

  calos: [
    {
      service: 'calos',
      action: 'ai_plan',
      billingType: 'per_request',
      baseCost: 20,
      description: 'Per AI content-calendar plan run, including planner and configured trend providers',
      modelMultipliers: {},
    },
    {
      service: 'calos',
      action: 'generate_deliverable',
      billingType: 'per_request',
      baseCost: 5,
      description: 'Per wired CalOS deliverable generator run; downstream media generation is billed separately',
      requestTypeMultipliers: {
        thinkforge: 1,
        clickatron: 1,
      },
    },
  ],

  brand_vault: [
    {
      service: 'brand_vault',
      action: 'brand_scan',
      billingType: 'per_request',
      baseCost: 15,
      description: 'Per queued Brand Vault website refinery scan',
      requestTypeMultipliers: {
        base: 1,
        deep: 2,
      },
    },
  ],
  uploaderx: [
    {
      service: 'uploaderx',
      action: 'platform_publish',
      billingType: 'per_request',
      baseCost: 1,
      description: 'Per successful social platform publish through UploaderX',
      requestTypeMultipliers: {
        twitter: 3,
        x: 3,
        youtube: 1,
        facebook: 1,
        instagram: 1,
        linkedin: 1,
      },
    },
  ],
  pipeline: [
    {
      service: 'pipeline',
      action: 'video_generation',
      billingType: 'per_second',
      baseCost: 1,
      description: 'Per second of AI video generated from storyboard',
      modelMultipliers: {
        // Absolute credits/sec (baseCost 1 * this). Traced to fal $/sec in
        // docs/financials/code-backed-pricing-viability-audit-2026-06-29.md.
        'kling-2.1': 15,
        'kling-2.6': 17,
        'veo-3.1': 30,
        'seedance-1.5': 36,
        'seedance-2.0': 45,
        // happy-horse-v1.1 (native-audio, 1080p default): fal charges $0.18/sec at 1080p
        // ($0.14/sec at 720p). Interpolated on the audio-model curve (Kling 2.6 audio
        // $0.14->17, Veo 3.1 audio $0.40->30) => ~20 credits/sec at $0.18/sec.
        'happy-horse-v1.1': 20,
      },
    },
    {
      service: 'pipeline',
      action: 'voiceover_generation',
      billingType: 'per_character',
      baseCost: 3,
      description: 'Per 1000 narration characters for Kokoro/Deepgram storyboard voiceover generation',
      requestTypeMultipliers: {
        kokoro: 1,
        deepgram: 1,
      },
    },
    {
      service: 'pipeline',
      action: 'storyboard_generation',
      billingType: 'per_request',
      baseCost: 5,
      description: 'Per storyboard image generated',
      modelMultipliers: {},
    },
    {
      service: 'pipeline',
      action: 'storyboard_finalize',
      billingType: 'per_request',
      baseCost: 8,
      description: 'Finalize storyboard into Editron project; generated BGM/SFX are billed separately',
      modelMultipliers: {},
    },
    {
      service: 'pipeline',
      action: 'bgm_generation',
      billingType: 'per_second',
      baseCost: 0.1,
      description: 'Per billable second of generated storyboard background music',
      requestTypeMultipliers: {
        cassetteai: 1,
      },
    },
    {
      service: 'pipeline',
      action: 'sfx_generation',
      billingType: 'per_second',
      baseCost: 0.5,
      description: 'Per billable second of generated storyboard sound effects',
      requestTypeMultipliers: {
        library_or_ai: 1,
        synced_video: 1.5,
      },
    },
    {
      service: 'pipeline',
      action: 'reference_generation',
      billingType: 'per_request',
      baseCost: 5,
      description: 'Per reference image generated (legacy action name)',
      modelMultipliers: {},
    },
    {
      service: 'pipeline',
      action: 'reference_image',
      billingType: 'per_request',
      baseCost: 5,
      description: 'Per reference image generated for visual consistency',
      modelMultipliers: {},
    },
    {
      service: 'pipeline',
      action: 'reference_image_regen',
      billingType: 'per_request',
      baseCost: 5,
      description: 'Per reference image regenerated with feedback',
      modelMultipliers: {},
    },
    {
      service: 'pipeline',
      action: 'storyboard_image_generation',
      billingType: 'per_request',
      baseCost: 5,
      description: 'Per storyboard image generated (batch or sequential)',
      modelMultipliers: {
        'fal-ai/flux/schnell': 1,
        'fal-ai/flux/dev': 1,
        'fal-ai/flux-pro/v1.1': 1,
        'fal-ai/imagen4/preview': 1,
        'fal-ai/bytedance/seedream/v4/text-to-image': 1,
        'fal-ai/bytedance/seedream/v4.5/text-to-image': 1.2,
        'fal-ai/recraft-v3': 1,
        'fal-ai/nano-banana': 1,
        'fal-ai/nano-banana-2': 1,
        'fal-ai/nano-banana-pro': 4.6,
        'photon-1': 3,
      },
    },
    {
      service: 'pipeline',
      action: 'storyboard_image_regeneration',
      billingType: 'per_request',
      baseCost: 5,
      description: 'Per storyboard image regenerated with feedback',
      modelMultipliers: {},
    },
    {
      service: 'pipeline',
      action: 'storyboard_context_regeneration',
      billingType: 'per_request',
      baseCost: 5,
      description: 'Per scene storyboard image regenerated with context feedback',
      modelMultipliers: {},
    },
    {
      service: 'pipeline',
      action: 'script_import',
      billingType: 'per_request',
      baseCost: 5,
      description: 'Import a ThinkForge script into an Editron project',
      modelMultipliers: {},
    },
  ],
};

// Subscription Plans (USD Only)
// Yearly = 10x monthly (2 months free)
export interface SubscriptionPlan {
  id: string; // Internal ID (e.g. 'agency_starter')
  name: string;
  description: string;
  credits: number; // Monthly credit grant
  price: number; // USD monthly
  yearlyPrice: number; // USD yearly (2 months free)
  currency: 'USD';
  features: string[];
  popular?: boolean;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'agency_starter',
    name: 'Agency Starter',
    description: 'Core agency operating system for one growing team',
    credits: creditsForUsd(100),
    price: 100,
    yearlyPrice: 100 * ANNUAL_BILLING_MULTIPLIER,
    currency: 'USD',
    features: [
      '3,000 Monthly Credits',
      'Core workspace and content calendar',
      'Limited Brand Vault scans and UploaderX posts',
      'AI media uses model-weighted credits'
    ]
  },
  {
    id: 'agency_growth',
    name: 'Agency Growth',
    description: 'Higher-volume agency workflow with more brands and automation',
    credits: creditsForUsd(500),
    price: 500,
    yearlyPrice: 500 * ANNUAL_BILLING_MULTIPLIER,
    currency: 'USD',
    popular: true,
    features: [
      '15,000 Monthly Credits',
      'More brands, seats, scans, and posts',
      'Priority queues for generation workflows',
      'AI media uses model-weighted credits'
    ]
  },
  {
    id: 'agency_scale',
    name: 'Agency Scale',
    description: 'Large agency plan for heavier recurring production',
    credits: creditsForUsd(1000),
    price: 1000,
    yearlyPrice: 1000 * ANNUAL_BILLING_MULTIPLIER,
    currency: 'USD',
    features: [
      '30,000 Monthly Credits',
      'Larger workspaces, brands, storage, and posting volume',
      'Advanced workflow and review capacity',
      'AI media uses model-weighted credits'
    ]
  }
];

// Legacy support helpers
export const PLAN_CREDIT_ALLOCATIONS: Record<string, number> = {
  free: 10,
  plus: creditsForUsd(20),
  pro: creditsForUsd(49),
  premium: creditsForUsd(99),
  starter: creditsForUsd(100),
  agency_starter: creditsForUsd(100),
  growth: creditsForUsd(500),
  agency_growth: creditsForUsd(500),
  scale: creditsForUsd(1000),
  agency_scale: creditsForUsd(1000),
};

/**
 * Monthly MEDIA-pool grant per plan (image/video/audio generation).
 *
 * This is granted ON TOP of the plan's main-pool value above (founder decision
 * 2026-07-02: "media on top, not carved out"). So an Agency Scale user gets the
 * full 30000 main credits AND 9000 media credits each cycle.
 *
 * Derivation (ADJUSTABLE — this is the pricing lever, change here only):
 *   Real per-action media costs — image = 5 credits, video = 15-45 credits/sec
 *   (both already traced to fal $/sec in CREDIT_COSTS above). Sized to deliver a
 *   realistic monthly generation bundle per tier (agency-scale reference bundle:
 *   ~80 images + ~36 short clips + audio) with headroom, scaled down for lower
 *   tiers. Free = 0 (free plan is main-pool only, 10 credits).
 */
export const PLAN_MEDIA_CREDIT_ALLOCATIONS: Record<string, number> = {
  free: 0,
  plus: 0, // legacy, retired — main-pool only
  pro: 0, // legacy, retired
  premium: 0, // legacy, retired
  starter: 1000,
  agency_starter: 1000,
  growth: 4000,
  agency_growth: 4000,
  scale: 9000,
  agency_scale: 9000,
};

/**
 * Top-up credit packages
 */
export interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  prices: Record<string, number>; // currency -> amount
}

export const CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: 'topup_150',
    name: 'Top-up 150',
    credits: creditsForUsd(5),
    prices: {
      USD: 5,
    },
  },
  {
    id: 'topup_600',
    name: 'Top-up 600',
    credits: creditsForUsd(20),
    prices: {
      USD: 20,
    },
  },
  {
    id: 'credit_pack_starter',
    name: 'Starter Credit Pack',
    credits: creditsForUsd(25),
    prices: {
      USD: 25,
    },
  },
  {
    id: 'credit_pack_agency',
    name: 'Agency Credit Pack',
    credits: creditsForUsd(100),
    prices: {
      USD: 100,
    },
  },
  {
    id: 'credit_pack_scale',
    name: 'Scale Credit Pack',
    credits: creditsForUsd(300),
    prices: {
      USD: 300,
    },
  },
];
/**
 * Get credit cost for a specific service action
 */
export function getCreditCost(
  service: string,
  action: string,
  options?: {
    model?: string;
    requestType?: string;
    tokenCount?: number; // For token-based billing
    characterCount?: number; // For character-based billing
    durationMinutes?: number; // For per-minute billing
    durationSeconds?: number; // For per-second billing
    quantity?: number; // For batch/fan-out operations
  }
): number {
  const serviceCosts = CREDIT_COSTS[service];
  if (!serviceCosts) {
    throw new CreditCostConfigurationError(service);
  }

  const costConfig = serviceCosts.find(c => c.action === action);
  if (!costConfig) {
    throw new CreditCostConfigurationError(service, action);
  }

  let cost = costConfig.baseCost;

  // Apply model multiplier if specified
  if (options?.model && costConfig.modelMultipliers?.[options.model]) {
    cost *= costConfig.modelMultipliers[options.model];
  }

  // Apply request type multiplier if specified
  if (options?.requestType && costConfig.requestTypeMultipliers?.[options.requestType]) {
    cost *= costConfig.requestTypeMultipliers[options.requestType];
  }

  // Handle token-based billing
  if (costConfig.billingType === 'per_token' && options?.tokenCount) {
    // baseCost is per 1000 tokens
    cost = (options.tokenCount / 1000) * cost;
  }

  // Handle character-based billing
  if (costConfig.billingType === 'per_character' && options?.characterCount) {
    // baseCost is per 1000 characters
    cost = (options.characterCount / 1000) * cost;
  }

  // Handle per-minute billing
  if (costConfig.billingType === 'per_minute' && options?.durationMinutes) {
    cost *= options.durationMinutes;
  }

  // Handle per-second billing
  if (costConfig.billingType === 'per_second' && options?.durationSeconds) {
    cost *= options.durationSeconds;
  }

  cost *= normalizeCreditQuantity(options?.quantity);

  // Round to 2 decimal places
  return Math.round(cost * 100) / 100;
}

/**
 * Get plan credit allocation
 */
export function getPlanCreditAllocation(planType: string): number {
  const normalized = planType
    .toLowerCase()
    .replace(/\s+plan$/, '')
    .replace(/\s+/g, '_');
  return PLAN_CREDIT_ALLOCATIONS[normalized] ?? PLAN_CREDIT_ALLOCATIONS.free;
}

/**
 * Get plan MEDIA-pool credit allocation (image/video/audio generation).
 * Granted on top of the main-pool allocation. Defaults to 0 for unknown/legacy
 * plans (they operate on the main pool only).
 */
export function getPlanMediaCreditAllocation(planType: string): number {
  const normalized = planType
    .toLowerCase()
    .replace(/\s+plan$/, '')
    .replace(/\s+/g, '_');
  return PLAN_MEDIA_CREDIT_ALLOCATIONS[normalized] ?? 0;
}
