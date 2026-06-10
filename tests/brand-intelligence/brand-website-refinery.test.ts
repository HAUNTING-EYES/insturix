import { describe, expect, it } from 'vitest';
import {
  createWebsiteBrandSignalProfile,
  createWebsiteBrandSignalProfileDraft,
  fetchWebsiteBrandSnapshot,
  normalizeBrandWebsiteUrl,
} from '../../lib/shared/brand-website-refinery';
import { validateBrandSignalProfile } from '../../lib/shared/brand-signal-lifecycle';

const NOW = '2026-06-09T03:00:00.000Z';

const HTML = `
<!doctype html>
<html>
  <head>
    <title>Northstar Analytics - Revenue intelligence for SaaS teams</title>
    <meta name="description" content="Northstar Analytics helps revenue teams turn pipeline data into 3x faster decisions with trusted dashboards.">
    <meta property="og:site_name" content="Northstar Analytics">
    <meta name="theme-color" content="#102033">
    <meta property="og:image" content="https://northstar.example/og.png">
    <style>
      :root { --brand: #102033; --accent: #ff6a00; --paper: #f7f7f7; }
      body { color: #102033; background: #f7f7f7; font-family: "Inter", system-ui, sans-serif; }
      .cta { background: rgb(255, 106, 0); }
    </style>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "Northstar Analytics",
        "description": "A B2B analytics platform for revenue leaders.",
        "logo": "https://northstar.example/logo.svg"
      }
    </script>
  </head>
  <body>
    <h1>Turn pipeline data into 3x faster decisions</h1>
    <h2>Trusted dashboards for revenue teams</h2>
    <a href="/demo">Book a demo</a>
    <button>Start free</button>
    <blockquote class="testimonial">Trusted by 500 SaaS teams to improve forecast accuracy.</blockquote>
    <img alt="Northstar logo" src="/logo-mark.svg">
    <script>window.bad = "<b>do not trust me</b>"</script>
  </body>
</html>
`;

const LINEARISH_HTML = `
<!doctype html>
<html>
  <head>
    <title>Linear - Issue tracking for modern software teams</title>
    <meta name="description" content="Linear is a purpose-built system for planning and building products in the AI era.">
    <meta property="og:site_name" content="Linear">
    <meta name="theme-color" content="#191d20">
    <style>
      :root { --brand: #191d20; --accent: #b2d5ff; --surface: #f6f8fa; }
      body { color: #191d20; background: #f6f8fa; font-family: "Inter", system-ui, sans-serif; }
    </style>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "Linear",
        "description": "Project management software for product teams and engineering teams."
      }
    </script>
  </head>
  <body>
    <h1>Purpose-built system for planning and building products</h1>
    <h2>Project health, roadmaps, issues, and cycles in one workspace</h2>
    <h2>Built for teams and agents in the AI era</h2>
    <a href="/contact">Contact</a>
    <a href="/start">Get started</a>
    <a href="/sales">Contact sales</a>
    <a href="/brand">Download Brand Assets</a>
  </body>
</html>
`;

describe('Brand website refinery', () => {
  it('normalizes website URLs and rejects unsupported schemes', () => {
    expect(normalizeBrandWebsiteUrl('northstar.example')).toBe('https://northstar.example/');
    expect(normalizeBrandWebsiteUrl('http://northstar.example/path#fragment')).toBe('http://northstar.example/path');
    expect(() => normalizeBrandWebsiteUrl('mailto:hello@example.com')).toThrow('Unsupported website URL protocol');
  });

  it('creates first-party website evidence candidates and a draft BrandSignalProfile', () => {
    const result = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://northstar.example',
      html: HTML,
      brandId: 'brand_northstar',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_1',
    });

    expect(result.normalizedUrl).toBe('https://northstar.example/');
    expect(result.profile.identity.brandName.value).toBe('Northstar Analytics');
    expect(result.profile.identity.brandName.trustLevel).toBe('first_party_website');
    expect(result.profile.identity.industry?.value).toBe('Organization');
    expect(result.profile.identity.category.value).toBe('analytics');
    expect(result.profile.identity.audience.value).toEqual(expect.arrayContaining(['revenue teams', 'revenue leaders', 'SaaS teams']));
    expect(result.profile.identity.audience.value.every((item) => !/\b(to|turn|improve)\b/i.test(item))).toBe(true);
    expect(result.profile.identity.proofStyle.value).toBe('metrics');
    expect(result.profile.palette.primary?.value).toBe('#102033');
    expect(result.profile.palette.accent?.value).toBe('#ff6a00');
    expect(result.profile.palette.neutrals.value).toContain('#f7f7f7');
    expect(result.profile.typography.raw?.value).toBe('Inter');
    expect(result.profile.voice.ctaDirectness.value).toBeGreaterThan(0.5);
    expect(result.profile.voice.killList.trustLevel).toBe('fallback_default');
    expect(result.candidates.some((candidate) => candidate.signalPath === 'assets.logoCandidates')).toBe(true);
    expect(result.candidates.every((candidate) => candidate.sourceUrl === 'https://northstar.example/')).toBe(true);

    const validation = validateBrandSignalProfile(result.profile);
    expect(validation.valid).toBe(true);
    expect(validation.warnings.some((issue) => issue.path === 'voice.killList')).toBe(true);
  });

  it('filters generic real-site noise from software brand drafts', () => {
    const result = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://linear.example',
      html: LINEARISH_HTML,
      brandId: 'brand_linear',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_linear',
    });

    expect(result.profile.identity.category.value).toBe('software');
    expect(result.profile.identity.audience.value).toEqual(expect.arrayContaining(['product teams']));
    expect(result.profile.identity.audience.value).not.toEqual(expect.arrayContaining(['teams', 'teams and agents', 'AI era']));
    expect(result.profile.voice.recurringPhrases.value).toEqual(expect.arrayContaining([
      'Purpose-built system for planning and building products',
      'Project health, roadmaps, issues, and cycles in one workspace',
    ]));
    expect(result.profile.voice.recurringPhrases.value).not.toEqual(expect.arrayContaining([
      'Contact',
      'Get started',
      'Contact sales',
      'Download Brand Assets',
    ]));
  });

  it('wraps website profiles in a review-required lifecycle draft', () => {
    const result = createWebsiteBrandSignalProfileDraft(
      {
        websiteUrl: 'northstar.example',
        html: HTML,
        brandId: 'brand_northstar',
        userId: 'user_1',
        fetchedAt: NOW,
      },
      { id: 'draft_from_website', now: NOW },
    );

    expect(result.record.id).toBe('draft_from_website');
    expect(result.record.status).toBe('draft');
    expect(result.record.review.required).toBe(true);
    expect(result.record.review.reasons).toContain('Brand signal profiles must be reviewed before they become accepted brand truth.');
  });

  it('keeps network fetch injectable for deterministic tests and failures', async () => {
    const snapshot = await fetchWebsiteBrandSnapshot('northstar.example', {
      now: NOW,
      fetchFn: async () =>
        new Response(HTML, {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    });

    expect(snapshot.normalizedUrl).toBe('https://northstar.example/');
    expect(snapshot.fetchedAt).toBe(NOW);
    expect(snapshot.contentType).toBe('text/html');
    expect(snapshot.html).toContain('Northstar Analytics');

    await expect(
      fetchWebsiteBrandSnapshot('northstar.example', {
        fetchFn: async () => new Response('missing', { status: 404 }),
      }),
    ).rejects.toThrow('Website fetch failed with HTTP 404.');
  });
});
