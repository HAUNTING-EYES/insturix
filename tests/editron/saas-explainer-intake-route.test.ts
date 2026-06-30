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
  updateOne: vi.fn(),
  createProjectLink: vi.fn(),
  analyzeSaasExplainerReference: vi.fn(),
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
vi.mock("@/lib/services/creditsService", () => ({
  CreditsService: { deductCredits: mocks.deductCredits },
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

function request(path: string, body: Record<string, unknown>): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
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

describe("SaaS explainer routes", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.auth.mockResolvedValue({ userId: "user_1" });
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
    mocks.scenesToOverlays.mockReturnValue([{ id: 1 }, { id: 2 }]);
    mocks.scenesToTotalFrames.mockReturnValue(180);
    mocks.updateOne.mockResolvedValue({ acknowledged: true });
    mocks.createProjectLink.mockResolvedValue(undefined);
  });

  it("rejects empty upload-first intake with no creative source", async () => {
    const { POST } = await import("@/app/api/services/editron/saas-explainer/intake/route");
    const response = await POST(request("/api/services/editron/saas-explainer/intake", {}) as never);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.code).toBe("empty_saas_explainer_source");
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

  it("creates an Editron project from the SaaS brief without a main footage upload", async () => {
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
      status: "project_ready",
      autoEditMode: "saas_explainer",
      autoEditStatus: "complete",
      projectId: "project_1",
      projectUrl: "/dashboard/editron?project=project_1",
      sceneCount: 1,
      overlayCount: 2,
    });
    expect(payload.sourceSessionId).toMatch(/^saas_/);
    expect(payload.sourceScriptId).toMatch(/^script_saas_/);
    expect(mocks.generateScript).toHaveBeenCalledTimes(1);
    expect(mocks.parseScriptWithLLM).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      aspectRatio: "16:9",
      brandId: "brand_1",
      userId: "user_1",
    }));
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
      overlays: [{ id: 1 }, { id: 2 }],
      durationInFrames: 180,
    }));
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { userId: "user_1", projectId: "project_1" },
      { $set: expect.objectContaining({
        autoEditMode: "saas_explainer",
        autoEditStatus: "complete",
        autoEditStartedAt: expect.any(Date),
        autoEditCompletedAt: expect.any(Date),
        saasExplainer: expect.objectContaining({ status: "complete" }),
      }) },
    );
    expect(JSON.stringify(payload)).not.toContain("PRIVATE SCRIPT");
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
