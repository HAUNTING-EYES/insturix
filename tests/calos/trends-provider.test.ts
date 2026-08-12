import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PLANNER_MODEL } from "@/lib/calos/planner";
import { getTrendsProvider } from "@/lib/calos/trends";
import { PerplexityTrendsProvider } from "@/lib/calos/trends/perplexity";

type FetchMockArgs = [input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]];

describe("CalOS trend provider selection", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

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
});

describe("CalOS planner model", () => {
  it("defaults campaign planning to Gemini 3.1 Flash-Lite", () => {
    expect(DEFAULT_PLANNER_MODEL).toBe("gemini-3.1-flash-lite");
  });
});
