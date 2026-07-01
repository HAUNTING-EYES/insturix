import { describe, expect, it } from "vitest";
import { createOAuthPopupResponse, escapeJsonForHtml } from "@/lib/oauth/popup-response";

describe("OAuth popup response", () => {
  it("escapes JSON so provider-controlled values cannot break out of data scripts", () => {
    const escaped = escapeJsonForHtml({
      message: '</script><img src=x onerror="alert(1)">',
    });

    expect(escaped).not.toContain("</script>");
    expect(escaped).not.toContain("<img");
    expect(escaped).toContain("\\u003c/script\\u003e");
  });

  it("uses escaped JSON data islands and a nonce-protected bridge script", async () => {
    const response = createOAuthPopupResponse({
      request: new Request("https://app.example.com/api/callback"),
      source: "test-oauth",
      payload: {
        success: false,
        message: '</script><script>alert("x")</script>',
      },
      fallbackUrl: "https://app.example.com/dashboard?error=x",
      title: "Test OAuth",
      message: "Completing test connection...",
    });

    const html = await response.text();

    expect(response.headers.get("Content-Security-Policy")).toMatch(/script-src 'nonce-[A-Za-z0-9_-]+'/);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(html).toContain('type="application/json"');
    expect(html).not.toContain("</script><script>alert");
    expect(html).toContain("\\u003c/script\\u003e");
    expect(html).toContain("window.opener.postMessage");
  });
});
