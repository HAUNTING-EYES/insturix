/**
 * Reference Image Types
 *
 * A reference image set contains visual references for key subjects
 * identified in a script. These are used during storyboard generation
 * (via IP-adapter) to maintain visual consistency across scenes.
 */

export interface SubjectReference {
  subjectId: string;
  name: string;
  category: 'character' | 'product' | 'location' | 'object' | 'vehicle';
  visualDescription: string;
  scenesAppearingIn: number[];
  imageUrl?: string;
  imageAssetId?: string;
  imageGcsPath?: string;
  status: 'pending' | 'generating' | 'generated' | 'approved' | 'rejected';
  generationHistory: Array<{
    assetId: string;
    imageUrl: string;
    timestamp: Date;
    feedback?: string;
  }>;
}

export interface ReferenceImageSet {
  refSetId: string;
  userId: string;
  sourceScriptId?: string;
  subjects: SubjectReference[];
  status: 'generating' | 'ready' | 'approved' | 'partial' | 'error';
  createdAt: Date;
  updatedAt: Date;
}
