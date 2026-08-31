import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getProgress,
  renderVideo,
} from "@/components/editron/editor/version-7.0.0/lambda-helpers/api";
import {
  RenderAudioRightsAuthorityError,
  verifyRenderAudioRightsAuthority,
} from "@/lib/editron/services/render-audio-rights-authority";
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

function generatedNativeVideoRights(assetId: string) {
  return {
    mediaRole: "native-video" as const,
    source: "generated" as const,
    userChoice: "attested" as const,
    licensed: true,
    evidence: {
      kind: "generated-provider" as const,
      sourceAssetId: assetId,
      licenseId: "fal-ai:seedance-v1.5-pro:service-output-terms",
    },
  };
}

function generatedNativeVideoReceipt(assetId: string) {
  return {
    version: "editron-generated-video-receipt-v1" as const,
    provider: "fal-ai" as const,
    model: "seedance-v1.5-pro",
    assetId,
    generatedAt: "2026-07-27T00:00:00.000Z",
    nativeAudio: {
      requestMode: "enabled" as const,
      present: true,
      probe: "ffmpeg-audio-stream-decode" as const,
      probedAt: "2026-07-27T00:00:00.000Z",
      licenseId: generatedNativeVideoRights(assetId).evidence.licenseId,
    },
  };
}

function generatedVoiceoverRights(assetId: string) {
  return {
    mediaRole: "voiceover" as const,
    source: "generated" as const,
    userChoice: "attested" as const,
    licensed: true,
    evidence: {
      kind: "generated-provider" as const,
      sourceAssetId: assetId,
      licenseId: "provider:voiceover-commercial-use",
    },
  };
}

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
      musicDeliveryMode: "platform-native",
    });

    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const requestBody = JSON.parse(String(firstCall[1]?.body));
    expect(requestBody.projectId).toBe("proj_123");
    expect(requestBody.musicDeliveryMode).toBe("platform-native");
    expect(requestBody.inputProps.overlays).toEqual([]);
    expect(JSON.stringify(requestBody)).not.toContain("x".repeat(1000));
  });

  it("retains the delivery manifest returned by progress polling", async () => {
    const deliveryManifest = {
      version: "editron-render-delivery-manifest-v1",
      mode: "platform-native",
      createdAt: "2026-07-26T00:00:00.000Z",
      completedAt: "2026-07-26T00:05:00.000Z",
      primaryArtifact: {
        kind: "clean-master",
        renderId: "render_1",
        status: "ready",
        url: "https://video.example/clean-master.mp4",
      },
      music: {
        embedded: false,
        removedOverlayIds: ["music_1"],
        handoff: {
          version: "editron-platform-native-music-handoff-v1",
          destinationPlatform: "instagram",
          attachmentOwner: "destination-platform",
          track: {
            status: "manual-selection-required",
            provider: null,
            providerTrackId: null,
            title: null,
            artists: [],
            sourceAssetId: null,
            usage: "reference-only",
          },
          timing: {
            timelineStartFrame: 0,
            timelineEndFrame: 300,
            timelineStartMs: 0,
            timelineEndMs: 10_000,
            timelineBeatEntryFrame: null,
            timelineBeatEntryMs: null,
            platformTrackSourceOffsetMs: null,
            cueStatus: "manual-cue-required",
          },
        },
      },
    };
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({
        type: "success",
        data: {
          done: true,
          outputFile: "https://video.example/clean-master.mp4",
          outputSize: 42,
          deliveryManifest,
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    ));

    await expect(getProgress({
      id: "render_1",
      bucketName: "bucket",
    })).resolves.toEqual({
      type: "done",
      url: "https://video.example/clean-master.mp4",
      size: 42,
      deliveryManifest,
    });
  });

  it("fails loudly when progress claims completion without an artifact", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({
        type: "success",
        data: { done: true, outputSize: 42 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    ));

    await expect(getProgress({
      id: "render_without_artifact",
      bucketName: "bucket",
    })).resolves.toEqual({
      type: "error",
      message: "Render completed without an output file",
    });
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

  it("CRITICAL: rejects embedded video audio without valid native-video rights", () => {
    expect(() => buildLambdaRenderInputProps({
      overlays: [{
        id: "native-video-missing-rights",
        type: "video",
        assetId: "video_native_missing",
        hasNativeAudio: true,
      }],
    })).toThrowError(/embedded native audio has no durable rights receipt/);

    expect(() => buildLambdaRenderInputProps({
      overlays: [{
        id: "native-video-wrong-role",
        type: "video",
        assetId: "video_native_wrong_role",
        hasNativeAudio: true,
        audioRights: {
          ...generatedNativeVideoRights("video_native_wrong_role"),
          mediaRole: "sfx",
        },
      }],
    })).toThrowError(/native video cannot use sfx rights evidence/);

    expect(() => buildLambdaRenderInputProps({
      overlays: [{
        id: "native-video-missing-probe",
        type: "video",
        assetId: "video_native_missing_probe",
        hasNativeAudio: true,
        audioRights: generatedNativeVideoRights("video_native_missing_probe"),
      }],
    })).toThrowError(/generated native audio requires a matching FFmpeg probe receipt/);
  });

  it("keeps licensed native video audio and strips its audit-only generation receipt before Lambda", () => {
    const rights = generatedNativeVideoRights("video_native_1");
    const compact = buildLambdaRenderInputProps({
      overlays: [{
        id: "native-video-licensed",
        type: "video",
        assetId: "video_native_1",
        hasNativeAudio: true,
        audioRights: rights,
        generatedVideoReceipt: generatedNativeVideoReceipt("video_native_1"),
      }, {
        id: "silent-video",
        type: "video",
        assetId: "video_silent",
        hasNativeAudio: false,
      }],
    });

    expect(compact.overlays).toEqual([
      {
        id: "native-video-licensed",
        type: "video",
        assetId: "video_native_1",
        hasNativeAudio: true,
        audioRights: rights,
      },
      {
        id: "silent-video",
        type: "video",
        assetId: "video_silent",
        hasNativeAudio: false,
      },
    ]);
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

  it("CRITICAL: rejects conflicting audio rights aliases before rendering", () => {
    const generatedRights = {
      mediaRole: "sfx" as const,
      source: "generated" as const,
      userChoice: "attested" as const,
      licensed: true,
      evidence: {
        kind: "generated-provider" as const,
        sourceAssetId: "sfx_render_asset",
        licenseId: "provider:render-asset",
      },
    };

    expect(() => buildLambdaRenderInputProps({
      overlays: [{
        id: "conflicting-rights",
        type: "sound",
        row: 0,
        assetId: "sfx_render_asset",
        audioRights: generatedRights,
        musicRights: {
          ...generatedRights,
          evidence: {
            ...generatedRights.evidence,
            sourceAssetId: "different_source_asset",
            licenseId: "provider:different-asset",
          },
        },
      }],
    })).toThrowError(/audioRights and musicRights conflict/);
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
    const voiceover = {
      id: 89,
      type: "sound",
      row: 3,
      assetId: "voiceover-89",
      src: "https://voice.example/vo.mp3",
      audioRights: generatedVoiceoverRights("voiceover-89"),
    };
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
        voiceover,
      ],
    });

    expect(renderable.overlays).toEqual([voiceover]);
    expect(renderable.audioRightsNotices).toEqual([{
      code,
      overlayId: 88,
      action: "stripped",
      source: "preview-only",
    }]);
  });

  it("keeps affirmatively attested preview audio and rights-backed voiceover", () => {
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
      {
        id: 92,
        type: "sound",
        row: 3,
        assetId: "voiceover-92",
        src: "https://voice.example/vo.mp3",
        audioRights: generatedVoiceoverRights("voiceover-92"),
      },
    ];

    expect(buildLambdaRenderInputProps({ overlays }).overlays).toEqual(overlays);
  });

  it("CRITICAL: rejects every sound overlay without durable audio rights", async () => {
    const overlays = [{
      id: "rights-less-voiceover",
      type: "sound",
      row: 3,
      assetId: "voiceover_missing_rights",
      src: "https://voice.example/missing-rights.mp3",
    }];

    expect(() => buildLambdaRenderInputProps({ overlays }))
      .toThrowError(/audio rights metadata is missing/);
    await expect(verifyRenderAudioRightsAuthority({
      userId: "user_1",
      projectId: "project_1",
      projectOwnerId: "user_1",
      overlays,
    }, {
      loadAssets: vi.fn(async () => []),
    })).rejects.toMatchObject({
      code: "AUDIO_RIGHTS_EVIDENCE_UNVERIFIED",
      diagnostic: {
        overlayId: "rights-less-voiceover",
        overlayType: "sound",
        mediaRole: "voiceover",
        renderAssetId: "voiceover_missing_rights",
        sourceAssetId: null,
        rightsReceipt: {
          state: "missing",
          aliases: "none",
          source: null,
          evidenceKind: null,
        },
        reason: "audio rights metadata is missing",
      },
    });
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
    const deliveryIndex = routeSource.indexOf(
      "resolveRenderDeliveryPlan({"
    );
    const gateIndex = routeSource.indexOf(
      "resolveRenderableAudioInputProps({"
    );
    const authorityIndex = routeSource.indexOf(
      "verifyRenderAudioRightsAuthority({"
    );
    const hydrationIndex = routeSource.indexOf(
      "assetResolver.resolveProjectAssets("
    );
    const projectScopeIndex = routeSource.indexOf(
      "{ projectId: canonicalProjectId }",
      hydrationIndex
    );
    const creditIndex = routeSource.indexOf("checkCredits(userId");

    expect(deliveryIndex).toBeGreaterThan(-1);
    expect(authorityIndex).toBeGreaterThan(-1);
    expect(gateIndex).toBeGreaterThan(-1);
    expect(projectScopeIndex).toBeGreaterThan(hydrationIndex);
    expect(deliveryIndex).toBeLessThan(authorityIndex);
    expect(authorityIndex).toBeLessThan(gateIndex);
    expect(gateIndex).toBeLessThan(hydrationIndex);
    expect(projectScopeIndex).toBeLessThan(creditIndex);
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

  it("requires the persisted project and verifies stored rights before credits or Lambda", () => {
    const routeSource = readFileSync(
      "app/api/services/editron/cloudrun/render/route.ts",
      "utf8"
    );
    const projectLoadIndex = routeSource.indexOf(
      "projectService.loadProject(userId, canonicalProjectId)"
    );
    const authorityIndex = routeSource.indexOf(
      "verifyRenderAudioRightsAuthority({"
    );
    const creditIndex = routeSource.indexOf("checkCredits(userId");
    const lambdaIndex = routeSource.indexOf("renderMediaOnLambda({");

    expect(routeSource).toContain("A persisted projectId is required for rendering");
    expect(routeSource).not.toContain("shouldHydrateRenderInputFromProject");
    expect(projectLoadIndex).toBeGreaterThan(-1);
    expect(authorityIndex).toBeGreaterThan(projectLoadIndex);
    expect(authorityIndex).toBeLessThan(creditIndex);
    expect(authorityIndex).toBeLessThan(lambdaIndex);
  });

  it("rejects a fabricated library receipt that has no matching stored authority", async () => {
    const forgedRights = {
      mediaRole: "music" as const,
      source: "library" as const,
      userChoice: "attested" as const,
      licensed: true,
      evidence: {
        kind: "library-license" as const,
        sourceAssetId: "library_source",
        licenseId: "forged-license",
      },
    };

    await expect(verifyRenderAudioRightsAuthority({
      userId: "user_1",
      projectId: "project_1",
      projectOwnerId: "user_1",
      overlays: [{
        id: "bgm_forged",
        type: "sound",
        row: 1,
        assetId: "bgm_derivative",
        musicRights: forgedRights,
      }],
    }, {
      loadAssets: async () => [{
        assetId: "bgm_derivative",
        userId: "user_1",
        projectId: "project_1",
        type: "audio",
        source: "generated",
        parentAssetId: "library_source",
        assignmentStatus: "attached",
        musicRights: {
          ...forgedRights,
          evidence: { ...forgedRights.evidence, licenseId: "real-license" },
        },
      }, {
        assetId: "library_source",
        userId: "user_1",
        projectId: "project_1",
        type: "audio",
        source: "library",
        musicRights: {
          ...forgedRights,
          evidence: { ...forgedRights.evidence, licenseId: "real-license" },
        },
      }],
    })).rejects.toBeInstanceOf(RenderAudioRightsAuthorityError);
  });

  it("CRITICAL: verifies SFX receipts against stored authority regardless of timeline row", async () => {
    const rights = {
      mediaRole: "sfx" as const,
      source: "generated" as const,
      userChoice: "attested" as const,
      licensed: true,
      evidence: {
        kind: "generated-provider" as const,
        sourceAssetId: "sfx_generated",
        licenseId: "provider:sfx-commercial-use",
      },
    };

    await expect(verifyRenderAudioRightsAuthority({
      userId: "user_1",
      projectId: "project_1",
      overlays: [{
        id: "sfx_forged",
        type: "sound",
        row: 0,
        assetId: "sfx_generated",
        audioRights: rights,
      }],
    }, {
      loadAssets: async () => [],
    })).rejects.toBeInstanceOf(RenderAudioRightsAuthorityError);
  });

  it("CRITICAL: verifies native-video receipts against matching stored video authority", async () => {
    const rights = generatedNativeVideoRights("video_native_authority");
    const overlay = {
      id: "native-video-authority",
      type: "video",
      assetId: "video_native_authority",
      hasNativeAudio: true,
      audioRights: rights,
      generatedVideoReceipt: generatedNativeVideoReceipt("video_native_authority"),
    };

    await expect(verifyRenderAudioRightsAuthority({
      userId: "user_1",
      projectId: "project_1",
      overlays: [overlay],
    }, {
      loadAssets: async () => [],
    })).rejects.toBeInstanceOf(RenderAudioRightsAuthorityError);

    const loadAssets = vi.fn(async () => [{
      assetId: "video_native_authority",
      userId: "user_1",
      projectId: "project_1",
      type: "video",
      source: "generated",
      audioRights: rights,
      generatedVideoReceipt: generatedNativeVideoReceipt("video_native_authority"),
    }]);
    await expect(verifyRenderAudioRightsAuthority({
      userId: "user_1",
      projectId: "project_1",
      overlays: [overlay],
    }, { loadAssets })).resolves.toBeUndefined();
    expect(loadAssets).toHaveBeenCalledWith(["video_native_authority"]);

    await expect(verifyRenderAudioRightsAuthority({
      userId: "user_1",
      projectId: "project_1",
      overlays: [overlay],
    }, {
      loadAssets: async () => [{
        assetId: "video_native_authority",
        userId: "user_1",
        projectId: "project_1",
        type: "video",
        source: "generated",
        audioRights: rights,
        generatedVideoReceipt: {
          ...generatedNativeVideoReceipt("video_native_authority"),
          generatedAt: "2026-07-27T01:00:00.000Z",
        },
      }],
    })).rejects.toThrowError(/stored generated-video receipt does not match the render claim/);

    await expect(verifyRenderAudioRightsAuthority({
      userId: "user_1",
      projectId: "project_1",
      overlays: [overlay],
    }, {
      loadAssets: async () => [{
        assetId: "video_native_authority",
        userId: "user_1",
        projectId: "project_1",
        type: "audio",
        source: "generated",
        audioRights: rights,
        generatedVideoReceipt: generatedNativeVideoReceipt("video_native_authority"),
      }],
    })).rejects.toThrowError(/stored rights evidence is not a video asset/);
  });

  it("verifies an EDL native-audio boundary clone against its source video authority", async () => {
    const assetId = "video_native_boundary";
    const rights = generatedNativeVideoRights(assetId);
    const receipt = generatedNativeVideoReceipt(assetId);
    const overlay = {
      id: "native-audio-boundary",
      type: "sound",
      row: 3,
      assetId,
      src: "https://video.example/native.mp4",
      audioRights: rights,
      generatedVideoReceipt: receipt,
      metadata: {
        source: "edl-native-audio-boundary",
        sourceClipId: "video-overlay-1",
        audioBoundaryKind: "j-cut",
      },
    };
    const storedVideo = {
      assetId,
      userId: "user_1",
      projectId: "project_1",
      type: "video",
      source: "generated",
      audioRights: rights,
      generatedVideoReceipt: receipt,
    };

    expect(() => buildLambdaRenderInputProps({ overlays: [overlay] })).not.toThrow();
    await expect(verifyRenderAudioRightsAuthority({
      userId: "user_1",
      projectId: "project_1",
      projectOwnerId: "user_1",
      overlays: [overlay],
    }, {
      loadAssets: async () => [storedVideo],
    })).resolves.toBeUndefined();

    await expect(verifyRenderAudioRightsAuthority({
      userId: "user_1",
      projectId: "project_1",
      projectOwnerId: "user_1",
      overlays: [{
        ...overlay,
        metadata: { source: "forged-native-audio-boundary" },
      }],
    }, {
      loadAssets: async () => [storedVideo],
    })).rejects.toThrowError(/sound overlay cannot use native-video rights evidence/);
  });

  it("CRITICAL: verifies a separated dubbing bed against its native-video source", async () => {
    const sourceRights = generatedNativeVideoRights("video_dubbing_source");
    const derivativeRights = {
      ...sourceRights,
      mediaRole: "other" as const,
    };
    const separationReceipt = {
      version: "editron-audio-separation-receipt-v1",
      provider: "fal-ai",
      model: "fal-ai/demucs:mdx_extra",
      operation: "preserve-non-vocal-background",
      stem: "other",
      sourceAssetId: "video_dubbing_source",
      derivativeAssetId: "dub_bed_authority",
      jobId: "chat_dub_authority",
      createdAt: "2026-07-27T00:00:00.000Z",
    };
    const overlay = {
      id: "dubbing-background-authority",
      type: "sound",
      row: 0,
      assetId: "dub_bed_authority",
      audioRights: derivativeRights,
      metadata: {
        isDubbingBackgroundStem: true,
        audioSeparationReceipt: separationReceipt,
      },
    };
    const storedStem = {
      assetId: "dub_bed_authority",
      userId: "user_1",
      projectId: "project_1",
      type: "audio",
      source: "generated",
      parentAssetId: "video_dubbing_source",
      assignmentStatus: "attached",
      audioRights: derivativeRights,
      audioSeparationReceipt: separationReceipt,
    };
    const storedSource = {
      assetId: "video_dubbing_source",
      userId: "user_1",
      projectId: "project_1",
      type: "video",
      source: "generated",
      audioRights: sourceRights,
      generatedVideoReceipt: generatedNativeVideoReceipt("video_dubbing_source"),
    };

    await expect(verifyRenderAudioRightsAuthority({
      userId: "user_1",
      projectId: "project_1",
      overlays: [overlay],
    }, {
      loadAssets: async () => [storedStem, storedSource],
    })).resolves.toBeUndefined();

    expect(() => resolveRenderableAudioInputProps({
      ...inputProps,
      overlays: [overlay],
    })).not.toThrow();

    await expect(verifyRenderAudioRightsAuthority({
      userId: "user_1",
      projectId: "project_1",
      overlays: [overlay],
    }, {
      loadAssets: async () => [{
        ...storedStem,
        audioSeparationReceipt: {
          ...separationReceipt,
          jobId: "forged-job",
        },
      }, storedSource],
    })).rejects.toThrowError(/stored audio-separation receipt does not match/);
  });

  it("finalize propagates measured native-audio evidence per generated video asset", () => {
    const finalizeSource = readFileSync(
      "app/api/services/pipeline/storyboard/[id]/finalize/route.ts",
      "utf8",
    );

    expect(finalizeSource).toContain("hasNativeAudio: sub.hasNativeAudio ?? false");
    expect(finalizeSource).toContain("audioRights: sub.nativeAudioRights");
    expect(finalizeSource).toContain("generatedVideoReceipt: sub.generatedVideoReceipt");
    expect(finalizeSource).toContain("hasNativeAudio: scene.hasNativeAudio ?? false");
    expect(finalizeSource).toContain("audioRights: scene.nativeAudioRights");
    expect(finalizeSource).toContain("generatedVideoReceipt: scene.generatedVideoReceipt");
    expect(finalizeSource).not.toContain("parentHasNativeAudio");
  });

  it("accepts a Freesound CC0 SFX only when its stored provider evidence matches", async () => {
    const rights = {
      mediaRole: "sfx" as const,
      source: "library" as const,
      userChoice: "attested" as const,
      licensed: true,
      evidence: {
        kind: "library-license" as const,
        sourceAssetId: "sfx_freesound_2",
        licenseId: "freesound:2:creative-commons-0",
      },
    };
    const loadAssets = vi.fn(async () => [{
      assetId: "sfx_freesound_2",
      userId: "user_1",
      type: "audio",
      source: "sfx-provider-freesound",
      sfxLibrarySource: "freesound",
      sfxProviderId: "2",
      audioRights: rights,
    }]);

    await expect(verifyRenderAudioRightsAuthority({
      userId: "user_1",
      projectId: "project_1",
      overlays: [{
        id: "sfx_cc0",
        type: "sound",
        row: 0,
        assetId: "sfx_freesound_2",
        audioRights: rights,
      }],
    }, { loadAssets })).resolves.toBeUndefined();
    expect(loadAssets).toHaveBeenCalledWith(["sfx_freesound_2"]);
  });

  it.each([
    {
      source: "generated",
      licenseId: "fal-ai:cassetteai/sound-effects-generator:commercial-use",
    },
    {
      source: "cassetteai",
      licenseId: "fal-ai:cassetteai/music-generator:commercial-use",
    },
  ])("accepts generated SFX from $source only when the stored provider matches $licenseId", async ({
    source,
    licenseId,
  }) => {
    const rights = {
      mediaRole: "sfx" as const,
      source: "generated" as const,
      userChoice: "attested" as const,
      licensed: true,
      evidence: {
        kind: "generated-provider" as const,
        sourceAssetId: "sfx_cassette",
        licenseId,
      },
    };

    await expect(verifyRenderAudioRightsAuthority({
      userId: "user_1",
      projectId: "project_1",
      overlays: [{
        id: "sfx_generated_chat",
        type: "sound",
        row: 0,
        assetId: "sfx_cassette",
        audioRights: rights,
      }],
    }, {
      loadAssets: async () => [{
        assetId: "sfx_cassette",
        userId: "user_1",
        type: "audio",
        source,
        audioRights: rights,
      }],
    })).resolves.toBeUndefined();
  });

  it("rejects generated SFX when the stored source is incompatible with its provider receipt", async () => {
    const rights = {
      mediaRole: "sfx" as const,
      source: "generated" as const,
      userChoice: "attested" as const,
      licensed: true,
      evidence: {
        kind: "generated-provider" as const,
        sourceAssetId: "sfx_wrong_source",
        licenseId: "fal-ai:cassetteai/sound-effects-generator:commercial-use",
      },
    };

    await expect(verifyRenderAudioRightsAuthority({
      userId: "user_1",
      projectId: "project_1",
      overlays: [{
        id: "sfx_wrong_source_overlay",
        type: "sound",
        row: 0,
        assetId: "sfx_wrong_source",
        audioRights: rights,
      }],
    }, {
      loadAssets: async () => [{
        assetId: "sfx_wrong_source",
        userId: "user_1",
        type: "audio",
        source: "user-upload",
        audioRights: rights,
      }],
    })).rejects.toBeInstanceOf(RenderAudioRightsAuthorityError);
  });

  it("accepts a conditioned library asset only with matching ownership and durable receipt", async () => {
    const rights = {
      mediaRole: "music" as const,
      source: "library" as const,
      userChoice: "attested" as const,
      licensed: true,
      evidence: {
        kind: "library-license" as const,
        sourceAssetId: "library_source",
        licenseId: "license_123",
      },
    };
    const loadAssets = vi.fn(async () => [{
      assetId: "bgm_derivative",
      userId: "user_1",
      projectId: "project_1",
      type: "audio",
      source: "generated",
      parentAssetId: "library_source",
      assignmentStatus: "attached",
      musicRights: rights,
    }, {
      assetId: "library_source",
      userId: "user_1",
      projectId: "project_1",
      type: "audio",
      source: "library",
      musicRights: rights,
      libraryLicenseReceipt: {
        version: "editron-library-license-receipt-v1",
        provider: "epidemic-sound",
        providerTrackId: "track_123",
        licenseId: "license_123",
        agreement: {
          reference: "agreement_123",
          configuredBy: "deployment-operator",
          authority: "NEVER_AUTOMATED",
        },
        ownership: {
          userId: "user_1",
          projectId: "project_1",
        },
        sourceObject: {
          sha256: "a".repeat(64),
          size: 2048,
        },
      },
    }]);

    await expect(verifyRenderAudioRightsAuthority({
      userId: "user_1",
      projectId: "project_1",
      projectOwnerId: "user_1",
      overlays: [
        {
          id: "bgm_section_1",
          type: "sound",
          row: 1,
          assetId: "bgm_derivative",
          musicRights: rights,
        },
        {
          id: "bgm_section_2",
          type: "sound",
          row: 1,
          assetId: "bgm_derivative",
          musicRights: rights,
        },
      ],
    }, { loadAssets })).resolves.toBeUndefined();
    expect(loadAssets).toHaveBeenCalledTimes(1);
    expect(loadAssets).toHaveBeenCalledWith([
      "bgm_derivative",
      "library_source",
    ]);
  });

  it("accepts stored generated music and conditioned user-upload attestations", async () => {
    const generatedRights = {
      mediaRole: "music" as const,
      source: "generated" as const,
      userChoice: "attested" as const,
      licensed: true,
      evidence: {
        kind: "generated-provider" as const,
        sourceAssetId: "bgm_generated",
        licenseId: "fal-provider-commercial-use",
      },
    };
    await expect(verifyRenderAudioRightsAuthority({
      userId: "user_1",
      projectId: "project_1",
      overlays: [{
        id: "generated_music",
        type: "sound",
        row: 1,
        assetId: "bgm_generated",
        musicRights: generatedRights,
      }],
    }, {
      loadAssets: async () => [{
        assetId: "bgm_generated",
        userId: "user_1",
        type: "audio",
        source: "generated",
        musicRights: generatedRights,
      }],
    })).resolves.toBeUndefined();

    const uploadRights = {
      mediaRole: "music" as const,
      source: "user-upload" as const,
      userChoice: "attested" as const,
      licensed: true,
      evidence: {
        kind: "user-attestation" as const,
        sourceAssetId: "upload_source",
        attestationVersion: "music-rights-attestation-v1" as const,
        attestedAt: "2026-07-26T00:00:00.000Z",
        attestedBy: "user_1",
      },
    };
    await expect(verifyRenderAudioRightsAuthority({
      userId: "user_1",
      projectId: "project_1",
      overlays: [{
        id: "uploaded_music",
        type: "sound",
        row: 1,
        assetId: "bgm_upload_derivative",
        musicRights: uploadRights,
      }],
    }, {
      loadAssets: async () => [{
        assetId: "bgm_upload_derivative",
        userId: "user_1",
        projectId: "project_1",
        type: "audio",
        source: "generated",
        parentAssetId: "upload_source",
        assignmentStatus: "attached",
        musicRights: uploadRights,
      }, {
        assetId: "upload_source",
        userId: "user_1",
        type: "audio",
        source: "user-upload",
      }],
    })).resolves.toBeUndefined();
  });

  it("does not query stored authority for preview music already resolved to removal", async () => {
    const loadAssets = vi.fn(async () => []);
    await expect(verifyRenderAudioRightsAuthority({
      userId: "user_1",
      projectId: "project_1",
      overlays: [{
        id: "preview_swap",
        type: "sound",
        row: 1,
        musicRights: {
          source: "preview-only",
          userChoice: "swap",
          licensed: false,
        },
      }],
    }, { loadAssets })).resolves.toBeUndefined();
    expect(loadAssets).not.toHaveBeenCalled();
  });
});
