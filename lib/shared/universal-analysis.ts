/**
 * Universal Analysis Interface
 *
 * Cross-service content analysis abstraction for the Insturix platform.
 * Every service (Editron, Clickatron, ThinkForge, Musitron, Alyzitron)
 * can both PRODUCE and CONSUME content analysis through this interface.
 *
 * This is the foundation for:
 * - CTO's Brand DNA Vault vision (centralized brand intelligence)
 * - Cross-service intelligence sharing
 * - Semantic search across all content types
 *
 * Design principle: Each service implements an adapter that translates
 * its domain-specific analysis into the universal format. This keeps
 * services decoupled while enabling intelligence sharing.
 */

// ─── Universal Types ────────────────────────────────────────────

export type ContentType = 'video' | 'image' | 'text' | 'audio' | 'webpage';
export type ServiceId = 'editron' | 'clickatron' | 'thinkforge' | 'musitron' | 'alyzitron' | 'uploaderx';

export interface ContentInput {
  type: ContentType;
  url?: string;        // For media content
  content?: string;    // For text content
  contentRef?: string; // Asset ID, URL, or stable content reference
  metadata?: Record<string, any>;
  userId: string;
  projectId?: string;
}

export interface Subject {
  label: string;
  category: 'person' | 'product' | 'logo' | 'text' | 'scene' | 'object' | 'animal' | 'other';
  confidence: number;   // 0-1
  boundingBox?: { x: number; y: number; width: number; height: number }; // Normalized 0-1
}

export interface SentimentScore {
  overall: number;      // -1 to 1 (negative to positive)
  energy: number;       // 0-1 (calm to energetic)
  formality: number;    // 0-1 (casual to formal)
}

export interface ContentAnalysis {
  /** Unique ID for this analysis */
  id: string;
  /** Which service produced this analysis */
  source: ServiceId;
  /** What type of content was analyzed */
  contentType: ContentType;
  /** When the analysis was performed */
  analyzedAt: Date;
  /** User who owns this content */
  userId: string;
  /** Project this belongs to (if any) */
  projectId?: string;
  /** Reference to the original content (asset ID, URL, etc.) */
  contentRef: string;

  // ── Universal Fields (all services populate these) ──

  /** Main subjects detected in the content */
  subjects: Subject[];
  /** Emotional tone and energy */
  sentiment: SentimentScore;
  /** Topic/category tags */
  topics: string[];
  /** Energy level 0-1 */
  energy: number;
  /** Semantic embedding for cross-service search */
  embedding: number[];

  // ── Service-Specific Extension ──

  /** Service-specific analysis data */
  serviceSpecific: Record<string, any>;
}

// ─── Adapter Interface ──────────────────────────────────────────

/**
 * Each Insturix service implements this adapter to produce universal analysis.
 * This decouples services while enabling intelligence sharing.
 */
export interface AnalysisAdapter {
  serviceId: ServiceId;
  supportedTypes: ContentType[];

  /**
   * Analyze content and produce universal format.
   * The adapter translates domain-specific results into the universal schema.
   */
  analyze(input: ContentInput): Promise<ContentAnalysis>;

  /**
   * Get cached analysis if available.
   */
  getCached(contentRef: string, userId: string): Promise<ContentAnalysis | null>;
}

// ─── Editron Adapter ────────────────────────────────────────────

/**
 * Wraps Editron's 5-Track Analysis into the universal format.
 * This is the most feature-rich adapter (video analysis is the most complex).
 */
export class EditronAnalysisAdapter implements AnalysisAdapter {
  serviceId: ServiceId = 'editron';
  supportedTypes: ContentType[] = ['video', 'image', 'audio'];

  async analyze(input: ContentInput): Promise<ContentAnalysis> {
    const { nanoid } = await import('nanoid');

    if (input.type === 'video' && input.url) {
      // Use existing 5-Track Analysis
      const { runFullAnalysis } = await import('@/lib/editron/services/five-track-analysis');
      const analysis = await runFullAnalysis(input.contentRef || `ua_${nanoid(8)}`, input.userId, {
        videoUrl: input.url,
        durationMs: input.metadata?.durationMs || 5000,
        sourceType: input.metadata?.sourceType || 'real-footage',
      });

      return this.convertToUniversal(analysis, input);
    }

    // Fallback: basic analysis for non-video
    return this.basicAnalysis(input);
  }

  async getCached(contentRef: string, userId: string): Promise<ContentAnalysis | null> {
    const { getAnalysis } = await import('@/lib/editron/services/five-track-analysis');
    const analysis = await getAnalysis(contentRef);
    if (!analysis) return null;

    return this.convertToUniversal(analysis, {
      type: 'video',
      userId,
      contentRef,
    } as any);
  }

