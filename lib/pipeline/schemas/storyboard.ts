/**
 * Storyboard Types
 *
 * A storyboard is a collection of scenes with generated images that serve as
 * visual reference / stencils for video production in Editron.
 */

export interface SceneDescriptor {
  sceneIndex: number;
  title: string;
  narration: string;
  visualDescription: string;
  durationSeconds: number;
  mood: string;
  cameraDirection?: string;
  /** Audio/sound design notes from the script (e.g. "sirens, crowd noise") */
  audioDescription?: string;
}

export interface StyleGuide {
  artStyle: string;
  colorPalette: string[];
  characterDescriptions?: Record<string, string>;
  environmentNotes?: string;
  negativePrompt?: string;
}

export interface SceneVoiceover {
  audioUrl: string;
  audioAssetId: string;
  audioDurationMs: number;
  /** Word-level timing for caption sync (populated after STT on TTS output) */
  words?: Array<{
    word: string;
    startMs: number;
    endMs: number;
  }>;
}

export interface StoryboardScene {
  sceneIndex: number;
  descriptor: SceneDescriptor;
  imageAssetId?: string;
  imageUrl?: string;
  /** AI-generated video clip from the storyboard image */
  videoAssetId?: string;
  videoUrl?: string;
  videoProvider?: string;
  videoDurationMs?: number;
  status: 'pending' | 'generating' | 'generated' | 'approved' | 'rejected';
  voiceover?: SceneVoiceover;
  generationHistory: Array<{
    assetId: string;
    imageUrl: string;
    timestamp: Date;
    feedback?: string;
    modelUsed: string;
  }>;
}

export interface VoiceoverConfig {
  voice: string;
  language: string;
  status: 'pending' | 'generating' | 'ready' | 'error';
}

export interface Storyboard {
  storyboardId: string;
  projectId?: string;
  userId: string;
  sourceScriptId?: string;
  title?: string;
  styleGuide?: StyleGuide;
  scenes: StoryboardScene[];
  /** Generation mode: parallel (all at once) or sequential (one-by-one with approval) */
  mode?: 'parallel' | 'sequential';
  /** Voiceover configuration */
  voiceoverConfig?: VoiceoverConfig;
  status: 'generating' | 'ready' | 'partial' | 'error';
  createdAt: Date;
  updatedAt: Date;
}
