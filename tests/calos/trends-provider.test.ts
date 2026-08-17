import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PLANNER_MODEL } from "@/lib/calos/planner";
import { getTrendsProvider } from "@/lib/calos/trends";
import { AgentReachTrendsProvider } from "@/lib/calos/trends/agent-reach";
import { ApifyTrendsProvider } from "@/lib/calos/trends/apify";
import { GeminiTrendsProvider } from "@/lib/calos/trends/gemini";
import { PerplexityTrendsProvider } from "@/lib/calos/trends/perplexity";

type FetchMockArgs = [input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]];

function expectAbortedSignal(signal: AbortSignal | null): void {
  expect(signal).not.toBeNull();
  if (!signal) throw new Error("Expected the provider to receive an AbortSignal.");
  expect(signal.aborted).toBe(true);
}

const providerMocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
  getGenerativeModel: vi.fn(),
  recordProviderCostEvent: vi.fn(async () => undefined),
}));

vi.mock("@/lib/financials/provider-cost-events", () => ({
  recordProviderCostEvent: providerMocks.recordProviderCostEvent,
}));

vi.mock("@/lib/editron/utils/gemini-model-factory", () => ({
  getGenAI: vi.fn(async () => ({
    getGenerativeModel: providerMocks.getGenerativeModel,
  })),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  providerMocks.generateContent.mockReset();
  providerMocks.getGenerativeModel.mockReset();
  providerMocks.recordProviderCostEvent.mockClear();
});

describe("CalOS trend provider selection", () => {
  it("prefers Perplexity Sonar when a Perplexity key is configured", () => {
    vi.stubEnv("PERPLEXITY_API_KEY", "pplx-test-key");
    vi.stubEnv("GEMINI_API_KEY", "gemini-test-key");
    vi.stubEnv("CALOS_TRENDS_PROVIDER", "");

    expect(getTrendsProvider().name).toBe("perplexity-sonar");
  });

  it("honors an explicit Gemini trends provider override", () => {
    vi.stubEnv("PERPLEXITY_API_KEY", "pplx-test-key");
    vi.stubEnv("GEMINI_API_KEY", "gemini-test-key");
    vi.stubEnv("CALOS_TRENDS_PROVIDER", "gemini");

    expect(getTrendsProvider().name).toBe("gemini");
  });
});

describe("PerplexityTrendsProvider", () => {
  it("sends a Sonar web-search request and parses trend JSON", async () => {
    const fetchMock = vi.fn<FetchMockArgs, ReturnType<typeof fetch>>(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '{"trends":[{"title":"Founder-led teardown posts","summary":"Operators are reacting to short teardown posts this week.","platform":"linkedin","url":"https://example.com/trend"}]}',
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const provider = new PerplexityTrendsProvider({
      apiKey: "pplx-test-key",
      baseUrl: "https://api.perplexity.ai",
      model: "sonar",
      timeoutMs: 1_000,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const trends = await provider.getTrends({
      niche: "B2B SaaS founders",
      platforms: [],
      location: "United States",
      limit: 3,
    });

    expect(trends).toEqual([
      {
        title: "Founder-led teardown posts",
        summary: "Operators are reacting to short teardown posts this week.",
        platform: "linkedin",
        url: "https://example.com/trend",
      },
    ]);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.perplexity.ai/chat/completions");
    expect(init?.headers).toMatchObject({
      authorization: "Bearer pplx-test-key",
      "content-type": "application/json",
    });
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      model: "sonar",
      temperature: 0,
      web_search_options: { search_context_size: "low" },
      response_format: {
        type: "json_schema",
        json_schema: { name: "CalosTrendCandidates" },
      },
    });
    expect(body.response_format.json_schema.schema).toMatchObject({
      type: "object",
      required: ["trends"],
      additionalProperties: false,
      properties: {
        trends: {
          type: "array",
          maxItems: 25,
          items: {
            type: "object",
            required: ["title", "summary", "platform", "url"],
            additionalProperties: false,
          },
        },
      },
    });
    expect(body.messages[1].content).toContain("<niche>B2B SaaS founders</niche>");
    expect(body.messages[1].content).toContain("<region>United States</region>");
    expect(body.messages[1].content).toContain(
      "platform must be one of: reddit, twitter, youtube, tiktok, linkedin, instagram, web",
    );
  });

  it("keeps a valid empty structured result distinct from a malformed success payload", async () => {
    const emptyFetch = vi.fn<FetchMockArgs, ReturnType<typeof fetch>>(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: '{"trends":[]}' } }] }), { status: 200 }),
    );
    const emptyProvider = new PerplexityTrendsProvider({
      apiKey: "pplx-test-key",
      fetchImpl: emptyFetch as unknown as typeof fetch,
    });
    await expect(emptyProvider.getTrends({ niche: "creator tools" })).resolves.toEqual([]);

    const malformedFetch = vi.fn<FetchMockArgs, ReturnType<typeof fetch>>(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "Here are five trends" } }] }), { status: 200 }),
    );
    const malformedProvider = new PerplexityTrendsProvider({
      apiKey: "pplx-test-key",
      fetchImpl: malformedFetch as unknown as typeof fetch,
    });
    await expect(malformedProvider.getTrends({ niche: "creator tools" })).rejects.toThrow(
      "did not contain JSON",
    );
  });

  it("aborts its in-flight fetch with the caller reason", async () => {
    let providerSignal: AbortSignal | null = null;
    const fetchMock = vi.fn<FetchMockArgs, ReturnType<typeof fetch>>((_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        providerSignal = init?.signal as AbortSignal;
        const rejectOnAbort = () => reject(providerSignal?.reason);
        if (providerSignal.aborted) rejectOnAbort();
        else providerSignal.addEventListener("abort", rejectOnAbort, { once: true });
      }),
    );
    const provider = new PerplexityTrendsProvider({
      apiKey: "pplx-test-key",
      timeoutMs: 1_000,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const controller = new AbortController();
    const abortReason = new DOMException("caller disconnected", "AbortError");

    const operation = provider.getTrends({ niche: "creator tools", abortSignal: controller.signal });
    await vi.waitFor(() => expect(providerSignal).not.toBeNull());
    controller.abort(abortReason);

    await expect(operation).rejects.toBe(abortReason);
    expectAbortedSignal(providerSignal);
  });

  it("keeps provider timeout distinct from caller cancellation", async () => {
    const fetchMock = vi.fn<FetchMockArgs, ReturnType<typeof fetch>>((_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal;
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
    );
    const provider = new PerplexityTrendsProvider({
      apiKey: "pplx-test-key",
      timeoutMs: 5,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(provider.getTrends({ niche: "creator tools" })).rejects.toThrow(
      "Perplexity trends request timed out.",
    );
  });
});

describe("trend provider cancellation", () => {
  it("passes caller cancellation into Apify fetch", async () => {
    vi.stubEnv("APIFY_TOKEN", "apify-test-token");
    vi.stubEnv("APIFY_TRENDS_ACTOR", "fixture-actor");
    let providerSignal: AbortSignal | null = null;
    vi.stubGlobal("fetch", vi.fn<FetchMockArgs, ReturnType<typeof fetch>>((_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        providerSignal = init?.signal as AbortSignal;
        providerSignal.addEventListener("abort", () => reject(providerSignal?.reason), { once: true });
      }),
    ));
    const controller = new AbortController();
    const abortReason = new DOMException("cancel Apify", "AbortError");
    const operation = new ApifyTrendsProvider().getTrends({
      niche: "creator tools",
      abortSignal: controller.signal,
    });

    await vi.waitFor(() => expect(providerSignal).not.toBeNull());
    controller.abort(abortReason);

    await expect(operation).rejects.toBe(abortReason);
    expectAbortedSignal(providerSignal);
  });

  it("passes caller cancellation directly into Agent Reach fetch", async () => {
    vi.stubEnv("AGENT_REACH_URL", "https://agent-reach.test");
    let providerSignal: AbortSignal | null = null;
    vi.stubGlobal("fetch", vi.fn<FetchMockArgs, ReturnType<typeof fetch>>((_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        providerSignal = init?.signal as AbortSignal;
        providerSignal.addEventListener("abort", () => reject(providerSignal?.reason), { once: true });
      }),
    ));
    const controller = new AbortController();
    const abortReason = new DOMException("cancel Agent Reach", "AbortError");
    const operation = new AgentReachTrendsProvider().getTrends({
      niche: "creator tools",
      abortSignal: controller.signal,
    });

    await vi.waitFor(() => expect(providerSignal).toBe(controller.signal));
    controller.abort(abortReason);

    await expect(operation).rejects.toBe(abortReason);
  });

  it("passes caller cancellation into Gemini request options", async () => {
    vi.stubEnv("GEMINI_API_KEY", "gemini-test-key");
    let providerSignal: AbortSignal | null = null;
    providerMocks.generateContent.mockImplementation((_prompt, options) =>
      new Promise((_resolve, reject) => {
        providerSignal = options?.signal as AbortSignal;
        providerSignal.addEventListener("abort", () => reject(providerSignal?.reason), { once: true });
      }),
    );
    providerMocks.getGenerativeModel.mockReturnValue({
      generateContent: providerMocks.generateContent,
    });
    const controller = new AbortController();
    const abortReason = new DOMException("cancel Gemini", "AbortError");
    const operation = new GeminiTrendsProvider().getTrends({
      niche: "creator tools",
      abortSignal: controller.signal,
    });

    await vi.waitFor(() => expect(providerSignal).toBe(controller.signal));
    controller.abort(abortReason);

    await expect(operation).rejects.toBe(abortReason);
  });

  it("does not let the composite provider swallow caller cancellation", async () => {
    vi.stubEnv("CALOS_TRENDS_PROVIDER", "composite");
    vi.stubEnv("PERPLEXITY_API_KEY", "pplx-test-key");
    vi.stubEnv("AGENT_REACH_URL", "https://agent-reach.test");
    vi.stubEnv("APIFY_TOKEN", "");
    vi.stubEnv("APIFY_TRENDS_ACTOR", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GOOGLE_API_KEY", "");
    const providerSignals: AbortSignal[] = [];
    vi.stubGlobal("fetch", vi.fn<FetchMockArgs, ReturnType<typeof fetch>>((_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal;
        providerSignals.push(signal);
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
    ));
    const controller = new AbortController();
    const abortReason = new DOMException("cancel composite", "AbortError");
    const operation = getTrendsProvider().getTrends({
      niche: "creator tools",
      abortSignal: controller.signal,
    });

    await vi.waitFor(() => expect(providerSignals).toHaveLength(2));
    controller.abort(abortReason);

    await expect(operation).rejects.toBe(abortReason);
    expect(providerSignals.every((signal) => signal.aborted)).toBe(true);
  });
});

describe("CalOS planner model", () => {
  it("defaults campaign planning to Gemini 3.1 Flash-Lite", () => {
    expect(DEFAULT_PLANNER_MODEL).toBe("gemini-3.1-flash-lite");
  });
});
