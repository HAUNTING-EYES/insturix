import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderVideo } from "@/components/editron/editor/version-7.0.0/lambda-helpers/api";
import {
  buildChapterRenderApiData,
  buildLambdaRenderInputProps,
  buildProjectRenderInputProps,
  resolveRenderableAudioInputProps,
  shouldHydrateRenderInputFromProject,
  UnlicensedAudioInRenderError,
} from "@/lib/editron/shared/render-request-payload";

const inputProps = {
  overlays: [
    {
      id: 1,
      type: "html-scene",
      content: "x".repeat(1_000_000),
      from: 0,
      durationInFrames: 90,
    },
  ],
  durationInFrames: 300,
  fps: 30,
  width: 1920,
  height: 1080,
  src: "",
} as any;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Editron render request payloads", () => {
  it("sends compact render props when projectId is available", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          type: "success",
          data: { renderId: "render_1", bucketName: "bucket", region: "us-east-1" },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await renderVideo({
      id: "TestComponent",
      inputProps,
      projectId: "proj_123",
    });

    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const requestBody = JSON.parse(String(firstCall[1]?.body));
    expect(requestBody.projectId).toBe("proj_123");
    expect(requestBody.inputProps.overlays).toEqual([]);
    expect(JSON.stringify(requestBody)).not.toContain("x".repeat(1000));
  });

  it("reports non-JSON HTTP failures without throwing a JSON parse error", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("Request Entity Too Large", {
        status: 413,
        statusText: "Content Too Large",
        headers: { "content-type": "text/plain" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      renderVideo({
        id: "TestComponent",
        inputProps,
      })
    ).rejects.toThrow(/413.*Request Entity Too Large/);
  });


  it("accepts chapter render success responses from the server", async () => {
    const data = buildChapterRenderApiData({
      jobId: "chr_123",
      region: "us-east-1",
      chapters: 3,
    });
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ type: "success", data }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      renderVideo({
        id: "TestComponent",
        inputProps,
        projectId: "proj_long",
      })
    ).resolves.toEqual(data);
  });
  it("builds chapter render success data in the client response contract", () => {
    expect(
      buildChapterRenderApiData({
        jobId: "chr_123",
        region: "us-east-1",
        chapters: 3,
      })
    ).toEqual({
      renderId: "chr_123",
      bucketName: "chapter-render",
      region: "us-east-1",
      isChapterRender: true,
      chapters: 3,
      message: "Split into 3 chapters for parallel rendering",
    });
  });

  it("hydrates compact render props from the project snapshot on the server side", () => {
    const compactInput = {
      ...inputProps,
      overlays: [],
      width: 1280,
      height: 720,
    };

    expect(shouldHydrateRenderInputFromProject(compactInput)).toBe(true);

    const hydrated = buildProjectRenderInputProps(
      {
        overlays: inputProps.overlays,
        durationInFrames: 900,
        fps: 24,
        playerDimensions: { width: 1080, height: 1920 },
      },
      compactInput
    );

    expect(hydrated.overlays).toHaveLength(1);
    expect(hydrated.durationInFrames).toBe(900);
    expect(hydrated.fps).toBe(24);
    expect(hydrated.width).toBe(1080);
    expect(hydrated.height).toBe(1920);
  });

  it("CRITICAL: throws before unresolved preview audio reaches Lambda", () => {
    const build = () => buildLambdaRenderInputProps({
      overlays: [{
        id: 77,
        type: "sound",
        row: 1,
        src: "https://preview.example/track.mp3",
        musicRights: {
          source: "preview-only",
          userChoice: "attested",
          licensed: false,
        },
      }],
    });

    expect(build).toThrow(UnlicensedAudioInRenderError);
    expect(build).toThrow(/Cannot render unlicensed audio overlay 77/);
  });

  it("rejects the bundled legacy preview URL regardless of its old timeline row", () => {
    expect(() => buildLambdaRenderInputProps({
      overlays: [{
        id: 752284,
        type: "sound",
        row: 4,
        src: "https://rwxrdxvxndclnqvznxfj.supabase.co/storage/v1/object/public/sounds/sound-1.mp3",
      }],
    })).toThrowError(expect.objectContaining({
      code: "UNLICENSED_AUDIO_IN_RENDER",
      overlayId: 752284,
    }));
  });

  it("rejects canonical background music without a durable rights receipt", () => {
    expect(() => buildLambdaRenderInputProps({
      overlays: [{
        id: 78,
        type: "sound",
        row: 1,
        assetId: "legacy_music",
        src: "https://cdn.example/legacy-music.mp3",
      }],
    })).toThrowError(/background music has no durable rights receipt/);
  });

  it("rejects evidence-free licensed audio and preview provenance relabeling", () => {
    for (const source of ["library", "generated", "preview-only"] as const) {
      expect(() => buildLambdaRenderInputProps({
        overlays: [{
          id: `evidence-free-${source}`,
          type: "sound",
          row: 1,
          src: "https://preview.example/track.mp3",
          musicRights: {
            source,
            userChoice: "attested",
            licensed: true,
          },
        }],
      })).toThrow(UnlicensedAudioInRenderError);
    }

    expect(() => buildLambdaRenderInputProps({
      overlays: [{
        id: "relabelled-stock-preview",
        type: "sound",
        row: 1,
        src: "https://rwxrdxvxndclnqvznxfj.supabase.co/storage/v1/object/public/sounds/sound-1.mp3",
        musicRights: {
          source: "generated",
          userChoice: "attested",
          licensed: true,
          evidence: {
            kind: "generated-provider",
            sourceAssetId: "forged-generated-asset",
            licenseId: "provider:commercial-use",
          },
        },
      }],
    })).toThrowError(/contradicts declared generated provenance/);
  });

  it.each([
    {
      userChoice: "no-music",
      code: "PREVIEW_AUDIO_REMOVED_NO_MUSIC",
    },
    {
      userChoice: "swap",
      code: "PREVIEW_AUDIO_REMOVED_NO_CLEARED_SWAP",
    },
  ] as const)("strips preview audio resolved as $userChoice and records $code", ({
    userChoice,
    code,
  }) => {
    const renderable = resolveRenderableAudioInputProps({
      overlays: [
        {
          id: 88,
          type: "sound",
          row: 1,
          src: "https://preview.example/track.mp3",
          musicRights: {
            source: "preview-only",
            userChoice,
            licensed: false,
          },
        },
        { id: 89, type: "sound", row: 3, src: "https://voice.example/vo.mp3" },
      ],
    });

    expect(renderable.overlays).toEqual([
      { id: 89, type: "sound", row: 3, src: "https://voice.example/vo.mp3" },
    ]);
    expect(renderable.audioRightsNotices).toEqual([{
      code,
      overlayId: 88,
      action: "stripped",
      source: "preview-only",
    }]);
  });

  it("keeps affirmatively attested preview audio and unrelated sound overlays", () => {
    const overlays = [
      {
        id: 91,
        type: "sound",
        row: 1,
        src: "https://preview.example/track.mp3",
        musicRights: {
          source: "preview-only",
          userChoice: "attested",
          licensed: true,
          evidence: {
            kind: "user-attestation",
            sourceAssetId: "preview-track-91",
            attestationVersion: "music-rights-attestation-v1",
            attestedAt: "2026-07-25T12:00:00.000Z",
            attestedBy: "user-91",
          },
        },
      },
      { id: 92, type: "sound", row: 3, src: "https://voice.example/vo.mp3" },
    ];

    expect(buildLambdaRenderInputProps({ overlays }).overlays).toEqual(overlays);
  });

  it("rejects malformed or explicitly unlicensed non-preview rights", () => {
    expect(() => buildLambdaRenderInputProps({
      overlays: [{ id: 93, type: "sound", musicRights: { licensed: true } }],
    })).toThrow(UnlicensedAudioInRenderError);

    expect(() => buildLambdaRenderInputProps({
      overlays: [{
        id: 94,
        type: "sound",
        musicRights: {
          source: "generated",
          userChoice: "attested",
          licensed: false,
        },
      }],
    })).toThrow(UnlicensedAudioInRenderError);
  });

  it("enforces audio rights before cloud asset hydration and credit deduction", () => {
    const routeSource = readFileSync(
      "app/api/services/editron/cloudrun/render/route.ts",
      "utf8"
    );
    const chapterSource = readFileSync(
      "lib/editron/services/chapter-renderer.ts",
      "utf8"
    );
    const gateIndex = routeSource.indexOf(
      "resolveRenderableAudioInputProps(resolvedProps)"
    );
    const hydrationIndex = routeSource.indexOf(
      "assetResolver.resolveProjectAssets(resolvedProps.overlays)"
    );
    const creditIndex = routeSource.indexOf("checkCredits(userId");

    expect(gateIndex).toBeGreaterThan(-1);
    expect(gateIndex).toBeLessThan(hydrationIndex);
    expect(gateIndex).toBeLessThan(creditIndex);
    expect(
      chapterSource.match(/buildLambdaRenderInputProps\(/g)
    ).toHaveLength(2);
    expect(chapterSource.indexOf("buildLambdaRenderInputProps("))
      .toBeLessThan(chapterSource.indexOf("renderMediaOnLambda({"));
  });

  it("keeps render-owned overlay metadata while stripping audit freight before Lambda", () => {
    const compact = buildLambdaRenderInputProps({
      overlays: [
        {
          id: 1,
          type: "caption",
          from: 0,
          durationInFrames: 90,
          content: "hello",
          metadata: {
            atomicOverlayForm: { version: "overlay-atomic-form-v1" },
            atomicOverlayReceipt: { form: { version: "overlay-atomic-form-v1" } },
            nativeAudioEvidence: { hasNativeAudio: true, speechRegions: [] },
            atomicMomentBundle: { semanticAtoms: ["x".repeat(20_000)] },
            semanticMgCandidateLedger: { candidates: ["x".repeat(20_000)] },
            decisionAuthority: { candidates: ["x".repeat(20_000)] },
          },
        },
      ],
      durationInFrames: 90,
      fps: 30,
    } as any);

    const metadata = (compact.overlays?.[0] as any).metadata;
    expect(metadata).toEqual({
      atomicOverlayForm: { version: "overlay-atomic-form-v1" },
      atomicOverlayReceipt: { form: { version: "overlay-atomic-form-v1" } },
      nativeAudioEvidence: { hasNativeAudio: true, speechRegions: [] },
    });
    expect(JSON.stringify(compact)).not.toContain("x".repeat(1000));
  });
});
