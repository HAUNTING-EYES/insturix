"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  ExportStep,
  SubjectRef,
  SuggestedSubject,
  Voice,
  BriefOverrides,
  DirectorProgress,
  NewSubjectFormState,
} from "../types";
import useClickatronStore from "@/stores/useCanvasStore";
import {
  buildThinkToClickContext,
  findClickatronCreativeSpecInBlocks,
  type ThinkToClickContext,
} from "@/lib/thinkforge/clickatron-context";
import {
  buildThinkToClickHandoffState,
  type ThinkToClickHandoffState,
  type ThinkToClickUserVisualChoices,
} from "@/lib/thinkforge/clickatron-handoff-state";
import { buildClickatronSessionFormData } from "@/lib/thinkforge/clickatron-session-payload";
import type { ThinkForgeBlock } from "@/lib/thinkforge/schemas/thinkforge-block";
import type { ProjectMeta } from "@/lib/thinkforge/state/types";
import type { ThinkForgeEditronHandoffContext } from "@/lib/thinkforge/export/script-sidecar-to-editron";
// ─── Hook input ──────────────────────────────────────────────────
export interface UseExportPipelineInput {
  blocks: any[];
  plainText?: string;
  sessionId?: string;
  scriptId?: string;
  projectMeta?: ProjectMeta | null;
}

// ─── Detected profile shape (kept internal) ─────────────────────
export interface DetectedProfileInfo {
  profileId: string;
  confidence: number;
  reasoning: string[];
  name: string;
  description: string;
}

export interface EditronProductionManifest {
  version?: number;
  sourceService?: string;
  sourceSessionId?: string;
  sourceScriptId?: string;
  targetDurationSeconds?: number | null;
  targetDurationSource?: string;
  parsedDurationSeconds?: number;
  expectedSceneCount?: number;
  expectedStoryboardImages?: number;
  expectedVideoClips?: number;
  coveragePolicy?: "production-require-all-scenes" | "draft-partial-allowed" | string;
  warnings?: string[];
  thinkforgeContext?: ThinkForgeEditronHandoffContext;
}

export interface EditronImportPreflightResult {
  dryRun: true;
  projectId: string | null;
  overlayCount: number;
  totalDurationFrames: number;
  totalDurationSeconds: number;
  creditsDeducted: number;
  reusedProject: boolean;
  wouldReuseProject: boolean;
  writeOperationsSkipped: boolean;
}

// ─── Hook return type ────────────────────────────────────────────
export interface UseExportPipelineReturn {
  // ── Pipeline step ──
  step: ExportStep;
  setStep: (step: ExportStep) => void;

  // ── Config state ──
  title: string;
  setTitle: (v: string) => void;
  aspectRatio: string;
  setAspectRatio: (v: string) => void;
  generateStoryboard: boolean;
  setGenerateStoryboard: (v: boolean) => void;
  generateVideos: boolean;
  setGenerateVideos: (v: boolean) => void;
  artStyle: string;
  setArtStyle: (v: string) => void;
  imageModel: string;
  setImageModel: (v: string) => void;
  videoModel: string;
  setVideoModel: (v: string) => void;
  enableChaining: boolean;
  setEnableChaining: (v: boolean) => void;
  selectedVoice: string;
  setSelectedVoice: (v: string) => void;
  availableVoices: Voice[];
  previewingVoice: string | null;
  error: string;
  setError: (v: string) => void;

  // ── Profile detection ──
  detectedProfile: DetectedProfileInfo | null;
  setDetectedProfile: (v: DetectedProfileInfo | null) => void;
  selectedProfileId: string;
  setSelectedProfileId: (v: string) => void;
  profileSearchQuery: string;
  setProfileSearchQuery: (v: string) => void;
  briefPlatform: string;
  setBriefPlatform: (v: string) => void;
  briefTone: string;
  setBriefTone: (v: string) => void;
  briefCaptionStyle: string;
  setBriefCaptionStyle: (v: string) => void;
  briefBgmMood: string;
  setBriefBgmMood: (v: string) => void;
  directorProgress: DirectorProgress;

  // ── Results ──
  scenes: any[];
  projectId: string;
  audioGenerating: boolean;
  storyboardId: string;
  storyboardScenes: any[];
  scriptImportPreflight: EditronImportPreflightResult | null;
  videoProgress: { done: number; total: number };
  videosGenerated: boolean;
  clickatronCreating: boolean;
  clickatronHandoffState: ThinkToClickHandoffState | null;
  clickatronVisualChoices: ThinkToClickUserVisualChoices;
  setClickatronVisualChoice: (key: keyof ThinkToClickUserVisualChoices, value: string) => void;

  // ── Reference image state ──
  refSetId: string;
  subjects: SubjectRef[];
  approvedSubjectIds: Set<string>;
  setApprovedSubjectIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  missingBrandEvidenceSubjects: SubjectRef[];
  generatedBrandOwnedSubjects: SubjectRef[];
  referenceContinueBlocked: boolean;
  referenceContinueMessage: string;
  regeneratingSubjectIds: Set<string>;
  feedbackSubjectId: string | null;
  setFeedbackSubjectId: (v: string | null) => void;
  feedbackText: string;
  setFeedbackText: (v: string) => void;
  editingSubjectId: string | null;
  setEditingSubjectId: (v: string | null) => void;
  editingDescription: string;
  setEditingDescription: (v: string) => void;
  overallMusicPrompt: string;

  // ── Suggested subjects ──
  suggestedSubjects: SuggestedSubject[];
  generatingSuggestedIds: Set<string>;
  scriptSearchQuery: string;
  setScriptSearchQuery: (v: string) => void;

  // ── Add new subject form ──
  showAddSubject: boolean;
  setShowAddSubject: (v: boolean) => void;
  addingSubject: boolean;
  newSubjectName: string;
  setNewSubjectName: (v: string) => void;
  newSubjectCategory: string;
  setNewSubjectCategory: (v: string) => void;
  newSubjectDescription: string;
  setNewSubjectDescription: (v: string) => void;
  newSubjectScenes: string;
  setNewSubjectScenes: (v: string) => void;

  // ── Style guide metadata ──
  colorPalette: string[];
  characterDescriptions: string | undefined;
  environmentNotes: string | undefined;
  globalEditDirections: any;
  suggestedProfileCategory: string;

  // ── Storyboard scene edit state ──
  regeneratingSceneIdxs: Set<number>;
  sceneFeedbackIdx: number | null;
  setSceneFeedbackIdx: (v: number | null) => void;
  sceneFeedbackText: string;
  setSceneFeedbackText: (v: string) => void;

  // ── Refs ──
  previewAudioRef: React.MutableRefObject<HTMLAudioElement | null>;

  // ── Handlers ──
  handleExport: () => Promise<void>;
  handlePostProfileSelection: () => Promise<void>;
  handlePhase2: (parsedScenes?: any[], projectTitle?: string) => Promise<void>;
  handlePhase3: (parsedScenes?: any[], projectTitle?: string) => Promise<void>;
  handleRegenerateSubject: (subjectId: string, feedback?: string) => Promise<void>;
  handleUploadSubjectImage: (subjectId: string, file: File) => Promise<void>;
  handleUploadSceneImage: (sceneIndex: number, file: File) => Promise<void>;
  toggleFeedbackPrompt: (subjectId: string) => void;
  handleDeleteSubject: (subjectId: string) => Promise<void>;
  handleGenerateSuggested: (suggested: SuggestedSubject) => Promise<void>;
  handleAddSubject: () => Promise<void>;
  handleStartEditDescription: (subjectId: string) => void;
  handleSaveDescriptionAndRegenerate: (subjectId: string) => Promise<void>;
  handleRegenerateStoryboardScene: (sceneIndex: number, feedback?: string) => Promise<void>;
  handlePreviewVoice: (voiceId: string) => Promise<void>;
  handleCreateClickatronSession: () => Promise<void>;
  handleClose: () => void;
  reset: () => void;
  estimateCredits: () => number;
  stepDescription: () => string;
}

// ═════════════════════════════════════════════════════════════════
// useExportPipeline — single source of truth for all export state
// ═════════════════════════════════════════════════════════════════

