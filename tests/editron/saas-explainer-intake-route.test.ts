import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  generateScript: vi.fn(),
  isLLMParserAvailable: vi.fn(),
  parseScriptWithLLM: vi.fn(),
  createProject: vi.fn(),
  saveProject: vi.fn(),
  scenesToOverlays: vi.fn(),
  scenesToTotalFrames: vi.fn(),
  deductCredits: vi.fn(),
  refundCredits: vi.fn(),
  isTTSAvailable: vi.fn(),
  generateVoiceover: vi.fn(),
  updateOne: vi.fn(),
  createProjectLink: vi.fn(),
  analyzeSaasExplainerReference: vi.fn(),
  resolveSaasExplainerBrandContext: vi.fn(),
  buildSaasGeneratedSceneOverlays: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/thinkforge/agents/script-draft-agent", () => ({
  ScriptDraftAgent: vi.fn().mockImplementation(() => ({ generateScript: mocks.generateScript })),
}));
vi.mock("@/lib/pipeline/llm-scene-parser", () => ({
  isLLMParserAvailable: mocks.isLLMParserAvailable,
  parseScriptWithLLM: mocks.parseScriptWithLLM,
}));
vi.mock("@/lib/editron/services/project-service", () => ({
  projectService: {
    createProject: mocks.createProject,
    saveProject: mocks.saveProject,
  },
}));
vi.mock("@/lib/pipeline/scene-to-editron", () => ({
  scenesToOverlays: mocks.scenesToOverlays,
  scenesToTotalFrames: mocks.scenesToTotalFrames,
}));
vi.mock("@/lib/editron/saas-explainer/generated-scene", () => ({
  buildSaasGeneratedSceneOverlays: mocks.buildSaasGeneratedSceneOverlays,
  isPromptLikeVisibleText: (value: string) => /(^|\b)(visual\s*:|voiceover\s*:|narration\s*:|audio\s*:|camera\s+direction\b|video\s+motion\b|visualdescription\b|audiodescription\b|videomotionprompt\b|scene\s+prompt\b|write\s+a\b|generate\s+a\b|source\s*map\b|metadata\b|llm\b)/i.test(value),
}));
vi.mock("@/lib/pipeline/tts-service", () => ({
  TTS_VOICES: [
    { id: "kokoro-bella", provider: "kokoro", providerVoiceId: "af_bella" },
    { id: "kokoro-heart", provider: "kokoro", providerVoiceId: "af_heart" },
    { id: "kokoro-jessica", provider: "kokoro", providerVoiceId: "af_jessica" },
    { id: "kokoro-liam", provider: "kokoro", providerVoiceId: "am_liam" },
    { id: "kokoro-michael", provider: "kokoro", providerVoiceId: "am_michael" },
    { id: "kokoro-nova", provider: "kokoro", providerVoiceId: "af_nova" },
    { id: "kokoro-eric", provider: "kokoro", providerVoiceId: "am_eric" },
  ],
  isTTSAvailable: mocks.isTTSAvailable,
  generateVoiceover: mocks.generateVoiceover,
}));
vi.mock("@/lib/services/creditsService", () => ({
  CreditsService: { deductCredits: mocks.deductCredits, refundCredits: mocks.refundCredits },
}));
vi.mock("@/lib/editron/db/mongodb", () => ({
  COLLECTIONS: { PROJECTS: "projects" },
  getDatabase: vi.fn(async () => ({
    collection: vi.fn(() => ({ updateOne: mocks.updateOne })),
  })),
}));
vi.mock("@/lib/shared/project-links", () => ({
  createProjectLink: mocks.createProjectLink,
}));
vi.mock("@/lib/editron/saas-explainer/reference-analysis", () => ({
  analyzeSaasExplainerReference: mocks.analyzeSaasExplainerReference,
}));
vi.mock("@/lib/editron/saas-explainer/brand-context", () => ({
  resolveSaasExplainerBrandContext: mocks.resolveSaasExplainerBrandContext,
}));

function request(path: string, body: Record<string, unknown>): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function cloneOverlays<T>(overlays: T): T {
  return JSON.parse(JSON.stringify(overlays)) as T;
}

const validScene = {
  sceneIndex: 0,
  title: "Hook",
  narration: "See the dashboard become the operating layer for your launch.",
  visualDescription: "Clean SaaS dashboard with highlighted workflow cards.",
  videoMotionPrompt: "Slow push toward the active workflow card.",
  audioDescription: "",
  musicDescription: "Upbeat focused electronic bed.",
  sfxDescription: "Subtle UI click.",
  durationSeconds: 6,
  mood: "energetic",
  imageQualityTokens: "clean product UI, crisp lighting",
  videoQualityTokens: "smooth product-demo motion",
  generationUnitId: "dashboard-hook",
  primaryVisualForUnit: true,
  sceneType: "continuous",
  assetRecommendation: "ai-video",
};

