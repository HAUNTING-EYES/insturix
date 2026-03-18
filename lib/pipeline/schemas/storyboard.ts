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
}

export interface StyleGuide {
  artStyle: string;
  colorPalette: string[];
  characterDescriptions?: Record<string, string>;
  environmentNotes?: string;
  negativePrompt?: string;
}

export interface StoryboardScene {
  sceneIndex: number;
  descriptor: SceneDescriptor;
  imageAssetId?: string;
  imageUrl?: string;
  status: 'pending' | 'generating' | 'generated' | 'approved' | 'rejected';
  generationHistory: Array<{
    assetId: string;
    imageUrl: string;
    timestamp: Date;
    feedback?: string;
    modelUsed: string;
  }>;
}

export interface Storyboard {
  storyboardId: string;
  projectId?: string;
  userId: string;
  sourceScriptId?: string;
  title?: string;
  styleGuide?: StyleGuide;
  scenes: StoryboardScene[];
  status: 'generating' | 'ready' | 'partial' | 'error';
  createdAt: Date;
  updatedAt: Date;
}
