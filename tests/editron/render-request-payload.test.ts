import { afterEach, describe, expect, it, vi } from "vitest";

import { renderVideo } from "@/components/editron/editor/version-7.0.0/lambda-helpers/api";
import {
  buildChapterRenderApiData,
  buildProjectRenderInputProps,
  shouldHydrateRenderInputFromProject,
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
});