const acceptedReferenceAnalysis = {
  status: "accepted" as const,
  sourceKind: "remote-url",
  confidence: 0.93,
  analysisModel: "glm-4.6v",
  gateModel: "glm-4.6v-flashx",
  cacheStatus: "miss" as const,
  evaluationWindowSec: 60,
  styleBrief: {
    summary: "A dashboard-led SaaS demo with readable workflow proof.",
    category: "saas_product_demo",
    pacing: "medium; short UI-led beats; pause on proof screens",
    uiTreatment: "balanced UI density; centered app surfaces; subtle depth",
    visualLanguage: ["dark canvas", "precise product closeups"],
    typography: "medium to bold; clear hierarchy; soft fades",
    colorPalette: ["#0B0B0A", "#D4A652"],
    motion: "Clean cuts and gentle pushes; slow push; cursorless UI changes",
    transferBoundaries: ["Do not copy exact app layout or claims."],
  },
};

const visibleGeneratedSceneDraftOverlays = [
  {
    id: 1,
    type: "generated-scene",
    from: 0,
    durationInFrames: 180,
    sceneModel: {
      voiceover: {
        script: "This is only a reserved narration slot...",
        status: "pending_tts",
      },
      elements: [{ id: "headline", role: "headline", text: "Launch workflows without the guesswork." }],
      captionTracks: [{ id: "caption_1", text: "Plan launches faster.", startMs: 0, endMs: 2200 }],
      qualityGates: {
        productSpecificVisualProof: false,
        motionChoreographyPlanned: false,
        finalVisualProof: false,
      },
    },
    sourceMap: {
      elements: {
        headline: { modelPath: ["elements", 0, "text"] },
      },
    },
    metadata: {
      generatedSceneId: "saas_scene_0",
      validation: { ok: true, issues: [] },
    },
  },
  {
    id: 2,
    type: "sound",
    from: 0,
    durationInFrames: 180,
    src: "",
    content: "VO pending: This is only a reserved narration slot...",
    metadata: {
      isVoiceover: true,
      sceneIndex: 0,
      generatedSceneId: "saas_scene_0",
      narrationText: "This is only a reserved narration slot...",
      status: "pending_tts",
    },
  },
];

const promptLeakGeneratedSceneOverlays = [
  {
    id: 1,
    type: "generated-scene",
    sceneModel: {
      elements: [{ id: "headline", role: "headline", text: "Visual: show dashboard workflow prompt" }],
      captionTracks: [{ id: "caption_1", text: "Plan launches faster.", startMs: 0, endMs: 2200 }],
    },
    sourceMap: {
      elements: {
        headline: { modelPath: ["elements", 0, "text"] },
      },
    },
    metadata: {
      validation: { ok: false, issues: ["prompt_like_visible_text:Visual: show dashboard workflow prompt"] },
    },
  },
  {
    id: 2,
    type: "sound",
    src: "https://cdn.example.com/voiceover.wav",
    content: "https://cdn.example.com/voiceover.wav",
    metadata: { isVoiceover: true, sceneIndex: 0 },
  },
];

const completeGeneratedSceneOverlays = [
  {
    id: 1,
    type: "generated-scene",
    sceneModel: {
      elements: [{ id: "caption_1", role: "caption", text: "Plan launches faster." }],
      qualityGates: {
        productSpecificVisualProof: true,
        motionChoreographyPlanned: true,
        finalVisualProof: true,
      },
    },
    sourceMap: {
      elements: {
        caption_1: { modelPath: ["elements", 0, "text"] },
      },
    },
  },
  {
    id: 2,
    type: "sound",
    src: "https://cdn.example.com/voiceover.wav",
    content: "https://cdn.example.com/voiceover.wav",
    metadata: { isVoiceover: true, sceneIndex: 0 },
  },
];

