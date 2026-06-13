import { describe, expect, it } from 'vitest';
import {
  createWebsiteBrandSignalProfile,
  createWebsiteBrandSignalProfileDraft,
  fetchWebsiteBrandSnapshot,
  normalizeBrandWebsiteUrl,
  verifyWebsiteBrandAssetCandidates,
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
    const dataVizCandidate = result.candidates.find((candidate) => candidate.signalPath === 'visual.dataVizAffinity');
    const motionEnergyCandidate = result.candidates.find((candidate) => candidate.signalPath === 'motion.motionEnergy');
    expect(dataVizCandidate?.normalizedValue).toBe(result.profile.visual.dataVizAffinity.value);
    expect(dataVizCandidate?.normalizedValue).toBeGreaterThan(0.5);
    expect(motionEnergyCandidate?.normalizedValue).toBe(result.profile.motion.motionEnergy.value);
    expect(motionEnergyCandidate?.normalizedValue).toBeGreaterThan(0.5);

    const validation = validateBrandSignalProfile(result.profile);
    expect(validation.valid).toBe(true);
    expect(validation.warnings.some((issue) => issue.path === 'voice.killList')).toBe(true);
  });

  it('keeps distinctive brand colors from noisy compiled frontend CSS', () => {
    const neutralCss = Array.from({ length: 48 }, (_, index) => {
      const channel = (24 + index * 3).toString(16).padStart(2, '0').slice(-2);
      return `--gray-${index}: #${channel}${channel}${channel};`;
    }).join('\n');

    const result = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://insturix.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>Insturix - Creative operating system</title>
    <meta name="description" content="Insturix helps agencies run content production at scale.">
    <style>
      :root {
        ${neutralCss}
        --brand-blue: #5B8DEF;
        --brand-lavender: #9088D4;
        --brand-mint: rgb(33 201 164 / 0.9);
      }
      .hero-cta {
        color: #ffffff;
        background: linear-gradient(135deg, var(--brand-blue), #9088D4);
        border-color: rgb(91 141 239 / 0.8);
      }
    </style>
  </head>
  <body>
    <h1>One platform for agency production</h1>
    <a class="hero-cta" href="/start">Start producing</a>
  </body>
</html>
`,
      brandId: 'brand_insturix',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_compiled_css_colors',
    });

    const paletteColors = [
      result.profile.palette.primary?.value,
      result.profile.palette.accent?.value,
      ...result.profile.palette.supporting.value,
      ...result.profile.palette.neutrals.value,
    ].filter((color): color is string => Boolean(color));

    expect(paletteColors).toEqual(expect.arrayContaining(['#5b8def', '#9088d4', '#21c9a4']));
  });

  it('ranks logo assets separately from social preview images', () => {
    const result = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://northstar.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>Northstar Analytics</title>
    <meta property="og:image" content="/icons/og-image.jpg">
    <meta name="twitter:image" content="/icons/twitter-card.jpg">
    <link rel="icon" href="./favicon.ico">
    <link rel="shortcut icon" href="/favicon.ico">
    <link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png">
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "Northstar Analytics",
        "logo": "/icons/logo.png"
      }
    </script>
  </head>
  <body>
    <h1>Northstar Analytics</h1>
    <img alt="Northstar Analytics logo" src="/assets/wordmark.svg">
  </body>
</html>
`,
      brandId: 'brand_northstar',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_logo_rank',
    });

    const logoCandidates = result.candidates.filter((candidate) => candidate.signalPath === 'assets.logoCandidates');
    const logoUrls = logoCandidates.map((candidate) => candidate.normalizedValue);
    expect(logoUrls).toEqual([
      'https://northstar.example/assets/wordmark.svg',
      'https://northstar.example/icons/icon.svg',
      'https://northstar.example/icons/logo.png',
      'https://northstar.example/icons/apple-touch-icon.png',
      'https://northstar.example/favicon.ico',
    ]);
    expect(logoUrls).not.toContain('https://northstar.example/icons/og-image.jpg');
    expect(logoUrls.filter((url) => url === 'https://northstar.example/favicon.ico')).toHaveLength(1);
    expect(logoCandidates[0]).toMatchObject({
      sourceType: 'logo_asset',
      sourceField: 'website.logoImage',
      rawValue: {
        role: 'logo',
        sourceField: 'website.logoImage',
      },
    });
    expect(logoCandidates[0]?.confidence).toBeGreaterThan(logoCandidates.at(-1)?.confidence ?? 1);

    const socialPreviewImages = result.candidates
      .filter((candidate) => candidate.signalPath === 'assets.socialPreviewImages')
      .map((candidate) => candidate.normalizedValue);
    expect(socialPreviewImages).toEqual([
      'https://northstar.example/icons/og-image.jpg',
      'https://northstar.example/icons/twitter-card.jpg',
    ]);
  });

  it('probes website asset availability and downgrades unreachable candidates', async () => {
    const result = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://northstar.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>Northstar Analytics</title>
    <meta property="og:image" content="/share-card.jpg">
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "Northstar Analytics",
        "logo": "/missing-logo.png"
      }
    </script>
  </head>
  <body>
    <h1>Northstar Analytics</h1>
    <img alt="Northstar Analytics logo" src="/assets/wordmark.svg">
  </body>
</html>
`,
      brandId: 'brand_northstar',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_asset_probe',
    });
    const calls: Array<{ url: string; method: string | undefined }> = [];

    const checked = await verifyWebsiteBrandAssetCandidates(result.candidates, {
      fetchFn: async (url, init) => {
        calls.push({ url, method: init?.method });
        if (url.endsWith('/missing-logo.png')) {
          return new Response('', { status: 404 });
        }
        return new Response('', {
          status: 200,
          headers: { 'content-type': url.endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg' },
        });
      },
    });

    const broken = checked.candidates.find((candidate) => candidate.normalizedValue === 'https://northstar.example/missing-logo.png');
    const verified = checked.candidates.find((candidate) => candidate.normalizedValue === 'https://northstar.example/assets/wordmark.svg');
    expect(calls).toEqual(
      expect.arrayContaining([
        { url: 'https://northstar.example/missing-logo.png', method: 'HEAD' },
        { url: 'https://northstar.example/assets/wordmark.svg', method: 'HEAD' },
        { url: 'https://northstar.example/share-card.jpg', method: 'HEAD' },
      ]),
    );
    expect(broken?.confidence).toBeLessThanOrEqual(0.18);
    expect(broken?.rawValue).toMatchObject({
      availability: {
        status: 'unavailable',
        method: 'HEAD',
        httpStatus: 404,
      },
    });
    expect(verified?.rawValue).toMatchObject({
      availability: {
        status: 'available',
        method: 'HEAD',
        httpStatus: 200,
        contentType: 'image/svg+xml',
      },
    });
    expect(checked.warnings).toEqual(['1 website asset candidate was unreachable and downgraded before review.']);
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