export function useExportPipeline(
  { blocks, plainText, sessionId, scriptId, projectMeta }: UseExportPipelineInput,
  open: boolean,
  onOpenChange: (open: boolean) => void,
): UseExportPipelineReturn {
  // ── Pipeline step ──────────────────────────────────────────────
  const [step, setStep] = useState<ExportStep>("configure");

  // ── Config state ───────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [generateStoryboard, setGenerateStoryboard] = useState(true);
  const [generateVideos, setGenerateVideos] = useState(true);
  const [artStyle, setArtStyle] = useState("cinematic");
  const [imageModel, setImageModel] = useState("flux-schnell");
  const [videoModel, setVideoModel] = useState("auto");
  const [enableChaining, setEnableChaining] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState("kokoro-heart");
  const [availableVoices, setAvailableVoices] = useState<Voice[]>([]);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [error, setError] = useState("");

  // ── Refs ────────────────────────────────────────────────────────
  const prewarmFiredRef = useRef(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // ── Profile detection ──────────────────────────────────────────
  const [detectedProfile, setDetectedProfile] = useState<DetectedProfileInfo | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [profileSearchQuery, setProfileSearchQuery] = useState("");
  const [briefPlatform, setBriefPlatform] = useState("");
  const [briefTone, setBriefTone] = useState("");
  const [briefCaptionStyle, setBriefCaptionStyle] = useState("");
  const [briefBgmMood, setBriefBgmMood] = useState("");
  const [directorProgress, setDirectorProgress] = useState<DirectorProgress>({ step: 0, total: 0, desc: "" });

  // ── Results ────────────────────────────────────────────────────
  const [scenes, setScenes] = useState<any[]>([]);
  const [projectId, setProjectId] = useState("");
  const [audioGenerating, setAudioGenerating] = useState(false);
  const [storyboardId, setStoryboardId] = useState("");
  const [storyboardScenes, setStoryboardScenes] = useState<any[]>([]);
  const [productionManifest, setProductionManifest] = useState<EditronProductionManifest | null>(null);
  const [scriptImportPreflight, setScriptImportPreflight] = useState<EditronImportPreflightResult | null>(null);
  const [videoProgress, setVideoProgress] = useState({ done: 0, total: 0 });
  const [videosGenerated, setVideosGenerated] = useState(false);
  const [clickatronCreating, setClickatronCreating] = useState(false);
  const [clickatronVisualChoices, setClickatronVisualChoices] = useState<ThinkToClickUserVisualChoices>({});
  const [resolvedClickatronContext, setResolvedClickatronContext] = useState<{ key: string; context: ThinkToClickContext } | null>(null);
  const createClickatronSession = useClickatronStore((state) => state.createSession);
  const sourceSessionId = sessionId || undefined;
  const sourceBrandId = useMemo(() => {
    const brandId = typeof projectMeta?.brandId === "string" ? projectMeta.brandId.trim() : "";
    return brandId || undefined;
  }, [projectMeta?.brandId]);
  const requiresProductionCoverage = productionManifest?.coveragePolicy !== "draft-partial-allowed";
  const getExpectedStoryboardImages = useCallback((currentScenes: any[]) => {
    const expected = productionManifest?.expectedStoryboardImages;
    return typeof expected === "number" && expected > 0 ? expected : currentScenes.length;
  }, [productionManifest]);
  const getExpectedVideoClips = useCallback((fallbackTotal: number) => {
    const expected = productionManifest?.expectedVideoClips;
    return typeof expected === "number" && expected > 0 ? expected : fallbackTotal;
  }, [productionManifest]);
  const buildProductionCoverageError = useCallback((kind: "storyboard" | "video", completed: number, expected: number) => {
    if (kind === "storyboard") {
      return `Storyboard coverage incomplete: ${completed}/${expected} required scene images are ready. Regenerate or upload missing scene images before generating production videos.`;
    }
    return `Video coverage incomplete: ${completed}/${expected} required clips are ready. Retry failed video clips before finalizing a production export.`;
  }, []);

  // ── Reference image state ──────────────────────────────────────
  const [refSetId, setRefSetId] = useState("");
  const [subjects, setSubjects] = useState<SubjectRef[]>([]);
  const [approvedSubjectIds, setApprovedSubjectIds] = useState<Set<string>>(new Set());
  const [regeneratingSubjectIds, setRegeneratingSubjectIds] = useState<Set<string>>(new Set());
  const [feedbackSubjectId, setFeedbackSubjectId] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [editingDescription, setEditingDescription] = useState("");
  const [overallMusicPrompt, setOverallMusicPrompt] = useState("");
  const missingBrandEvidenceSubjects = useMemo(
    () => subjects.filter((s) => Boolean(s.requiresBrandEvidence && !s.imageUrl)),
    [subjects],
  );
  const generatedBrandOwnedSubjects = useMemo(
    () =>
      subjects.filter((s) => {
        if (!sourceBrandId) return false;
        if (s.requiresBrandEvidence && s.referenceProvenance === "generated") return true;
        if (s.requiresBrandEvidence) return false;
        const provenance = s.referenceProvenance;
        if (provenance && provenance !== "generated") return false;
        return s.category?.toLowerCase() === "product";
      }),
    [sourceBrandId, subjects],
  );
  const referenceContinueBlocked = missingBrandEvidenceSubjects.length > 0 || generatedBrandOwnedSubjects.length > 0;
  const referenceContinueMessage = useMemo(() => {
    if (missingBrandEvidenceSubjects.length > 0) {
      const names = missingBrandEvidenceSubjects.map((s) => s.name).join(", ");
      return `Brand evidence required before storyboard generation: ${names}. Upload evidence or connect Brand Vault evidence for these owned subjects.`;
    }
    if (generatedBrandOwnedSubjects.length > 0) {
      const names = generatedBrandOwnedSubjects.map((s) => s.name).join(", ");
      return `Brand-owned references cannot use generated/fake or legacy-unverified imagery: ${names}. Upload evidence or use Brand Vault/website evidence.`;
    }
    return "";
  }, [generatedBrandOwnedSubjects, missingBrandEvidenceSubjects]);

  // ── Suggested subjects ─────────────────────────────────────────
  const [suggestedSubjects, setSuggestedSubjects] = useState<SuggestedSubject[]>([]);
  const [generatingSuggestedIds, setGeneratingSuggestedIds] = useState<Set<string>>(new Set());
  const [scriptSearchQuery, setScriptSearchQuery] = useState("");

  // ── Add new subject form ───────────────────────────────────────
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [addingSubject, setAddingSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newSubjectCategory, setNewSubjectCategory] = useState<string>("character");
  const [newSubjectDescription, setNewSubjectDescription] = useState("");
  const [newSubjectScenes, setNewSubjectScenes] = useState("");

  // ── Style guide metadata ───────────────────────────────────────
  const [colorPalette, setColorPalette] = useState<string[]>([]);
  const [characterDescriptions, setCharacterDescriptions] = useState<string | undefined>(undefined);
  const [environmentNotes, setEnvironmentNotes] = useState<string | undefined>(undefined);
  const [globalEditDirections, setGlobalEditDirections] = useState<any>(undefined);
  const [suggestedProfileCategory, setSuggestedProfileCategory] = useState("");

  // ── Storyboard scene edit state ────────────────────────────────
  const [regeneratingSceneIdxs, setRegeneratingSceneIdxs] = useState<Set<number>>(new Set());
  const [sceneFeedbackIdx, setSceneFeedbackIdx] = useState<number | null>(null);
  const [sceneFeedbackText, setSceneFeedbackText] = useState("");

  // ─── Notification helper ───────────────────────────────────────
  const sendNotification = (ntitle: string, body: string) => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted" && document.hidden) {
      new Notification(ntitle, { body, icon: "/favicon.ico" });
    }
  };

  const buildSubjectRefFromResponse = (subject: any, priority?: SubjectRef["priority"]): SubjectRef => ({
    subjectId: subject.subjectId,
    name: subject.name,
    category: subject.category,
    imageUrl: subject.imageUrl || undefined,
    imageAssetId: subject.imageAssetId || subject.assetId || undefined,
    imageGcsPath: subject.imageGcsPath || subject.gcsPath || undefined,
    status: subject.status || (subject.imageUrl ? "generated" : "pending"),
    scenesAppearingIn: subject.scenesAppearingIn || [],
    visualDescription: subject.visualDescription,
    priority,
    weight: typeof subject.weight === "number" ? subject.weight : undefined,
    source: subject.source,
    assetRole: subject.assetRole,
    referenceProvenance: subject.referenceProvenance,
    referenceProvenanceLabel: subject.referenceProvenanceLabel,
    requiresBrandEvidence: subject.requiresBrandEvidence,
    brandEvidenceStatus: subject.brandEvidenceStatus,
    evidenceRequiredReason: subject.evidenceRequiredReason,
  });

  const shouldAutoApproveReferenceSubject = (subject: SubjectRef): boolean =>
    Boolean(subject.imageUrl && subject.referenceProvenance !== "missing-brand-evidence" && subject.brandEvidenceStatus !== "missing");

  const applyBrandReferenceWarnings = (warnings: unknown): void => {
    if (!Array.isArray(warnings) || warnings.length === 0) return;
    const message = warnings.filter((warning): warning is string => typeof warning === "string" && warning.trim().length > 0).join(" ");
    if (!message) return;
    setError(message);
    sendNotification("Brand Evidence Required", message);
  };
  const setClickatronVisualChoice = useCallback((key: keyof ThinkToClickUserVisualChoices, value: string) => {
    setClickatronVisualChoices((prev) => ({
      ...prev,
      [key]: value.trim() || undefined,
    }));
  }, []);

  const clickatronContextRequestBody = useMemo(() => ({
    sessionId,
    scriptId,
    operation: "preview" as const,
    projectId: projectId || undefined,
    title: title || undefined,
    kind: clickatronVisualChoices.kind,
    platform: clickatronVisualChoices.platform,
    aspectRatio: clickatronVisualChoices.aspectRatio || aspectRatio,
    visualMode: clickatronVisualChoices.visualMode,
    textDensity: clickatronVisualChoices.textDensity,
    vibe: clickatronVisualChoices.vibe,
    imageStyle: clickatronVisualChoices.imageStyle,
    notes: clickatronVisualChoices.notes,
    slideCount: clickatronVisualChoices.slideCount,
    scenesCount: scenes.length,
  }), [
    aspectRatio,
    clickatronVisualChoices.aspectRatio,
    clickatronVisualChoices.imageStyle,
    clickatronVisualChoices.kind,
    clickatronVisualChoices.notes,
    clickatronVisualChoices.platform,
    clickatronVisualChoices.slideCount,
    clickatronVisualChoices.textDensity,
    clickatronVisualChoices.vibe,
    clickatronVisualChoices.visualMode,
    projectId,
    scenes.length,
    scriptId,
    sessionId,
    title,
  ]);

  const clickatronContextRequestKey = useMemo(
    () => JSON.stringify(clickatronContextRequestBody),
    [clickatronContextRequestBody],
  );
  const hasHydratedDocument = Boolean(scriptId?.trim())
    && (blocks.length > 0 || Boolean(plainText?.trim()));

  useEffect(() => {
    if (!open || !sessionId || !hasHydratedDocument) {
      setResolvedClickatronContext(null);
      return;
    }

    const controller = new AbortController();
    const requestKey = clickatronContextRequestKey;

    fetch("/api/services/thinkforge/clickatron-context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(clickatronContextRequestBody),
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.context) {
          throw new Error(data.error || `Failed to resolve ThinkForge context (${res.status})`);
        }
        if (!controller.signal.aborted) {
          setResolvedClickatronContext({ key: requestKey, context: data.context as ThinkToClickContext });
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setResolvedClickatronContext(null);
      });

    return () => controller.abort();
  }, [clickatronContextRequestBody, clickatronContextRequestKey, hasHydratedDocument, open, sessionId]);

  const localClickatronHandoffState = useMemo<ThinkToClickHandoffState | null>(() => {
    if (!sessionId) return null;

    try {
      const creativeSpec = findClickatronCreativeSpecInBlocks(blocks as ThinkForgeBlock[]);
      const context = buildThinkToClickContext({
        sessionId,
        scriptId,
        projectId: projectId || undefined,
        projectMeta,
        creativeSpec,
        blocks: blocks as ThinkForgeBlock[],
        userVisualChoices: clickatronVisualChoices,
        title: title || undefined,
        aspectRatio: clickatronVisualChoices.aspectRatio || aspectRatio,
        scenesCount: scenes.length,
      });

      return buildThinkToClickHandoffState({
        context,
        blocks: blocks as ThinkForgeBlock[],
        userVisualChoices: clickatronVisualChoices,
      });
    } catch {
      return null;
    }
  }, [aspectRatio, blocks, clickatronVisualChoices, projectId, projectMeta, scenes.length, scriptId, sessionId, title]);

  const clickatronHandoffState = useMemo<ThinkToClickHandoffState | null>(() => {
    const resolvedContext = resolvedClickatronContext?.key === clickatronContextRequestKey
      ? resolvedClickatronContext.context
      : null;
    if (!resolvedContext) return localClickatronHandoffState;

    try {
      return buildThinkToClickHandoffState({
        context: resolvedContext,
        blocks: blocks as ThinkForgeBlock[],
        userVisualChoices: clickatronVisualChoices,
      });
    } catch {
      return localClickatronHandoffState;
    }
  }, [blocks, clickatronContextRequestKey, clickatronVisualChoices, localClickatronHandoffState, resolvedClickatronContext]);
  // ─── Request notification permission on mount ──────────────────
  useEffect(() => {
    if (open && typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [open]);

  // ─── Fetch available TTS voices ────────────────────────────────
  useEffect(() => {
    if (open) {
      fetch("/api/services/pipeline/voices")
        .then((res) => (res.ok ? res.json() : { voices: [] }))
        .then((data: any) => {
          if (data.voices?.length > 0) {
            setAvailableVoices(data.voices);
          }
        })
        .catch(() => {});
    }
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, [open]);

  // ─── Pre-warm fal.ai video model worker ────────────────────────
  useEffect(() => {
    if (open && !prewarmFiredRef.current) {
      prewarmFiredRef.current = true;
      try {
        const modelToWarm = videoModel === "auto" ? "kling-2.1" : videoModel;
        fetch("/api/services/pipeline/prewarm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: modelToWarm }),
        }).catch(() => {});
      } catch {
        // Silent — prewarm is best-effort
      }
    }
    if (!open) {
      prewarmFiredRef.current = false;
    }
  }, [open, videoModel]);

  // ─── Reset all state ───────────────────────────────────────────
  const reset = () => {
    setStep("configure");
    setTitle("");
    setAspectRatio("16:9");
    setGenerateStoryboard(true);
    setGenerateVideos(true);
    setArtStyle("cinematic");
    setImageModel("flux-schnell");
    setVideoModel("auto");
    setError("");
    setScenes([]);
    setProjectId("");
    setStoryboardId("");
    setStoryboardScenes([]);
    setProductionManifest(null);
    setScriptImportPreflight(null);
    setVideoProgress({ done: 0, total: 0 });
    setVideosGenerated(false);
    setClickatronCreating(false);
    setRefSetId("");
    setSubjects([]);
    setApprovedSubjectIds(new Set());
    setRegeneratingSubjectIds(new Set());
    setFeedbackSubjectId(null);
    setFeedbackText("");
    setEditingSubjectId(null);
    setEditingDescription("");
    setOverallMusicPrompt("");
    setColorPalette([]);
    setCharacterDescriptions(undefined);
    setEnvironmentNotes(undefined);
    setSuggestedSubjects([]);
    setGeneratingSuggestedIds(new Set());
    setScriptSearchQuery("");
    setShowAddSubject(false);
    setAddingSubject(false);
    setNewSubjectName("");
    setNewSubjectCategory("character");
    setNewSubjectDescription("");
    setNewSubjectScenes("");
    setRegeneratingSceneIdxs(new Set());
    setSceneFeedbackIdx(null);
    setSceneFeedbackText("");
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  // ─── Credit estimation ─────────────────────────────────────────
  const estimateCredits = (): number => {
    const META_RE = /\b(overview|introduction|creative direction|aesthetic|production notes|branding|key message|target audience|format|guidelines|style guide|tone|direction|deliverables|platforms?|conclusion|summary|notes|credits|appendix)\b/i;
    let sceneCount = 0;
    if (blocks.length > 0) {
      for (const block of blocks) {
        if (block.kind === "header") {
          const text =
            typeof block.content === "string"
              ? block.content
              : Array.isArray(block.content)
                ? block.content.map((c: any) => c.text || "").join("")
                : "";
          if (!META_RE.test(text)) sceneCount++;
        }
      }
      if (sceneCount === 0 && plainText) {
        const timestamps = plainText.match(/\d{2}:\d{2}\s*[-–]\s*\d{2}:\d{2}/g);
        sceneCount = timestamps ? timestamps.length : Math.max(1, Math.ceil(blocks.length / 5));
      }
      sceneCount = Math.max(1, sceneCount);
    } else {
      sceneCount = 3;
    }
    let total = 1;
    if (generateStoryboard) {
      total += sceneCount * 1;
      total += sceneCount * 2;
    }
    if (generateStoryboard && generateVideos) total += sceneCount * 3;
    total += sceneCount * 1;
    return total;
  };

  // ─── Voice preview ─────────────────────────────────────────────
  const handlePreviewVoice = async (voiceId: string) => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    if (previewingVoice === voiceId) {
      setPreviewingVoice(null);
      return;
    }
    setPreviewingVoice(voiceId);
    try {
      const res = await fetch("/api/services/pipeline/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId }),
      });
      if (!res.ok) throw new Error("Preview failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      audio.onended = () => {
        setPreviewingVoice(null);
        URL.revokeObjectURL(url);
      };
      await audio.play();
    } catch {
      setPreviewingVoice(null);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // Phase 1: Parse scenes -> Extract subjects -> Gen references
  // ═══════════════════════════════════════════════════════════════

  const runSubjectExtractionAndReferences = async (parsedScenes: any[] = scenes, projectTitle: string = title) => {
    if (generateStoryboard && parsedScenes.length > 0) {
      setStep("extracting-subjects");

      const extractRes = await fetch("/api/services/pipeline/reference-images/extract-subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenes: parsedScenes, artStyle }),
      });

      if (extractRes.ok) {
        const extractData = await extractRes.json().catch(() => ({}));
        const allExtracted = extractData.subjects || [];

        if (allExtracted.length > 0) {
          const heroSubjects = allExtracted.filter((s: any) => s.priority === "hero");
          const suggestedOnly = allExtracted.filter((s: any) => s.priority !== "hero");

          setSuggestedSubjects(
            suggestedOnly.map((s: any) => ({
              id: s.id,
              name: s.name,
              category: s.category,
              visualDescription: s.visualDescription,
              scenesAppearingIn: s.scenesAppearingIn || [],
            })),
          );

          const subjectsToGenerate = heroSubjects.length > 0 ? heroSubjects : allExtracted.slice(0, 2);

          setStep("generating-references");

          const genRes = await fetch("/api/services/pipeline/reference-images/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subjects: subjectsToGenerate,
              artStyle,
              sourceScriptId: scriptId,
              brandId: sourceBrandId || undefined,
              modelId: imageModel !== "flux-schnell" ? imageModel : undefined,
            }),
          });

          if (genRes.ok) {
            const genData = await genRes.json().catch(() => ({}));
            const sbRefSetId = genData.refSetId || "";
            setRefSetId(sbRefSetId);
            let latestSubjects: SubjectRef[] = (genData.subjects || []).map((s: any) => ({ ...s, priority: "hero" }));
            const mergeReferenceSubjects = (base: SubjectRef[], updates: any[]): SubjectRef[] => {
              const nextById = new Map(base.map((subject) => [subject.subjectId, subject]));
              for (const update of updates || []) {
                if (!update?.subjectId) continue;
                const previous = nextById.get(update.subjectId);
                nextById.set(update.subjectId, {
                  ...(previous || {}),
                  ...update,
                  priority: previous?.priority || "hero",
                } as SubjectRef);
              }
              return Array.from(nextById.values());
            };
            setSubjects(latestSubjects);

            // Async polling for reference image generation
            if (genData.async && genData.batchId && sbRefSetId) {
              const MAX_POLL_ATTEMPTS = 60;
              const POLL_INTERVAL_MS = 5000;
              let refsCompleted = false;
              let finalSubjects: SubjectRef[] = latestSubjects;

              for (let poll = 0; poll < MAX_POLL_ATTEMPTS; poll++) {
                await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
                try {
                  const statusRes = await fetch(
                    `/api/services/pipeline/reference-images/${sbRefSetId}/generate-status?batchId=${genData.batchId}`,
                  );
                  const statusData = await statusRes.json().catch(() => ({}));
                  if (statusData.success) {
                    latestSubjects = mergeReferenceSubjects(latestSubjects, statusData.subjects || []);
                    setSubjects(latestSubjects);
                    if (statusData.isComplete) {
                      finalSubjects = latestSubjects;
                      refsCompleted = true;
                      break;
                    }
                  }
                } catch (pollErr: any) {
                  console.warn(`[ExportToEditron] Ref poll #${poll + 1} failed:`, pollErr.message);
                }
              }

              if (!refsCompleted) {
                console.warn("[ExportToEditron] Reference image generation polling timed out after 5 minutes");
                setError("Reference image generation timed out. Continuing with what was generated.");
              }

              const allIds = new Set<string>(
                finalSubjects.filter((s: any) => s.imageUrl).map((s: any) => s.subjectId),
              );
              setApprovedSubjectIds(allIds);

              const generatedIds = new Set(subjectsToGenerate.map((s: any) => s.id));
              setSuggestedSubjects((prev) => prev.filter((s) => !generatedIds.has(s.id)));

              sendNotification(
                "Reference Images Ready",
                `${finalSubjects.filter((s: any) => s.imageUrl).length}/${finalSubjects.length} references generated.`,
              );
            } else {
              // Legacy synchronous response
              const allIds = new Set<string>(
                (genData.subjects || []).filter((s: SubjectRef) => s.imageUrl).map((s: SubjectRef) => s.subjectId),
              );
              setApprovedSubjectIds(allIds);
              const generatedIds = new Set(subjectsToGenerate.map((s: any) => s.id));
              setSuggestedSubjects((prev) => prev.filter((s) => !generatedIds.has(s.id)));
              sendNotification(
                "Reference Images Ready",
                `${genData.subjects?.length || 0} references generated. ${suggestedOnly.length} more suggestions from your script.`,
              );
            }

            setStep("reviewing-references");
            return;
          } else {
            console.warn("[ExportToEditron] Reference image generation failed, skipping");
          }
        } else {
          setStep("reviewing-references");
          return;
        }
      } else {
        console.warn("[ExportToEditron] Subject extraction failed — showing review step for manual addition");
        setStep("reviewing-references");
        return;
      }
    }

    // If no storyboard or reference image extraction failed, go straight to phase 2
    await handlePhase2(parsedScenes, projectTitle);
  };

  const handleExport = async () => {
    setStep("exporting");
    setError("");
    setScriptImportPreflight(null);

    try {
      // Step 1: Parse script into scenes
      const exportRes = await fetch("/api/services/thinkforge/script/export-for-editron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks, plainText, sessionId, scriptId, aspectRatio, artStyle, brandId: sourceBrandId }),
      });

      if (!exportRes.ok) {
        const data = await exportRes.json().catch(() => ({}));
        throw new Error(data.error || `Failed to export script (${exportRes.status})`);
      }

      const exportData = await exportRes.json().catch(() => null);
      if (!exportData) throw new Error("Invalid response from export service");
      setScenes(exportData.scenes);
      setProductionManifest(exportData.productionManifest || null);
      setOverallMusicPrompt(exportData.overallMusicPrompt || "");
      setColorPalette(exportData.colorPalette || []);
      setCharacterDescriptions(exportData.characterDescriptions || undefined);
      setEnvironmentNotes(exportData.environmentNotes || undefined);
      setGlobalEditDirections(exportData.globalEditDirections || undefined);
      setSuggestedProfileCategory(exportData.suggestedProfileCategory || "");
      const projectTitle = title || exportData.title || "Untitled Script";
      setTitle(projectTitle);

      // D-016: Profile detection removed — signal system + Utility AI drive editing decisions.
      // Pre-fill G-01 (universal default). User can still override in profile selection step.
      setDetectedProfile({
        profileId: 'G-01',
        confidence: 1.0,
        reasoning: ['Signal-driven editing (D-016)'],
        name: 'Universal Clean',
        description: 'Signal-driven editing — Utility AI selects filter, entrance, and pacing from content signals.',
      });
      setSelectedProfileId('G-01');

      if (generateStoryboard) {
        setStep("profile-selection");
        return;
      }

      await runSubjectExtractionAndReferences(exportData.scenes || [], projectTitle);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setStep("configure");
      sendNotification("Export Failed", err.message || "Something went wrong during export.");
    }
  };

  // ─── Resume after profile selection confirmed ──────────────────
  const handlePostProfileSelection = async () => {
    setError("");
    try {
      await runSubjectExtractionAndReferences();
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setStep("configure");
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // Phase 2: Generate storyboard images -> Pause for review
  // ═══════════════════════════════════════════════════════════════

  const handleCreateClickatronSession = async () => {
    if (!sessionId) {
      const message = "Cannot start Clickatron: ThinkForge session context is missing.";
      setError(message);
      throw new Error(message);
    }

    setClickatronCreating(true);
    setError("");

    try {
      const contextRes = await fetch("/api/services/thinkforge/clickatron-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...clickatronContextRequestBody, operation: "commit" }),
      });
      const contextData = await contextRes.json().catch(() => ({}));
      if (!contextRes.ok || !contextData.context) {
        throw new Error(contextData.error || `Failed to resolve ThinkForge context (${contextRes.status})`);
      }

      const context = contextData.context as ThinkToClickContext;
      const handoffState = buildThinkToClickHandoffState({
        context,
        blocks: blocks as ThinkForgeBlock[],
        userVisualChoices: clickatronVisualChoices,
      });
      if (!handoffState.canSendToClickatron || !handoffState.payloadPreview) {
        const needsInput = handoffState.requiredUserInput.length > 0
          ? ` Needs: ${handoffState.requiredUserInput.join(", ")}.`
          : "";
        throw new Error(`${handoffState.display.statusLabel}: ${handoffState.display.readinessCopy}${needsInput}`);
      }

      const formData = buildClickatronSessionFormData(handoffState);

      const result = await createClickatronSession(formData);
      if (!result?.sessionId) {
        throw new Error("Clickatron session was not returned");
      }

      window.location.href = `/dashboard/clickatron/lab/${result.sessionId}`;
    } catch (err: any) {
      setError(`Clickatron handoff failed: ${err.message || "Unknown error"}`);
      throw err;
    } finally {
      setClickatronCreating(false);
    }
  };

  const handlePhase2 = async (parsedScenes?: any[], projectTitle?: string) => {
    const currentScenes = parsedScenes || scenes;
    const currentTitle = projectTitle || title || "Untitled Script";
    setError("");

    if (!currentScenes || currentScenes.length === 0) {
      setError("No scenes available. Please restart the export process.");
      setStep("configure");
      return;
    }

    if (generateStoryboard && referenceContinueBlocked) {
      const message = referenceContinueMessage || "Brand evidence required before storyboard generation.";
      setError(message);
      sendNotification("Brand Evidence Required", message);
      setStep("reviewing-references");
      return;
    }

    try {
      const approved = subjects
        .filter((s) => approvedSubjectIds.has(s.subjectId) && s.imageUrl)
        .map((s) => ({
          subjectId: s.subjectId,
          name: s.name,
          category: s.category,
          visualDescription: s.visualDescription || "",
          imageUrl: s.imageUrl!,
          imageAssetId: s.imageAssetId,
          imageGcsPath: s.imageGcsPath,
          scenesAppearingIn: s.scenesAppearingIn,
          weight: s.weight,
          source: s.source,
          assetRole: s.assetRole,
          referenceProvenance: s.referenceProvenance,
          referenceProvenanceLabel: s.referenceProvenanceLabel,
          requiresBrandEvidence: s.requiresBrandEvidence,
          brandEvidenceStatus: s.brandEvidenceStatus,
          evidenceRequiredReason: s.evidenceRequiredReason,
        }));

      if (generateStoryboard && currentScenes.length > 0) {
        setStep("storyboard");

        // Approve all refs in DB if we have a refSetId
        if (refSetId && approved.length > 0) {
          await fetch(`/api/services/pipeline/reference-images/${refSetId}/approve-all`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          }).catch(() => {});
        }

        const sbRes = await fetch("/api/services/pipeline/storyboard/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenes: currentScenes,
            title: currentTitle,
            sourceSessionId,
            sourceScriptId: scriptId,
            brandId: sourceBrandId || undefined,
            aspectRatio,
            modelId: imageModel !== "flux-schnell" ? imageModel : undefined,
            overallMusicPrompt,
            styleGuide: {
              artStyle,
              colorPalette: colorPalette,
              characterDescriptions: characterDescriptions,
              environmentNotes: environmentNotes,
            },
            refSetId: refSetId || undefined,
            approvedReferences: approved.length > 0 ? approved : undefined,
            globalEditDirections: globalEditDirections || undefined,
            suggestedProfileCategory: suggestedProfileCategory || undefined,
            productionManifest: productionManifest || undefined,
          }),
        });

        if (sbRes.ok) {
          const sbData = await sbRes.json().catch(() => ({}));
          const sbId = sbData.storyboardId || "";
          setStoryboardId(sbId);
          let sbScenes = sbData.scenes || [];
          setStoryboardScenes(sbScenes);

          // Async polling for storyboard generation
          if (sbData.async && sbData.batchId && sbId) {
            const MAX_POLL_ATTEMPTS = 90;
            const POLL_INTERVAL_MS = 6000;
            let sbCompleted = false;

            for (let poll = 0; poll < MAX_POLL_ATTEMPTS; poll++) {
              await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
              try {
                const statusRes = await fetch(
                  `/api/services/pipeline/storyboard/${sbId}/generate-status?batchId=${sbData.batchId}`,
                );
                const statusData = await statusRes.json().catch(() => ({}));
                if (statusData.success) {
                  sbScenes = (statusData.scenes || []).map((s: any) => ({
                    ...s,
                    title: sbScenes.find((existing: any) => existing.sceneIndex === s.sceneIndex)?.title || "",
                  }));
                  setStoryboardScenes(sbScenes);
                  if (statusData.isComplete) {
                    sbCompleted = true;
                    break;
                  }
                }
              } catch (pollErr: any) {
                console.warn(`[ExportToEditron] SB poll #${poll + 1} failed:`, pollErr.message);
              }
            }

            if (!sbCompleted) {
              console.warn("[ExportToEditron] Storyboard generation polling timed out after 9 minutes");
              const message = "Storyboard generation timed out before production coverage was complete. Review or retry storyboard generation before continuing.";
              setError(message);
              if (requiresProductionCoverage && generateVideos) {
                sendNotification("Storyboard Incomplete", message);
                setStep("reviewing-storyboard");
                return;
              }
            }
          }

          const generatedCount = sbScenes.filter((s: any) => s.imageUrl).length;
          const expectedStoryboardImages = getExpectedStoryboardImages(currentScenes);
          sendNotification("Storyboard Ready", `${generatedCount}/${sbScenes.length} scene images generated. Review them now.`);

          if (requiresProductionCoverage && generateVideos && generatedCount < expectedStoryboardImages) {
            const message = buildProductionCoverageError("storyboard", generatedCount, expectedStoryboardImages);
            setError(message);
            sendNotification("Storyboard Incomplete", message);
            setStep("reviewing-storyboard");
            return;
          }

          if (generatedCount > 0) {
            setStep("reviewing-storyboard");
            return;
          }
        } else {
          const errData = await sbRes.json().catch(() => ({}));
          const errorMsg = errData.error || `Storyboard generation failed (${sbRes.status})`;
          console.error("[ExportToEditron] Storyboard generation failed:", errorMsg);
          setError(errorMsg);
          throw new Error(errorMsg);
        }
      }

      await handlePhase3(currentScenes, currentTitle);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setStep("configure");
      sendNotification("Export Failed", err.message || "Something went wrong during export.");
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // Phase 3: Videos -> Voiceover -> Finalize -> Director
  // ═══════════════════════════════════════════════════════════════

  const handlePhase3 = async (parsedScenes?: any[], projectTitle?: string) => {
    setError("");
    const currentScenes = parsedScenes ?? scenes;
    const currentTitle = projectTitle || title || "Untitled Script";
    const sbId = storyboardId;
    const sbImages = storyboardScenes.filter((s: any) => s.imageUrl);
    let createdProjectId = "";

    let videoGenFailed = false;
    const avatarSceneIndices = new Set<number>();
    let avatarSucceededCount = 0;

    // Phase A3.3 — Detect zero-narration scripts
    const scriptHasNarration = (currentScenes || []).some(
      (s: any) => typeof s.narration === "string" && s.narration.trim().length > 0,
    );

    try {
      if (requiresProductionCoverage && generateVideos && sbId) {
        const expectedStoryboardImages = getExpectedStoryboardImages(currentScenes);
        if (sbImages.length < expectedStoryboardImages) {
          const message = buildProductionCoverageError("storyboard", sbImages.length, expectedStoryboardImages);
          setError(message);
          setStep("reviewing-storyboard");
          return;
        }
      }

      // Step 5a: Start and materialize ThinkForge-owned Avatar Pipeline scenes.
      // Successful avatar scenes are excluded from generic video/TTS so we do not
      // spend credits twice or overwrite avatar audio with ordinary narration.
      if (generateVideos && sbId && productionManifest?.thinkforgeContext?.avatarDirectives?.length) {
        setStep("generating-videos");
        const avatarRes = await fetch(`/api/services/pipeline/storyboard/${sbId}/avatar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const avatarData = await avatarRes.json().catch(() => ({}));
        if (!avatarRes.ok || !avatarData.success) {
          throw new Error(avatarData.error || `Avatar pipeline handoff failed (${avatarRes.status})`);
        }

        const initialJobs = Array.isArray(avatarData.jobs) ? avatarData.jobs : [];
        const avatarSceneCount = initialJobs.filter(
          (job: any) => job.status !== "skipped" && job.status !== "failed" && job.status !== "blocked",
        ).length;

        if (avatarSceneCount > 0) {
          const MAX_AVATAR_POLLS = 90;
          const AVATAR_POLL_INTERVAL_MS = 10_000;
          let avatarCompleted = false;

          for (let poll = 0; poll < MAX_AVATAR_POLLS; poll++) {
            await new Promise((resolve) => setTimeout(resolve, AVATAR_POLL_INTERVAL_MS));
            try {
              const statusRes = await fetch(`/api/services/pipeline/storyboard/${sbId}/avatar`);
              const statusData = await statusRes.json().catch(() => ({}));
              if (!statusRes.ok || !statusData.success) {
                console.warn(`[ExportToEditron] Avatar poll #${poll + 1} failed:`, statusData.error || statusRes.status);
                continue;
              }

              const jobs = Array.isArray(statusData.jobs) ? statusData.jobs : [];
              if (statusData.isComplete) {
                for (const job of jobs) {
                  if (job.status === "succeeded" && Number.isInteger(job.sceneIndex)) {
                    avatarSceneIndices.add(job.sceneIndex);
                  }
                }
                avatarSucceededCount = avatarSceneIndices.size;
                const failedAvatarJobs = jobs.filter((job: any) => job.status === "failed" || job.status === "blocked");
                if (failedAvatarJobs.length > 0) {
                  const warning = `${failedAvatarJobs.length} avatar scene${failedAvatarJobs.length === 1 ? "" : "s"} fell back to standard video and voiceover.`;
                  setError((previous) => previous ? `${previous} | ${warning}` : warning);
                }
                avatarCompleted = true;
                break;
              }
            } catch (pollErr: any) {
              console.warn(`[ExportToEditron] Avatar poll #${poll + 1} failed:`, pollErr.message);
            }
          }

          if (!avatarCompleted) {
            throw new Error("Avatar generation timed out after 15 minutes. Retry the export before finalizing.");
          }
        }
      }

      const genericVideoSceneIndices = sbImages
        .map((scene: any) => scene.sceneIndex)
        .filter((sceneIndex: number) => !avatarSceneIndices.has(sceneIndex));
      const expectedTotalVideoClips = getExpectedVideoClips(sbImages.length);
      const expectedGenericVideoClips = Math.max(0, expectedTotalVideoClips - avatarSucceededCount);

      // Step 5b: Generate remaining generic AI video clips (optional).
      if (generateVideos && sbId && genericVideoSceneIndices.length > 0) {
        setStep("generating-videos");
        setVideoProgress({ done: avatarSucceededCount, total: expectedTotalVideoClips });

        try {
          const enqueueRes = await fetch(`/api/services/pipeline/storyboard/${sbId}/generate-videos`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              aspectRatio,
              sceneIndices: genericVideoSceneIndices,
              videoModel,
              brandId: sourceBrandId || undefined,
              enableChaining,
            }),
          });

          const enqueueData = await enqueueRes.json().catch(() => ({}));

          // Fire-and-forget: Pre-fetch SFX parallel to AI video generation
          if (sbId) {
            fetch(`/api/services/pipeline/storyboard/${sbId}/prefetch-sfx`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ storyboardId: sbId }),
            }).catch(() => {});
          }

          if (!enqueueData.success) {
            const errorDetail = [
              enqueueData.error || "Failed to start video generation",
              enqueueData.partialFailure ? `(partial failure — some scenes queued)` : "",
              enqueueData.batchId ? `[batch: ${enqueueData.batchId}]` : "",
              enqueueRes.status !== 200 ? `(HTTP ${enqueueRes.status})` : "",
            ]
              .filter(Boolean)
              .join(" ");
            throw new Error(errorDetail);
          }

          // Handle all-skip mode (all scenes use animated storyboard / graphics)
          if (enqueueData.videoScenes === 0 && enqueueData.skippedScenes > 0) {
            setVideoProgress({ done: avatarSucceededCount + enqueueData.skippedScenes, total: expectedTotalVideoClips });
            setVideosGenerated(true);
          } else if (enqueueData.async === false && enqueueData.isComplete) {
            // Direct fallback mode (Redis unavailable)
            const completed = enqueueData.completed || 0;
            const failed = enqueueData.failed || 0;
            const combinedCompleted = completed + avatarSucceededCount;
            setVideoProgress({ done: combinedCompleted + failed, total: expectedTotalVideoClips });
            setVideosGenerated(combinedCompleted >= expectedTotalVideoClips);
            if (requiresProductionCoverage && (failed > 0 || completed < expectedGenericVideoClips)) {
              setError(buildProductionCoverageError("video", combinedCompleted, expectedTotalVideoClips));
              videoGenFailed = true;
            } else if (failed > 0 && completed > 0) {
              setError(`${failed} of ${enqueueData.totalScenes} video clips failed.`);
            } else if (completed === 0) {
              const sceneErrors =
                enqueueData.scenes
                  ?.filter((s: any) => s.error)
                  .map((s: any) => `Scene ${s.sceneIndex}: ${s.error}`)
                  .join("; ") || "";
              setError(`Video generation failed for all scenes. ${sceneErrors.substring(0, 200)}`);
            }
          } else if (enqueueData.batchId) {
            // Async queue mode — poll for completion
            const batchId = enqueueData.batchId;

            const MAX_POLL_ATTEMPTS = 90;
            const POLL_INTERVAL_MS = 10_000;

            let videosCompleted = false;
            for (let poll = 0; poll < MAX_POLL_ATTEMPTS; poll++) {
              await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

              try {
                const statusRes = await fetch(
                  `/api/services/pipeline/storyboard/${sbId}/generate-videos/status?batchId=${batchId}`,
                );
                const statusData = await statusRes.json().catch(() => ({}));

                if (statusData.success) {
                  const completed = statusData.completed || 0;
                  const failed = statusData.failed || 0;
                  setVideoProgress({ done: avatarSucceededCount + completed + failed, total: expectedTotalVideoClips });

                  if (statusData.isComplete) {
                    const combinedCompleted = completed + avatarSucceededCount;
                    setVideosGenerated(combinedCompleted >= expectedTotalVideoClips);
                    sendNotification("Video Clips Generated", `${combinedCompleted} of ${expectedTotalVideoClips} video clips ready.`);

                    if (requiresProductionCoverage && (failed > 0 || completed < expectedGenericVideoClips)) {
                      setError(buildProductionCoverageError("video", combinedCompleted, expectedTotalVideoClips));
                      videoGenFailed = true;
                    } else if (completed === 0 && failed > 0) {
                      const sceneErrors =
                        statusData.scenes
                          ?.filter((s: any) => s.error)
                          .map((s: any) => `Scene ${s.sceneIndex}: ${s.error}`)
                          .join("; ") || "";
                      setError(
                        `Video generation failed for all ${failed} scenes. ${sceneErrors.substring(0, 200) || "The AI video model may be temporarily unavailable."}`,
                      );
                    } else if (failed > 0) {
                      setError(`${failed} of ${statusData.totalScenes} video clips failed.`);
                    }
                    videosCompleted = true;
                    break;
                  }
                }
              } catch (pollErr: any) {
                console.warn(`[ExportToEditron] Video poll #${poll + 1} failed:`, pollErr.message);
              }
            }

            if (!videosCompleted) {
              console.warn("[ExportToEditron] Video generation polling timed out after 15 minutes");
              setError("Video generation timed out after 15 minutes. Please try again or reduce scene count.");
              setVideosGenerated(false);
              videoGenFailed = true;
            }
          }
        } catch (videoErr: any) {
          console.error(`[ExportToEditron] Video generation exception:`, videoErr);
          setError(`Videos: ${videoErr.message}`);
          videoGenFailed = true;
        }
      }

      if (generateVideos && sbId && genericVideoSceneIndices.length === 0 && avatarSucceededCount > 0) {
        setVideoProgress({ done: avatarSucceededCount, total: expectedTotalVideoClips });
        setVideosGenerated(avatarSucceededCount >= expectedTotalVideoClips);
      }

      const voiceoverSceneIndices = currentScenes
        .filter((scene: any) => typeof scene.narration === "string" && scene.narration.trim().length > 0)
        .map((scene: any, index: number) => ({
          sceneIndex: Number.isInteger(scene.sceneIndex) ? scene.sceneIndex : index,
        }))
        .filter(({ sceneIndex }) => !avatarSceneIndices.has(sceneIndex))
        .map(({ sceneIndex }) => sceneIndex);

      // Step 6: Generate AI voiceover for scenes not handled by Avatar Pipeline.
      if (sbId && voiceoverSceneIndices.length > 0) {
        setStep("generating-voiceover");
        try {
          const voRes = await fetch(`/api/services/pipeline/storyboard/${sbId}/voiceover`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              voice: selectedVoice || undefined,
              sceneIndices: voiceoverSceneIndices,
            }),
          });
          const voData = await voRes.json().catch(() => ({}));
          if (!voRes.ok || voData.scenesProcessed <= 0) {
            const voErr = voData.error || `Voiceover failed (${voRes.status})`;
            console.error("[ExportToEditron] Voiceover failed:", voErr);
            setError((prev) => (prev ? `${prev} | Voiceover: ${voErr}` : `Voiceover: ${voErr}`));
          }
        } catch (voErr: any) {
          console.error("[ExportToEditron] Voiceover error:", voErr.message);
          setError((prev) => (prev ? `${prev} | Voiceover error: ${voErr.message}` : `Voiceover error: ${voErr.message}`));
        }
      }

      // Step 7: Create Editron project
      if (videoGenFailed && generateVideos) {
        setStep(sbId ? "reviewing-storyboard" : "configure");
        return;
      }

      setStep("finalizing");

      if (sbId) {
        const finalizeRes = await fetch(`/api/services/pipeline/storyboard/${sbId}/finalize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            aspectRatio,
            includeVoiceover: scriptHasNarration,
            includeCaptions: true,
            brandId: sourceBrandId,
            requireVideoCoverage: generateVideos,
          }),
        });

        if (!finalizeRes.ok) {
          const data = await finalizeRes.json().catch(() => ({}));
          throw new Error(data.error || `Failed to finalize storyboard (${finalizeRes.status})`);
        }

        const finalizeData = await finalizeRes.json().catch(() => null);
        if (!finalizeData) throw new Error("Invalid response from finalize service");
        createdProjectId = finalizeData.projectId;
        setProjectId(createdProjectId);
        if (finalizeData.audioGenerating) setAudioGenerating(true);
        if (finalizeData.warnings?.length > 0) {
          setError(finalizeData.warnings.join(" | "));
        }
      } else {
        // No storyboard — preflight before spending credits or writing project state.
        if (!sourceSessionId) {
          throw new Error("Cannot preflight Editron import: ThinkForge session id is missing.");
        }

        const preflightRes = await fetch("/api/services/editron/projects/import-from-script", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenes: currentScenes,
            title: currentTitle,
            sourceSessionId,
            aspectRatio,
            sourceScriptId: scriptId,
            brandId: sourceBrandId,
            importMode: "draft-script-import",
            productionManifest: productionManifest || undefined,
            dryRun: true,
          }),
        });

        if (!preflightRes.ok) {
          const data = await preflightRes.json().catch(() => ({}));
          throw new Error(data.error || `Failed to preflight Editron import (${preflightRes.status})`);
        }

        const preflightData = await preflightRes.json().catch(() => null);
        if (!preflightData?.success || preflightData.dryRun !== true) {
          throw new Error("Editron import preflight returned an invalid response.");
        }
        if (preflightData.creditsDeducted !== 0 || preflightData.writeOperationsSkipped !== true) {
          throw new Error("Editron import preflight did not prove zero-credit, no-write behavior.");
        }
        if (!Number.isFinite(preflightData.overlayCount) || preflightData.overlayCount <= 0) {
          throw new Error("Editron import preflight produced no timeline overlays.");
        }
        if (!Number.isFinite(preflightData.totalDurationSeconds) || preflightData.totalDurationSeconds <= 0) {
          throw new Error("Editron import preflight produced an invalid duration.");
        }
        setScriptImportPreflight(preflightData as EditronImportPreflightResult);

        const importRes = await fetch("/api/services/editron/projects/import-from-script", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenes: currentScenes,
            title: currentTitle,
            sourceSessionId,
            aspectRatio,
            sourceScriptId: scriptId,
            brandId: sourceBrandId,
            importMode: "draft-script-import",
            productionManifest: productionManifest || undefined,
          }),
        });

        if (!importRes.ok) {
          const data = await importRes.json().catch(() => ({}));
          throw new Error(data.error || `Failed to create Editron project (${importRes.status})`);
        }

        const importData = await importRes.json().catch(() => null);
        if (!importData) throw new Error("Invalid response from import service");
        createdProjectId = importData.projectId;
        setProjectId(createdProjectId);
      }

      // Step 8: Director Agent — Apply edit profile
      const currentProjectId = createdProjectId;
      if (selectedProfileId && currentProjectId) {
        setStep("directing");
        setDirectorProgress({ step: 0, total: 0, desc: "Starting..." });

        try {
          const directorRes = await fetch("/api/services/editron/director/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId: currentProjectId,
              editProfileId: selectedProfileId,
              brief: {
                selectedProfileId,
                platform: briefPlatform || undefined,
                tone: briefTone || undefined,
                bgmMood: briefBgmMood || undefined,
                overrides: {
                  ...(briefCaptionStyle ? { captionStyle: briefCaptionStyle } : {}),
                },
              },
            }),
          });

          const directorData = await directorRes.json().catch(() => ({}));
          if (directorData.success) {
            if (directorData.warnings?.length > 0) {
              setError(`Edit profile applied with ${directorData.warnings.length} warning(s): ${directorData.warnings[0]}`);
            }
          } else {
            console.warn("[ExportToEditron] Director Agent failed:", directorData.error);
            setError(`Edit profile partially applied. You can fine-tune in the Editron editor.`);
          }
        } catch (directorErr: any) {
          console.warn("[ExportToEditron] Director Agent error:", directorErr.message);
          setError("Edit profile could not be applied. Your project is ready for manual editing.");
        }
      }

      setStep("done");
      sendNotification("Video Project Ready!", "Your AI video has been generated and is ready to edit in Editor.");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setStep("configure");
      sendNotification("Export Failed", err.message || "Something went wrong during export.");
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // Reference image handlers
  // ═══════════════════════════════════════════════════════════════

  const handleRegenerateSubject = async (subjectId: string, feedback?: string) => {
    if (!refSetId || regeneratingSubjectIds.has(subjectId)) return;
    const subject = subjects.find((s) => s.subjectId === subjectId);
    if (subject?.requiresBrandEvidence) {
      const message = "Brand-owned references require uploaded or Brand Vault evidence, not AI regeneration.";
      setError(message);
      sendNotification("Brand Evidence Required", message);
      return;
    }

    setRegeneratingSubjectIds((prev) => new Set(prev).add(subjectId));
    setFeedbackSubjectId(null);
    setFeedbackText("");

    try {
      const res = await fetch(`/api/services/pipeline/reference-images/${refSetId}/subject/${subjectId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artStyle,
          feedback: feedback || undefined,
          modelId: imageModel !== "flux-schnell" ? imageModel : undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));

        // Bundle 4: regenerate is now async — poll until worker completes
        if (data.async && data.batchId && refSetId) {
          setSubjects((prev) =>
            prev.map((s) => (s.subjectId === subjectId ? { ...s, status: "generating" } : s)),
          );

          const POLL_MS = 5000;
          const MAX_POLLS = 40;
          for (let poll = 0; poll < MAX_POLLS; poll++) {
            await new Promise((r) => setTimeout(r, POLL_MS));
            try {
              const statusRes = await fetch(
                `/api/services/pipeline/reference-images/${refSetId}/generate-status?batchId=${data.batchId}`,
              );
              const statusData = await statusRes.json().catch(() => ({}));
              if (statusData.success && statusData.isComplete) {
                const completedSubject = (statusData.subjects || []).find(
                  (s: any) => s.subjectId === subjectId,
                );
                if (completedSubject?.imageUrl) {
                  setSubjects((prev) =>
                    prev.map((s) =>
                      s.subjectId === subjectId
                        ? { ...s, imageUrl: completedSubject.imageUrl, status: "generated" }
                        : s,
                    ),
                  );
                }
                break;
              }
            } catch {
              /* poll failed, retry */
            }
          }
        } else {
          // Sync response (dev mode or legacy)
          setSubjects((prev) =>
            prev.map((s) =>
              s.subjectId === subjectId
                ? { ...s, imageUrl: data.imageUrl || s.imageUrl, status: "generated" }
                : s,
            ),
          );
        }

        setApprovedSubjectIds((prev) => {
          const next = new Set(prev);
          next.add(subjectId);
          return next;
        });
        sendNotification(
          "Reference Updated",
          `"${subjects.find((s) => s.subjectId === subjectId)?.name || subjectId}" regenerated.`,
        );
      }
    } catch (err) {
      console.error("[ExportToEditron] Regenerate subject failed:", err);
    } finally {
      setRegeneratingSubjectIds((prev) => {
        const next = new Set(prev);
        next.delete(subjectId);
        return next;
      });
    }
  };

  const handleUploadSubjectImage = async (subjectId: string, file: File) => {
    if (!refSetId) return;
    setRegeneratingSubjectIds((prev) => new Set(prev).add(subjectId));

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/services/pipeline/reference-images/${refSetId}/subject/${subjectId}/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.imageUrl) {
        setSubjects((prev) =>
          prev.map((s) =>
            s.subjectId === subjectId
              ? {
                  ...s,
                  imageUrl: data.imageUrl,
                  imageAssetId: data.imageAssetId || data.assetId || s.imageAssetId,
                  imageGcsPath: data.imageGcsPath || data.gcsPath || s.imageGcsPath,
                  source: data.source || "user-upload",
                  assetRole: data.assetRole || s.assetRole,
                  visualDescription: data.visualDescription || s.visualDescription,
                  status: "generated",
                  referenceProvenance: data.referenceProvenance || "uploaded",
                  referenceProvenanceLabel: data.referenceProvenanceLabel || "Uploaded",
                  requiresBrandEvidence:
                    typeof data.requiresBrandEvidence === "boolean" ? data.requiresBrandEvidence : s.requiresBrandEvidence,
                  brandEvidenceStatus: data.brandEvidenceStatus || (s.requiresBrandEvidence ? "resolved" : s.brandEvidenceStatus),
                  evidenceRequiredReason: data.brandEvidenceStatus === "resolved" ? undefined : s.evidenceRequiredReason,
                }
              : s,
          ),
        );
        setApprovedSubjectIds((prev) => {
          const next = new Set(prev);
          next.add(subjectId);
          return next;
        });
      } else {
        setError(data.error || "Upload failed");
      }
    } catch (err: any) {
      console.error("[ExportToEditron] Upload subject image failed:", err);
      setError(`Upload failed: ${err.message}`);
    } finally {
      setRegeneratingSubjectIds((prev) => {
        const next = new Set(prev);
        next.delete(subjectId);
        return next;
      });
    }
  };

  const handleUploadSceneImage = async (sceneIndex: number, file: File) => {
    if (!storyboardId) return;
    setRegeneratingSceneIdxs((prev) => new Set(prev).add(sceneIndex));

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/services/pipeline/storyboard/${storyboardId}/scene/${sceneIndex}/upload-image`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.imageUrl) {
        setStoryboardScenes((prev: any[]) =>
          prev.map((s: any) =>
            s.sceneIndex === sceneIndex
              ? { ...s, imageUrl: data.imageUrl, imageAssetId: data.assetId }
              : s,
          ),
        );
      } else {
        setError(data.error || "Scene image upload failed");
      }
    } catch (err: any) {
      console.error("[ExportToEditron] Upload scene image failed:", err);
    } finally {
      setRegeneratingSceneIdxs((prev) => {
        const next = new Set(prev);
        next.delete(sceneIndex);
        return next;
      });
    }
  };

  const toggleFeedbackPrompt = (subjectId: string) => {
    if (feedbackSubjectId === subjectId) {
      setFeedbackSubjectId(null);
      setFeedbackText("");
    } else {
      setFeedbackSubjectId(subjectId);
      setFeedbackText("");
      setEditingSubjectId(null);
    }
  };

  const handleDeleteSubject = async (subjectId: string) => {
    setSubjects((prev) => prev.filter((s) => s.subjectId !== subjectId));
    setApprovedSubjectIds((prev) => {
      const next = new Set(prev);
      next.delete(subjectId);
      return next;
    });
    if (feedbackSubjectId === subjectId) {
      setFeedbackSubjectId(null);
      setFeedbackText("");
    }
    if (editingSubjectId === subjectId) {
      setEditingSubjectId(null);
      setEditingDescription("");
    }

    if (refSetId) {
      try {
        await fetch(`/api/services/pipeline/reference-images/${refSetId}/subject/${subjectId}/delete`, {
          method: "DELETE",
        });
      } catch (err) {
        console.error("[ExportToEditron] Delete subject DB error:", err);
      }
    }
  };

  const handleGenerateSuggested = async (suggested: SuggestedSubject) => {
    if (!refSetId || generatingSuggestedIds.has(suggested.id)) return;
    setGeneratingSuggestedIds((prev) => new Set(prev).add(suggested.id));
    setError("");

    try {
      const res = await fetch(`/api/services/pipeline/reference-images/${refSetId}/add-subject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: suggested.name,
          category: suggested.category,
          visualDescription: suggested.visualDescription,
          scenesAppearingIn: suggested.scenesAppearingIn,
          artStyle,
          modelId: imageModel !== "flux-schnell" ? imageModel : undefined,
          brandId: sourceBrandId || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed (${res.status})`);
      }

      const data = await res.json().catch(() => ({}));
      if (!data.subject) throw new Error("Invalid response");

      const newSubject = buildSubjectRefFromResponse(data.subject, "suggested");
      setSubjects((prev) => [...prev, newSubject]);
      setSuggestedSubjects((prev) => prev.filter((s) => s.id !== suggested.id));

      // Async polling
      if (data.async && data.batchId && refSetId) {
        const POLL_MS = 5000;
        const MAX_POLLS = 40;
        for (let poll = 0; poll < MAX_POLLS; poll++) {
          await new Promise((r) => setTimeout(r, POLL_MS));
          try {
            const statusRes = await fetch(
              `/api/services/pipeline/reference-images/${refSetId}/generate-status?batchId=${data.batchId}`,
            );
            const statusData = await statusRes.json().catch(() => ({}));
            if (statusData.success && statusData.isComplete) {
              const completedSubject = (statusData.subjects || []).find(
                (s: any) => s.subjectId === newSubject.subjectId,
              );
              if (completedSubject?.imageUrl) {
                setSubjects((prev) =>
                  prev.map((s) =>
                    s.subjectId === newSubject.subjectId
                      ? { ...s, imageUrl: completedSubject.imageUrl, status: "generated" }
                      : s,
                  ),
                );
              }
              break;
            }
          } catch {
            /* poll failed, retry */
          }
        }
      }

      if (data.async || shouldAutoApproveReferenceSubject(newSubject)) {
        setApprovedSubjectIds((prev) => {
          const next = new Set(prev);
          next.add(newSubject.subjectId);
          return next;
        });
      }
      applyBrandReferenceWarnings(data.brandReferenceWarnings);
      if (newSubject.brandEvidenceStatus !== "missing") {
        sendNotification("Reference Added", `"${suggested.name}" reference ${newSubject.imageUrl ? "ready" : "queued"}.`);
      }
    } catch (err: any) {
      setError(`Generate "${suggested.name}" failed: ${err.message}`);
    } finally {
      setGeneratingSuggestedIds((prev) => {
        const next = new Set(prev);
        next.delete(suggested.id);
        return next;
      });
    }
  };

  const handleAddSubject = async () => {
    if (!refSetId || !newSubjectName.trim() || !newSubjectDescription.trim()) return;
    setAddingSubject(true);
    setError("");

    try {
      const sceneNums = newSubjectScenes
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n >= 1)
        .map((n) => n - 1);

      const res = await fetch(`/api/services/pipeline/reference-images/${refSetId}/add-subject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newSubjectName.trim(),
          category: newSubjectCategory,
          visualDescription: newSubjectDescription.trim(),
          scenesAppearingIn: sceneNums.length > 0 ? sceneNums : scenes.map((_: any, i: number) => i),
          artStyle,
          modelId: imageModel !== "flux-schnell" ? imageModel : undefined,
          brandId: sourceBrandId || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed (${res.status})`);
      }

      const data = await res.json().catch(() => ({}));
      if (!data.subject) throw new Error("Invalid response from add-subject");

      const newSubject = buildSubjectRefFromResponse(data.subject);
      setSubjects((prev) => [...prev, newSubject]);

      // Async polling
      if (data.async && data.batchId && refSetId) {
        const POLL_MS = 5000;
        const MAX_POLLS = 40;
        for (let poll = 0; poll < MAX_POLLS; poll++) {
          await new Promise((r) => setTimeout(r, POLL_MS));
          try {
            const statusRes = await fetch(
              `/api/services/pipeline/reference-images/${refSetId}/generate-status?batchId=${data.batchId}`,
            );
            const statusData = await statusRes.json().catch(() => ({}));
            if (statusData.success && statusData.isComplete) {
              const completedSubject = (statusData.subjects || []).find(
                (s: any) => s.subjectId === newSubject.subjectId,
              );
              if (completedSubject?.imageUrl) {
                setSubjects((prev) =>
                  prev.map((s) =>
                    s.subjectId === newSubject.subjectId
                      ? { ...s, imageUrl: completedSubject.imageUrl, status: "generated" }
                      : s,
                  ),
                );
              }
              break;
            }
          } catch {
            /* poll failed, retry */
          }
        }
      }

      if (data.async || shouldAutoApproveReferenceSubject(newSubject)) {
        setApprovedSubjectIds((prev) => {
          const next = new Set(prev);
          next.add(newSubject.subjectId);
          return next;
        });
      }
      applyBrandReferenceWarnings(data.brandReferenceWarnings);

      // Reset form
      setNewSubjectName("");
      setNewSubjectCategory("character");
      setNewSubjectDescription("");
      setNewSubjectScenes("");
      setShowAddSubject(false);
    } catch (err: any) {
      setError(`Add subject failed: ${err.message}`);
    } finally {
      setAddingSubject(false);
    }
  };

  const handleStartEditDescription = (subjectId: string) => {
    const subject = subjects.find((s) => s.subjectId === subjectId);
    if (!subject) return;
    setEditingSubjectId(subjectId);
    setEditingDescription(subject.visualDescription || "");
    setFeedbackSubjectId(null);
  };

  const handleSaveDescriptionAndRegenerate = async (subjectId: string) => {
    if (!editingDescription.trim()) return;
    setSubjects((prev) =>
      prev.map((s) =>
        s.subjectId === subjectId
          ? { ...s, visualDescription: editingDescription.trim() }
          : s,
      ),
    );
    setEditingSubjectId(null);
    await handleRegenerateSubject(subjectId, editingDescription.trim());
  };

  // ═══════════════════════════════════════════════════════════════
  // Storyboard scene regeneration
  // ═══════════════════════════════════════════════════════════════

  const handleRegenerateStoryboardScene = async (sceneIndex: number, feedback?: string) => {
    if (!storyboardId || regeneratingSceneIdxs.has(sceneIndex)) return;
    setRegeneratingSceneIdxs((prev) => new Set(prev).add(sceneIndex));
    setError("");
    try {
      const res = await fetch(
        `/api/services/pipeline/storyboard/${storyboardId}/scene/${sceneIndex}/regenerate-with-context`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            feedback: feedback || undefined,
            userId: undefined,
          }),
        },
      );
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `Failed (${res.status})`);
      }
      const data = await res.json().catch(() => ({}));
      const updatedScene = data.scene || data;
      setStoryboardScenes((prev: any[]) =>
        prev.map((s: any) =>
          s.sceneIndex === sceneIndex
            ? { ...s, imageUrl: updatedScene.imageUrl || s.imageUrl, imageAssetId: updatedScene.imageAssetId || s.imageAssetId }
            : s,
        ),
      );
      setSceneFeedbackIdx(null);
      setSceneFeedbackText("");
      sendNotification("Scene Regenerated", `Scene ${sceneIndex + 1} storyboard image updated.`);
    } catch (err: any) {
      setError(`Scene ${sceneIndex + 1} regeneration failed: ${err.message}`);
    } finally {
      setRegeneratingSceneIdxs((prev) => {
        const next = new Set(prev);
        next.delete(sceneIndex);
        return next;
      });
    }
  };

  // ─── Step description ──────────────────────────────────────────
  const stepDescription = (): string => {
    switch (step) {
      case "configure":
        return "Convert your script into a video project";
      case "exporting":
        return "Parsing scenes from your script...";
      case "profile-selection":
        return "Confirm your edit profile";
      case "extracting-subjects":
        return "Identifying key subjects for visual consistency...";
      case "generating-references":
        return "Generating reference images for subjects...";
      case "reviewing-references":
        return "Review and approve reference images";
      case "storyboard":
        return "Generating AI storyboard images...";
      case "reviewing-storyboard":
        return "Review storyboard images before video generation";
      case "generating-videos":
        return "Generating AI video clips...";
      case "generating-voiceover":
        return "Generating AI voiceover...";
      case "finalizing":
        return "Building your Editor project...";
      case "directing":
        return `Applying edit profile${directorProgress.desc ? ": " + directorProgress.desc : "..."}`;
      case "done":
        return "Your project is ready!";
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // Return everything
  // ═══════════════════════════════════════════════════════════════

  return {
    // Pipeline step
    step,
    setStep,

    // Config state
    title,
    setTitle,
    aspectRatio,
    setAspectRatio,
    generateStoryboard,
    setGenerateStoryboard,
    generateVideos,
    setGenerateVideos,
    artStyle,
    setArtStyle,
    imageModel,
    setImageModel,
    videoModel,
    setVideoModel,
    enableChaining,
    setEnableChaining,
    selectedVoice,
    setSelectedVoice,
    availableVoices,
    previewingVoice,
    error,
    setError,

    // Profile detection
    detectedProfile,
    setDetectedProfile,
    selectedProfileId,
    setSelectedProfileId,
    profileSearchQuery,
    setProfileSearchQuery,
    briefPlatform,
    setBriefPlatform,
    briefTone,
    setBriefTone,
    briefCaptionStyle,
    setBriefCaptionStyle,
    briefBgmMood,
    setBriefBgmMood,
    directorProgress,

    // Results
    scenes,
    projectId,
    audioGenerating,
    storyboardId,
    storyboardScenes,
    scriptImportPreflight,
    videoProgress,
    videosGenerated,
    clickatronCreating,
    clickatronHandoffState,
    clickatronVisualChoices,
    setClickatronVisualChoice,

    // Reference image state
    refSetId,
    subjects,
    approvedSubjectIds,
    setApprovedSubjectIds,
    missingBrandEvidenceSubjects,
    generatedBrandOwnedSubjects,
    referenceContinueBlocked,
    referenceContinueMessage,
    regeneratingSubjectIds,
    feedbackSubjectId,
    setFeedbackSubjectId,
    feedbackText,
    setFeedbackText,
    editingSubjectId,
    setEditingSubjectId,
    editingDescription,
    setEditingDescription,
    overallMusicPrompt,

    // Suggested subjects
    suggestedSubjects,
    generatingSuggestedIds,
    scriptSearchQuery,
    setScriptSearchQuery,

    // Add new subject form
    showAddSubject,
    setShowAddSubject,
    addingSubject,
    newSubjectName,
    setNewSubjectName,
    newSubjectCategory,
    setNewSubjectCategory,
    newSubjectDescription,
    setNewSubjectDescription,
    newSubjectScenes,
    setNewSubjectScenes,

    // Style guide metadata
    colorPalette,
    characterDescriptions,
    environmentNotes,
    globalEditDirections,
    suggestedProfileCategory,

    // Storyboard scene edit state
    regeneratingSceneIdxs,
    sceneFeedbackIdx,
    setSceneFeedbackIdx,
    sceneFeedbackText,
    setSceneFeedbackText,

    // Refs
    previewAudioRef,

    // Handlers
    handleExport,
    handlePostProfileSelection,
    handlePhase2,
    handlePhase3,
    handleRegenerateSubject,
    handleUploadSubjectImage,
    handleUploadSceneImage,
    toggleFeedbackPrompt,
    handleDeleteSubject,
    handleGenerateSuggested,
    handleAddSubject,
    handleStartEditDescription,
    handleSaveDescriptionAndRegenerate,
    handleRegenerateStoryboardScene,
    handlePreviewVoice,
    handleCreateClickatronSession,
    handleClose,
    reset,
    estimateCredits,
    stepDescription,
  };
}