const acceptedBrandContext = {
  defaults: {
    brief: {
      productName: "Insturix",
      productServices: ["AI content production platform"],
      audience: ["creator houses", "agencies"],
      valueDrivers: ["faster launch cycles"],
      painPoints: ["fragmented production workflows"],
      jobsToBeDone: ["script, edit, analyze, design, distribute, and share launch content"],
      proofStyle: "demo",
      outcomeHint: "Create a product-led SaaS explainer for AI content production platform for creator houses by addressing fragmented production workflows. Use demo proof where evidence exists.",
    },
    visual: {
      colors: ["#0B0B0A", "#D4A652"],
      fonts: ["Plus Jakarta Sans"],
      logoAssets: [{ kind: "logo", label: "Primary logo", url: "https://cdn.example.com/insturix-logo.svg", stored: true, signalPath: "assets.logoCandidates" }],
      productImages: [{ kind: "product", label: "Dashboard", url: "https://cdn.example.com/insturix-dashboard.png", stored: true, signalPath: "assets.productImages" }],
      densityTolerance: 0.72,
      dataVizAffinity: 0.7,
      signalPaths: ["visual.densityTolerance", "visual.dataVizAffinity"],
    },
    motion: {
      motionEnergy: 0.58,
      transitionSharpness: 0.66,
      pacePreference: 0.58,
      signalPaths: ["motion.motionEnergy", "motion.transitionSharpness", "narrative.pacePreference"],
    },
  },
  promptBlock: [
    "<saas_explainer_brand_vault_context>",
    "Source: accepted Brand Vault profile.",
    "<brand_default_brief>",
    "Default product name: Insturix",
    "Products/services: AI content production platform",
    "Audience: creator houses, agencies",
    "Audience pain points: fragmented production workflows",
    "Default outcome: Create a product-led SaaS explainer for AI content production platform for creator houses by addressing fragmented production workflows. Use demo proof where evidence exists.",
    "</brand_default_brief>",
    "<brand_visual_defaults>",
    "Resolved colors: #0B0B0A, #D4A652",
    "Resolved fonts: Plus Jakarta Sans",
    "Logo defaults: Primary logo (https://cdn.example.com/insturix-logo.svg)",
    "Product image defaults: Dashboard (https://cdn.example.com/insturix-dashboard.png)",
    "Visual signal paths: visual.densityTolerance, visual.dataVizAffinity",
    "</brand_visual_defaults>",
    "<brand_motion_defaults>",
    "Motion values: motionEnergy=0.58, transitionSharpness=0.66, pacePreference=0.58",
    "Motion signal paths: motion.motionEnergy, motion.transitionSharpness, narrative.pacePreference",
    "</brand_motion_defaults>",
    "<brand_context>",
    "Brand: Insturix",
    "Products/services: AI content production platform",
    "</brand_context>",
    "<brand_render_tokens>",
    "Primary color: #0B0B0A",
    "Accent color: #D4A652",
    "Typography: Plus Jakarta Sans",
    "Pace preference: 0.58",
    "</brand_render_tokens>",
    "<brand_voice_tokens>",
    "Assertiveness: 0.78",
    "Default formality: 0.74",
    "CTA directness: 0.65",
    "Accepted signal paths: voice.assertiveness, voice.defaultFormality, voice.ctaDirectness",
    "</brand_voice_tokens>",
    "</saas_explainer_brand_vault_context>",
  ].join("\n"),
  brandInputs: {
    primaryColor: "#0B0B0A",
    accentColor: "#D4A652",
    typography: "Plus Jakarta Sans",
    pacePreference: 0.58,
  },
  voiceSignals: {
    assertiveness: 0.78,
    warmth: 0.42,
    jargonDensity: 0.6,
    humor: 0.18,
    defaultFormality: 0.74,
    ctaDirectness: 0.65,
    recurringPhrases: ["launch operating layer"],
    killList: ["cheap"],
    hookArchetypes: ["proof-led"],
    signalPaths: ["voice.assertiveness", "voice.defaultFormality", "voice.ctaDirectness"],
  },
  missingInputs: [],
  metadata: {
    source: "brand_vault",
    brandId: "brand_1",
    acceptedProfile: true,
    promptContextProvided: true,
    brandInputKeys: ["accentColor", "pacePreference", "primaryColor", "typography"],
    missingInputs: [],
    defaultContract: {
      productName: "Insturix",
      productServices: 1,
      audience: 2,
      valueDrivers: 1,
      painPoints: 1,
      jobsToBeDone: 1,
      proofStyle: "demo",
      outcomeHintProvided: true,
      colorCount: 2,
      fontCount: 1,
      logoAssetCount: 1,
      productImageCount: 1,
      visualSignalPaths: ["visual.densityTolerance", "visual.dataVizAffinity"],
      motionSignalPaths: ["motion.motionEnergy", "motion.transitionSharpness", "narrative.pacePreference"],
    },
  },
};