  private convertToUniversal(analysis: any, input: ContentInput): ContentAnalysis {
    const subjects: Subject[] = [];
    const topics: string[] = [];

    // Extract subjects from Layer 5
    if (analysis?.subjects) {
      for (const s of analysis.subjects) {
        subjects.push({
          label: s.label || s.category || 'unknown',
          category: s.category || 'object',
          confidence: s.confidence || 0.7,
          boundingBox: s.boundingBox,
        });
      }
    }

    // Extract topics from keyframes
    if (analysis?.keyframes) {
      for (const kf of analysis.keyframes) {
        if (kf.mood) topics.push(kf.mood);
        if (kf.shotType) topics.push(kf.shotType);
      }
    }

    // Energy from motion analysis
    const energy = analysis?.motion?.averageIntensity || 0.5;

    return {
      id: `editron_${Date.now()}`,
      source: 'editron',
      contentType: input.type,
      analyzedAt: new Date(),
      userId: input.userId,
      projectId: input.projectId,
      contentRef: input.contentRef || '',
      subjects,
      sentiment: {
        overall: 0,
        energy,
        formality: 0.5,
      },
      topics: [...new Set(topics)],
      energy,
      embedding: [], // Populated separately by embedding service
      serviceSpecific: {
        fiveTrackAnalysis: analysis,
      },
    };
  }

  private async basicAnalysis(input: ContentInput): Promise<ContentAnalysis> {
    return {
      id: `editron_basic_${Date.now()}`,
      source: 'editron',
      contentType: input.type,
      analyzedAt: new Date(),
      userId: input.userId,
      projectId: input.projectId,
      contentRef: input.contentRef || '',
      subjects: [],
      sentiment: { overall: 0, energy: 0.5, formality: 0.5 },
      topics: [],
      energy: 0.5,
      embedding: [],
      serviceSpecific: {},
    };
  }
}

// ─── Stub Adapters for Future Services ──────────────────────────

/** Clickatron: Image composition analysis */
export class ClickatronAnalysisAdapter implements AnalysisAdapter {
  serviceId: ServiceId = 'clickatron';
  supportedTypes: ContentType[] = ['image'];

  async analyze(input: ContentInput): Promise<ContentAnalysis> {
    // Stub — will implement Gemini Vision composition analysis
    return {
      id: `clickatron_${Date.now()}`,
      source: 'clickatron',
      contentType: 'image',
      analyzedAt: new Date(),
      userId: input.userId,
      contentRef: input.contentRef || '',
      subjects: [],
      sentiment: { overall: 0, energy: 0.5, formality: 0.5 },
      topics: [],
      energy: 0.5,
      embedding: [],
      serviceSpecific: {},
    };
  }

  async getCached(): Promise<ContentAnalysis | null> { return null; }
}

/** ThinkForge: Script/text semantic analysis */
export class ThinkForgeAnalysisAdapter implements AnalysisAdapter {
  serviceId: ServiceId = 'thinkforge';
  supportedTypes: ContentType[] = ['text'];

  async analyze(input: ContentInput): Promise<ContentAnalysis> {
    // Stub — will implement topic extraction, tone analysis, entity detection
    return {
      id: `thinkforge_${Date.now()}`,
      source: 'thinkforge',
      contentType: 'text',
      analyzedAt: new Date(),
      userId: input.userId,
      contentRef: input.contentRef || '',
      subjects: [],
      sentiment: { overall: 0, energy: 0.5, formality: 0.5 },
      topics: [],
      energy: 0.5,
      embedding: [],
      serviceSpecific: {},
    };
  }

  async getCached(): Promise<ContentAnalysis | null> { return null; }
}

// ─── Registry ───────────────────────────────────────────────────

const adapters: Map<ServiceId, AnalysisAdapter> = new Map();

export function registerAdapter(adapter: AnalysisAdapter): void {
  adapters.set(adapter.serviceId, adapter);
}

export function getAdapter(serviceId: ServiceId): AnalysisAdapter | undefined {
  return adapters.get(serviceId);
}

/**
 * Analyze content using the appropriate service adapter.
 * Automatically routes to the right adapter based on content type.
 */
export async function analyzeContent(input: ContentInput & { contentRef: string }): Promise<ContentAnalysis> {
  // Find adapter that supports this content type
  for (const adapter of adapters.values()) {
    if (adapter.supportedTypes.includes(input.type)) {
      return adapter.analyze(input);
    }
  }
  throw new Error(`No adapter registered for content type: ${input.type}`);
}

// Auto-register Editron adapter (it's always available)
registerAdapter(new EditronAnalysisAdapter());
registerAdapter(new ClickatronAnalysisAdapter());
registerAdapter(new ThinkForgeAnalysisAdapter());
