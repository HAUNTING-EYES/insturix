import type { DetectionResult, ProfileId } from "@/lib/editron/data/edit-profile-types";

export type ExportStep =
  | "configure"
  | "exporting"
  | "profile-selection"
  | "extracting-subjects"
  | "generating-references"
  | "reviewing-references"
  | "storyboard"
  | "reviewing-storyboard"
  | "generating-videos"
  | "generating-voiceover"
  | "finalizing"
  | "directing"
  | "done";

export type ReferenceImageProvenance =
  | "brand-vault"
  | "website-screenshot"
  | "uploaded"
  | "generated"
  | "missing-brand-evidence";

export type BrandEvidenceStatus = "resolved" | "missing" | "not-required";
export interface SubjectRef {
  subjectId: string;
  name: string;
  category: string;
  imageUrl?: string;
  status: string;
  scenesAppearingIn: number[];
  visualDescription?: string;
  priority?: "hero" | "suggested";
  referenceProvenance?: ReferenceImageProvenance;
  referenceProvenanceLabel?: string;
  requiresBrandEvidence?: boolean;
  brandEvidenceStatus?: BrandEvidenceStatus;
  evidenceRequiredReason?: string;
}

export interface SuggestedSubject {
  id: string;
  name: string;
  category: string;
  visualDescription: string;
  scenesAppearingIn: number[];
}

export interface ExportConfig {
  title: string;
  aspectRatio: string;
  generateStoryboard: boolean;
  generateVideos: boolean;
  artStyle: string;
  imageModel: string;
  videoModel: string;
  enableChaining: boolean;
  selectedVoice: string;
}

export interface Voice {
  id: string;
  name: string;
  gender?: string;
  style?: string;
}

export interface BriefOverrides {
  platform: string;
  tone: string;
  captionStyle: string;
  bgmMood: string;
}

export interface DirectorProgress {
  step: number;
  total: number;
  desc: string;
}

export interface NewSubjectFormState {
  name: string;
  category: string;
  description: string;
  scenes: string;
}

export const PROCESSING_STAGES: ExportStep[] = [
  "exporting",
  "extracting-subjects",
  "generating-references",
  "storyboard",
  "generating-videos",
  "generating-voiceover",
  "finalizing",
  "directing",
];

export function isProcessingStage(step: ExportStep): boolean {
  return PROCESSING_STAGES.includes(step);
}

export const STAGE_MILESTONES = [
  { id: "config", label: "Config", stages: ["configure"] },
  { id: "profile", label: "Profile", stages: ["exporting", "profile-selection"] },
  { id: "references", label: "References", stages: ["extracting-subjects", "generating-references", "reviewing-references"] },
  { id: "storyboard", label: "Storyboard", stages: ["storyboard", "reviewing-storyboard"] },
  { id: "generate", label: "Generate", stages: ["generating-videos", "generating-voiceover", "finalizing", "directing"] },
  { id: "done", label: "Done", stages: ["done"] },
] as const;
