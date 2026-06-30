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
                  '[{"title":"Founder-led teardown posts","summary":"Operators are reacting to short teardown posts this week.","platform":"linkedin","url":"https://example.com/trend"}]',
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
    });
    expect(body.messages[1].content).toContain("<niche>B2B SaaS founders</niche>");
    expect(body.messages[1].content).toContain("<region>United States</region>");
  });
});

describe("CalOS planner model", () => {
  it("defaults campaign planning to Gemini 3.1 Flash-Lite", () => {
    expect(DEFAULT_PLANNER_MODEL).toBe("gemini-3.1-flash-lite");
  });
});