describe("SaaS explainer routes", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.auth.mockResolvedValue({ userId: "user_1", orgId: "org_1" });
    mocks.isLLMParserAvailable.mockReturnValue(true);
    mocks.generateScript.mockResolvedValue({
      title: "Insturix Explainer",
      content: "PRIVATE SCRIPT: full generated draft should not echo in the API response.",
      blocks: [],
      draft: true,
      outline: { sections: [] },
      sections: [],
    });
    mocks.parseScriptWithLLM.mockResolvedValue({ scenes: [validScene] });
    mocks.analyzeSaasExplainerReference.mockResolvedValue({ ok: true });
    mocks.deductCredits.mockResolvedValue({ success: true });
    mocks.createProject.mockResolvedValue({ projectId: "project_1" });
    mocks.saveProject.mockResolvedValue(undefined);
    mocks.buildSaasGeneratedSceneOverlays.mockImplementation(() => cloneOverlays(visibleGeneratedSceneDraftOverlays));
    mocks.isTTSAvailable.mockReturnValue(false);
    mocks.generateVoiceover.mockResolvedValue({
      audioBuffer: Buffer.from("wav"),
      audioUrl: "https://cdn.example.com/generated-brand-voice.wav",
      audioAssetId: "voiceover_brand_1",
      durationMs: 5100,
      gcsPath: "voiceovers/voiceover_brand_1.wav",
    });
    mocks.scenesToTotalFrames.mockReturnValue(180);
    mocks.updateOne.mockResolvedValue({ acknowledged: true });
    mocks.createProjectLink.mockResolvedValue(undefined);
    mocks.resolveSaasExplainerBrandContext.mockResolvedValue(acceptedBrandContext);
  });

  it("rejects empty upload-first intake with no creative source", async () => {
    const { POST } = await import("@/app/api/services/editron/saas-explainer/intake/route");
    const response = await POST(request("/api/services/editron/saas-explainer/intake", {}) as never);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.code).toBe("empty_saas_explainer_source");
  });

  it("accepts Brand Vault as the creative source without forcing a manual brief", async () => {
    const { POST } = await import("@/app/api/services/editron/saas-explainer/intake/route");
    const response = await POST(request("/api/services/editron/saas-explainer/intake", {
      brandId: "brand_1",
      durationSec: 60,
      aspectRatio: "16:9",
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.intake).toMatchObject({ brandId: "brand_1" });
  });

  it("accepts product context and a direct SaaS reference video without requiring main footage", async () => {
    const { POST } = await import("@/app/api/services/editron/saas-explainer/intake/route");
    const secretScript = "PRIVATE SCRIPT: unreleased positioning should not echo back.";
    const response = await POST(request("/api/services/editron/saas-explainer/intake", {
      productName: "Insturix",
      productUrl: "https://insturix.example/pricing#secret",
      outcome: "Show the workflow and pricing proof.",
      audience: "SaaS founders",
      script: secretScript,
      referenceVideoUrl: "https://cdn.example.com/reference-demo.mp4",
      durationSec: 60,
      aspectRatio: "16:9",
      brandId: "brand_1",
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.mode).toBe("saas_explainer");
    expect(payload.referencePolicy).toMatchObject({
      mainFootageRequired: false,
      gate: "glm_5_frame_saas_gate",
      maxEvaluationDurationSec: 120,
    });
    expect(payload.intake).toMatchObject({
      productName: "Insturix",
      productUrl: "https://insturix.example/pricing",
      brandId: "brand_1",
    });
    expect(payload.intake.script).toEqual({ provided: true, length: secretScript.length });
    expect(payload.intake.referenceVideo.kind).toBe("remote-url");
    expect(JSON.stringify(payload)).not.toContain("PRIVATE SCRIPT");
  });


  it("rejects unsafe product URLs before downstream website analysis can fetch them", async () => {
    const { POST } = await import("@/app/api/services/editron/saas-explainer/intake/route");
    const response = await POST(request("/api/services/editron/saas-explainer/intake", {
      productUrl: "http://127.0.0.1:3000/internal",
      outcome: "Make a product demo.",
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.code).toBe("invalid_product_url");
  });

  it("uses Brand Vault default brief when no manual brief is provided", async () => {
    const { POST } = await import("@/app/api/services/editron/saas-explainer/generate/route");
    const response = await POST(request("/api/services/editron/saas-explainer/generate", {
      brandId: "brand_1",
      durationSec: 45,
      aspectRatio: "16:9",
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.brandContext).toMatchObject({
      source: "brand_vault",
      defaultContract: expect.objectContaining({
        productName: "Insturix",
        audience: 2,
        productServices: 1,
        logoAssetCount: 1,
        productImageCount: 1,
      }),
    });
    expect(mocks.createProject).toHaveBeenCalledWith("user_1", "Insturix SaaS Explainer", expect.objectContaining({
      brandId: "brand_1",
    }));
    const scriptInput = mocks.generateScript.mock.calls[0][0];
    expect(scriptInput.project.purpose).toContain("AI content production platform");
    expect(scriptInput.project.originalPrompt).toContain("fragmented production workflows");
    expect(scriptInput.context.projectSummary).toContain("Default product name: Insturix");
    expect(scriptInput.context.projectSummary).toContain("Product: Insturix");
    expect(mocks.buildSaasGeneratedSceneOverlays).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({
        productName: "Insturix",
        audience: "creator houses, agencies",
        outcome: expect.stringContaining("AI content production platform"),
      }),
      brandContext: expect.objectContaining({
        defaults: expect.objectContaining({
          visual: expect.objectContaining({ logoAssets: expect.any(Array), productImages: expect.any(Array) }),
          motion: expect.objectContaining({ signalPaths: expect.arrayContaining(["motion.motionEnergy"]) }),
        }),
      }),
    }));
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { userId: "user_1", projectId: "project_1" },
      { $set: expect.objectContaining({
        saasExplainer: expect.objectContaining({
          productName: "Insturix",
          audience: "creator houses, agencies",
          brandDefaultsApplied: { productName: true, audience: true, outcome: true },
        }),
      }) },
    );
  });
  it("uses the default Lovable style reference when no reference video is provided", async () => {
    const { POST } = await import("@/app/api/services/editron/saas-explainer/generate/route");
    const response = await POST(request("/api/services/editron/saas-explainer/generate", {
      brandId: "brand_1",
      durationSec: 45,
      aspectRatio: "16:9",
    }) as never);

    expect(response.status).toBe(200);
    const scriptInput = mocks.generateScript.mock.calls[0][0];
    expect(scriptInput.userPrompt).toContain("Style reference: Lovable 2.0 public SaaS launch video style reference.");
    expect(scriptInput.userPrompt).toContain("hook-value-CTA");
    expect(scriptInput.userPrompt).toContain("https://www.youtube.com/watch?v=xDwR1_vrIg8");
    expect(scriptInput.userPrompt).toContain("Do not copy Lovable's exact layouts");
    expect(scriptInput.context.projectSummary).toContain("Lovable 2.0 public SaaS launch video style reference");
    expect(mocks.buildSaasGeneratedSceneOverlays).toHaveBeenCalledWith(expect.objectContaining({
      referenceStyleBrief: expect.objectContaining({
        summary: "Default SaaS explainer style reference informed by Lovable 2.0 and the SaaS structure doctrine.",
        category: "saas_product_demo",
        visualLanguage: expect.arrayContaining(["public launch-video energy", "workspace collaboration cues", "clear CTA and logo close"]),
        transferBoundaries: expect.arrayContaining([
          expect.stringContaining("Default style reference"),
          expect.stringContaining("Do not invent customer names"),
        ]),
      }),
    }));
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { userId: "user_1", projectId: "project_1" },
      { $set: expect.objectContaining({
        saasExplainer: expect.objectContaining({
          styleSource: "default_style_reference_video",
          structureDoctrine: expect.objectContaining({
            version: "saas-structure-doctrine/v1",
            source: "default_style_reference_video",
            referenceProvided: false,
            defaultUsed: true,
            defaultReference: expect.objectContaining({
              label: "Lovable 2.0 public SaaS launch video style reference",
              url: "https://www.youtube.com/watch?v=xDwR1_vrIg8",
              uploadedFileName: "YTDown_YouTube_Lovable-2-0-is-here-Multiplayer-vibe-cod_Media_xDwR1_vrIg8_002_720p.mp4",
              usage: "style_only",
            }),
            requiredSceneFamilies: expect.arrayContaining(["hook", "workflow_demo", "cta", "logo_outro"]),
            sourceDocuments: expect.arrayContaining([
              "docs/agents/reference/general/phase_f_g_saas_motion.md",
              "lib/editron/data/creative-knowledge-graph.json",
              "https://www.youtube.com/watch?v=xDwR1_vrIg8",
            ]),
          }),
          referenceVideo: { provided: false },
        }),
      }) },
    );
  });
  it("creates a visible generated-scene draft but waits for real voiceover before completion", async () => {
    const { POST } = await import("@/app/api/services/editron/saas-explainer/generate/route");
    const response = await POST(request("/api/services/editron/saas-explainer/generate", {
      productName: "Insturix",
      productUrl: "https://insturix.example",
      outcome: "Show how founders plan launches faster.",
      durationSec: 45,
      aspectRatio: "16:9",
      brandId: "brand_1",
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      mode: "saas_explainer",
      status: "draft_ready",
      autoEditMode: "saas_explainer",
      autoEditStatus: "needs_generation",
      projectId: "project_1",
      projectUrl: "/dashboard/editron/project/project_1",
      sceneCount: 4,
      overlayCount: 2,
      generationReadiness: {
        ok: false,
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "empty_voiceover" }),
          expect.objectContaining({ code: "weak_generated_scene_proof" }),
        ]),
      },
      voiceover: {
        requestedCount: 1,
        generatedCount: 0,
        status: "pending",
        profile: expect.objectContaining({ voiceId: "kokoro-michael", contentType: "narration" }),
      },
      brandContext: expect.objectContaining({
        source: "brand_vault",
        acceptedProfile: true,
        promptContextProvided: true,
      }),
    });
    expect(payload.warnings?.[0]).toContain("Draft ready");
    expect(payload.sourceSessionId).toMatch(/^saas_/);
    expect(payload.sourceScriptId).toMatch(/^script_saas_/);
    expect(mocks.generateScript).toHaveBeenCalledTimes(1);
    expect(mocks.resolveSaasExplainerBrandContext).toHaveBeenCalledWith({
      userId: "user_1",
      orgId: "org_1",
      brandId: "brand_1",
    });
    const scriptInput = mocks.generateScript.mock.calls[0][0];
    expect(scriptInput.context.projectSummary).toContain("Brand: Insturix");
    expect(scriptInput.context.systemBrief).toContain("Primary color: #0B0B0A");
    expect(mocks.parseScriptWithLLM).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      aspectRatio: "16:9",
      brandId: "brand_1",
      userId: "user_1",
    }));
    const overlayInput = mocks.buildSaasGeneratedSceneOverlays.mock.calls[0][0];
    expect(overlayInput.scenes).toHaveLength(4);
    expect(overlayInput.scenes.map((scene: any) => scene.title)).toEqual([
      "Hook",
      "Problem",
      "Workflow demo",
      "CTA",
    ]);
    expect(mocks.deductCredits).toHaveBeenCalledWith(
      "user_1",
      "pipeline",
      "script_import",
      expect.objectContaining({ quantity: 1 }),
    );
    expect(mocks.createProject).toHaveBeenCalledWith("user_1", "Insturix SaaS Explainer", expect.objectContaining({
      brandId: "brand_1",
    }));
    expect(mocks.saveProject).toHaveBeenCalledWith("user_1", "project_1", expect.objectContaining({
      overlays: visibleGeneratedSceneDraftOverlays,
      durationInFrames: 180,
    }));
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { userId: "user_1", projectId: "project_1" },
      { $set: expect.objectContaining({
        autoEditMode: "saas_explainer",
        autoEditStatus: "needs_generation",
        autoEditStartedAt: expect.any(Date),
        autoEditDraftedAt: expect.any(Date),
        generationReadiness: expect.objectContaining({ ok: false }),
        saasExplainer: expect.objectContaining({
          status: "draft_ready",
          brandContext: expect.objectContaining({ source: "brand_vault" }),
          voiceover: expect.objectContaining({ status: "pending", requestedCount: 1 }),
        }),
      }) },
    );
    expect(JSON.stringify(payload)).not.toContain("PRIVATE SCRIPT");
  });

  it("generates real voiceover with a deterministic Brand Vault voice profile when TTS is configured", async () => {
    mocks.isTTSAvailable.mockReturnValueOnce(true);

    const { POST } = await import("@/app/api/services/editron/saas-explainer/generate/route");
    const response = await POST(request("/api/services/editron/saas-explainer/generate", {
      productName: "Insturix",
      productUrl: "https://insturix.example",
      outcome: "Show how founders plan launches faster.",
      durationSec: 45,
      aspectRatio: "16:9",
      brandId: "brand_1",
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      status: "draft_ready",
      autoEditStatus: "needs_generation",
      generationReadiness: {
        ok: false,
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "weak_generated_scene_proof" }),
        ]),
      },
      voiceover: {
        requestedCount: 1,
        generatedCount: 1,
        status: "ready",
        profile: expect.objectContaining({
          voiceId: "kokoro-michael",
          provider: "kokoro",
          providerVoiceId: "am_michael",
          contentType: "narration",
          evidence: expect.objectContaining({
            acceptedProfile: true,
            signalPaths: expect.arrayContaining(["voice.defaultFormality"]),
          }),
        }),
      },
    });
    expect(payload.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("Draft ready"),
    ]));
    expect(mocks.deductCredits).toHaveBeenNthCalledWith(
      1,
      "user_1",
      "pipeline",
      "script_import",
      expect.objectContaining({ quantity: 1 }),
    );
    expect(mocks.deductCredits).toHaveBeenNthCalledWith(
      2,
      "user_1",
      "pipeline",
      "voiceover_generation",
      expect.objectContaining({ characterCount: 41, requestType: "kokoro" }),
    );
    expect(mocks.generateVoiceover).toHaveBeenCalledWith(
      "This is only a reserved narration slot...",
      "user_1",
      expect.objectContaining({ voice: "kokoro-michael", contentType: "narration" }),
    );

    const savedOverlays = mocks.saveProject.mock.calls[0][2].overlays;
    expect(savedOverlays).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "sound",
        src: "https://cdn.example.com/generated-brand-voice.wav",
        assetId: "voiceover_brand_1",
        metadata: expect.objectContaining({
          status: "ready",
          audioAssetId: "voiceover_brand_1",
          tts: expect.objectContaining({ voiceId: "kokoro-michael" }),
        }),
      }),
      expect.objectContaining({
        type: "generated-scene",
        sceneModel: expect.objectContaining({
          voiceover: expect.objectContaining({
            status: "ready",
            audioUrl: "https://cdn.example.com/generated-brand-voice.wav",
            resolvedVoice: expect.objectContaining({ voiceId: "kokoro-michael" }),
          }),
        }),
      }),
    ]));
  });

  it("retries a transient voiceover failure while keeping weak visuals in draft", async () => {
    mocks.isTTSAvailable.mockReturnValueOnce(true);
    mocks.generateVoiceover.mockRejectedValueOnce(new Error("temporary Deepgram 503"));

    const { POST } = await import("@/app/api/services/editron/saas-explainer/generate/route");
    const response = await POST(request("/api/services/editron/saas-explainer/generate", {
      productName: "Insturix",
      productUrl: "https://insturix.example",
      outcome: "Show how founders plan launches faster.",
      durationSec: 45,
      aspectRatio: "16:9",
      brandId: "brand_1",
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      status: "draft_ready",
      autoEditStatus: "needs_generation",
      generationReadiness: {
        ok: false,
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "weak_generated_scene_proof" }),
        ]),
      },
      voiceover: {
        requestedCount: 1,
        generatedCount: 1,
        status: "ready",
      },
    });
    expect(payload.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("Draft ready"),
    ]));
    expect(mocks.generateVoiceover).toHaveBeenCalledTimes(2);
    const savedOverlays = mocks.saveProject.mock.calls[0][2].overlays;
    expect(savedOverlays.find((overlay: any) => overlay.type === "sound")).toEqual(expect.objectContaining({
      src: "https://cdn.example.com/generated-brand-voice.wav",
      metadata: expect.objectContaining({
        status: "ready",
        audioAssetId: "voiceover_brand_1",
      }),
    }));
  });

  it("refunds SaaS voiceover credits when TTS produces no usable audio", async () => {
    mocks.isTTSAvailable.mockReturnValueOnce(true);
    mocks.generateVoiceover.mockRejectedValue(new Error("provider returned no audio"));

    const { POST } = await import("@/app/api/services/editron/saas-explainer/generate/route");
    const response = await POST(request("/api/services/editron/saas-explainer/generate", {
      productName: "Insturix",
      productUrl: "https://insturix.example",
      outcome: "Show how founders plan launches faster.",
      durationSec: 45,
      aspectRatio: "16:9",
      brandId: "brand_1",
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.voiceover).toMatchObject({
      requestedCount: 1,
      generatedCount: 0,
      status: "pending",
    });
    expect(payload.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("Voiceover generation failed for scene 0"),
    ]));
    expect(mocks.generateVoiceover).toHaveBeenCalledTimes(2);
    expect(mocks.refundCredits).toHaveBeenCalledWith(
      "user_1",
      0.12,
      "SaaS explainer voiceover generation failed before producing usable audio.",
      { service: "pipeline", action: "voiceover_generation" },
    );
  });
  it("surfaces missing accepted Brand Vault context instead of pretending it was used", async () => {
    mocks.resolveSaasExplainerBrandContext.mockResolvedValueOnce({
      promptBlock: "",
      brandInputs: {},
      defaults: {
        brief: { productServices: [], audience: [], valueDrivers: [], painPoints: [], jobsToBeDone: [] },
        visual: { colors: [], fonts: [], logoAssets: [], productImages: [], signalPaths: [] },
        motion: { signalPaths: [] },
      },
      missingInputs: ["accepted_brand_vault_profile"],
      metadata: {
        source: "none",
        brandId: "brand_1",
        acceptedProfile: false,
        promptContextProvided: false,
        brandInputKeys: [],
        missingInputs: ["accepted_brand_vault_profile"],
      },
    });

    const { POST } = await import("@/app/api/services/editron/saas-explainer/generate/route");
    const response = await POST(request("/api/services/editron/saas-explainer/generate", {
      brandId: "brand_1",
      durationSec: 45,
      aspectRatio: "16:9",
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.brandContext).toMatchObject({
      source: "none",
      acceptedProfile: false,
      missingInputs: ["accepted_brand_vault_profile"],
    });
    expect(payload.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("Brand Vault context is missing"),
    ]));
    const scriptInput = mocks.generateScript.mock.calls[0][0];
    expect(scriptInput.context.systemBrief).not.toContain("<saas_explainer_brand_vault_context>");
  });

  it("marks generated-scene output complete only after readiness passes", async () => {
    mocks.buildSaasGeneratedSceneOverlays.mockImplementationOnce(() => cloneOverlays(completeGeneratedSceneOverlays));

    const { POST } = await import("@/app/api/services/editron/saas-explainer/generate/route");
    const response = await POST(request("/api/services/editron/saas-explainer/generate", {
      productName: "Insturix",
      outcome: "Show how founders plan launches faster.",
      durationSec: 45,
      aspectRatio: "16:9",
      brandId: "brand_1",
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      status: "project_ready",
      autoEditStatus: "complete",
      overlayCount: 2,
      generationReadiness: { ok: true, issues: [] },
    });
    expect(payload.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("No public product URL"),
      expect.stringContaining("No exact numeric proof claim"),
      expect.stringContaining("No verified customer/logo/testimonial evidence"),
    ]));
    expect(payload.warnings).not.toEqual(expect.arrayContaining([
      expect.stringContaining("Draft ready"),
    ]));
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { userId: "user_1", projectId: "project_1" },
      { $set: expect.objectContaining({
        autoEditStatus: "complete",
        autoEditCompletedAt: expect.any(Date),
        generationReadiness: { ok: true, issues: [] },
        saasExplainer: expect.objectContaining({ status: "project_ready" }),
      }) },
    );
  });

  it("blocks prompt-like visible generated-scene text from completing", async () => {
    mocks.buildSaasGeneratedSceneOverlays.mockImplementationOnce(() => cloneOverlays(promptLeakGeneratedSceneOverlays));

    const { POST } = await import("@/app/api/services/editron/saas-explainer/generate/route");
    const response = await POST(request("/api/services/editron/saas-explainer/generate", {
      productName: "Insturix",
      outcome: "Show how founders plan launches faster.",
      durationSec: 45,
      aspectRatio: "16:9",
      brandId: "brand_1",
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      status: "draft_ready",
      autoEditStatus: "needs_generation",
      generationReadiness: {
        ok: false,
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "prompt_like_visible_text" }),
          expect.objectContaining({ code: "generated_scene_contract_invalid" }),
        ]),
      },
    });
  });

  it("persists accepted SaaS reference evidence on the created Editron project", async () => {
    mocks.analyzeSaasExplainerReference.mockResolvedValueOnce({
      ok: true,
      editDNA: { profileId: "style_saas_ref" },
      analysis: acceptedReferenceAnalysis,
    });

    const { POST } = await import("@/app/api/services/editron/saas-explainer/generate/route");
    const response = await POST(request("/api/services/editron/saas-explainer/generate", {
      productName: "Insturix",
      outcome: "Show the SaaS workflow and CTA.",
      referenceVideoUrl: "https://cdn.example.com/reference-demo.mp4",
      durationSec: 60,
      aspectRatio: "16:9",
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.referenceVideoAnalysis).toMatchObject({ status: "accepted", confidence: 0.93 });
    expect(mocks.analyzeSaasExplainerReference).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user_1",
      referenceType: "remote-url",
    }));
    expect(mocks.analyzeSaasExplainerReference.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.generateScript.mock.invocationCallOrder[0],
    );
    const scriptInput = mocks.generateScript.mock.calls[0][0];
    expect(scriptInput.userPrompt).toContain("Reference style evidence (directional only)");
    expect(scriptInput.userPrompt).toContain("balanced UI density");
    expect(scriptInput.context.projectSummary).toContain("Reference style evidence (directional only)");
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { userId: "user_1", projectId: "project_1" },
      { $set: expect.objectContaining({
        referenceEditDNA: { profileId: "style_saas_ref" },
        referenceVideoAnalysis: acceptedReferenceAnalysis,
      }) },
    );
  });

  it("rejects a non-SaaS reference before charging credits or creating a project", async () => {
    mocks.analyzeSaasExplainerReference.mockResolvedValueOnce({
      ok: false,
      status: 422,
      code: "reference_not_saas",
      error: "Reference video does not look like a SaaS explainer/demo.",
      details: ["No product UI evidence."],
    });

    const { POST } = await import("@/app/api/services/editron/saas-explainer/generate/route");
    const response = await POST(request("/api/services/editron/saas-explainer/generate", {
      outcome: "Create a SaaS explainer from this product brief.",
      referenceVideoUrl: "https://cdn.example.com/reference-demo.mp4",
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.code).toBe("reference_not_saas");
    expect(mocks.generateScript).not.toHaveBeenCalled();
    expect(mocks.parseScriptWithLLM).not.toHaveBeenCalled();
    expect(mocks.deductCredits).not.toHaveBeenCalled();
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it("fails loudly when the scene parser model is not configured", async () => {
    mocks.isLLMParserAvailable.mockReturnValue(false);
    const { POST } = await import("@/app/api/services/editron/saas-explainer/generate/route");
    const response = await POST(request("/api/services/editron/saas-explainer/generate", {
      outcome: "Create a SaaS explainer from this product brief.",
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.code).toBe("scene_parser_unavailable");
    expect(mocks.createProject).not.toHaveBeenCalled();
  });
});
