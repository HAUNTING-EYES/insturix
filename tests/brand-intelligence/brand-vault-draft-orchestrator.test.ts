import { describe, expect, it } from 'vitest';
import {
  acceptBrandVaultSignalProfileDraft,
  createBrandVaultWebsiteDraftJob,
  getLatestAcceptedBrandVaultProfile,
  rejectBrandVaultSignalProfileDraft,
} from '../../lib/shared/brand-vault-draft-orchestrator';
import { createInMemoryBrandSignalProfileRepository } from '../../lib/shared/brand-signal-profile-repository';

const NOW = '2026-06-09T05:00:00.000Z';

const HTML = `
<!doctype html>
<html>
  <head>
    <title>Signal House - Video systems for B2B teams</title>
    <meta name="description" content="Signal House helps agencies launch trusted video systems with fast production workflows.">
    <meta property="og:site_name" content="Signal House">
    <meta property="og:image" content="/share-card.jpg">
    <meta name="theme-color" content="#0b1b2b">
    <style>
      :root { --brand: #0b1b2b; --accent: #2ee6a6; --paper: #f5f7fa; }
      body { color: #0b1b2b; background: #f5f7fa; font-family: "Inter", system-ui, sans-serif; }
      a { color: #2ee6a6; }
    </style>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "Signal House",
        "description": "A video operations partner for B2B agencies.",
        "logo": "https://signal.example/logo.svg"
      }
    </script>
  </head>
  <body>
    <h1>Launch trusted video systems in days</h1>
    <h2>Fast workflows for agency operators</h2>
    <a href="/demo">Book a demo</a>
    <blockquote>Trusted by 120 agency teams to ship faster.</blockquote>
    <img alt="Signal House logo" src="/logo.svg">
    <img alt="Signal House product dashboard" class="product-card" src="/product-dashboard.png">
  </body>
</html>
`;

function htmlResponse(status = 200): Response {
  return new Response(status === 200 ? HTML : 'missing', {
    status,
    headers: { 'content-type': 'text/html' },
  });
}

function pageHtml(title: string, body: string): string {
  return `
<!doctype html>
<html>
  <head>
    <title>${title}</title>
    <meta name="description" content="${title} for Signal House.">
    <meta property="og:site_name" content="Signal House">
    <meta name="theme-color" content="#0b1b2b">
  </head>
  <body>${body}</body>
</html>
`;
}

describe('Brand Vault draft orchestrator', () => {
  it('creates and persists an API-ready website draft job without reading social links yet', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();

    const result = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        brandId: 'brand_signal',
        websiteUrl: 'signal.example',
        socialLinks: ['https://x.com/signalhouse'],
        jobId: 'job_signal_site',
        profileRecordId: 'draft_signal_site',
        now: NOW,
      },
      {
        repository,
        fetchOptions: {
          fetchFn: async (url, init) => {
            const target = String(url);
            if (init?.method === 'HEAD' && target.endsWith('.svg')) {
              return new Response('', { status: 200, headers: { 'content-type': 'image/svg+xml' } });
            }
            if (init?.method === 'HEAD' && (target.endsWith('.png') || target.endsWith('.jpg'))) {
              return new Response('', { status: 200, headers: { 'content-type': 'image/png' } });
            }
            return htmlResponse();
          },
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.job.status).toBe('needs_review');
    expect(result.job.inputs.socialLinks).toEqual(['https://x.com/signalhouse']);
    expect(result.warnings).toContain(
      'Social links without connected post evidence were staged for review; connect read scopes or add pinned posts for richer social language.',
    );
    expect(result.record.id).toBe('draft_signal_site');
    expect(result.record.status).toBe('draft');
    expect(result.record.review.required).toBe(true);
    expect(result.profile.identity.brandName.value).toBe('Signal House');
    expect(result.reviewPayload.recordId).toBe('draft_signal_site');
    expect(result.reviewPayload.candidateCount).toBeGreaterThan(0);
    expect(result.reviewPayload.coverage.palette.evidenceCount).toBeGreaterThan(0);
    expect(result.reviewPayload.coverage.identity.actionableSignalCount).toBeGreaterThan(0);
    expect(result.reviewPayload.intake.website).toMatchObject({
      status: 'complete',
      normalizedUrl: 'https://signal.example/',
      providedCount: 1,
      evidenceCount: expect.any(Number),
    });
    expect(result.reviewPayload.intake.website.evidenceCount).toBeGreaterThan(0);
    expect(result.reviewPayload.intake.evidenceLanes.find((lane) => lane.id === 'website')?.evidenceCount).toBeGreaterThan(0);
    expect(result.reviewPayload.intake.social).toMatchObject({
      status: 'needs_auth',
      linksProvided: 1,
      fetchedPostCount: 0,
      needsAuthCount: 1,
    });
    expect(result.reviewPayload.intake.social.platforms).toEqual([
      expect.objectContaining({ platform: 'x', status: 'needs_auth' }),
    ]);
    expect(result.reviewPayload.intake.uploads.status).toBe('not_provided');
    expect(result.reviewPayload.intake.evidenceLanes.find((lane) => lane.id === 'social')).toMatchObject({
      label: 'Social Evidence',
      status: 'needs_auth',
    });
    expect(result.reviewPayload.intake.nextActions.map((action) => action.id)).toEqual(
      expect.arrayContaining(['review_candidates', 'connect_social', 'add_pinned_posts', 'add_uploads', 'accept_or_reject']),
    );
    expect(result.reviewPayload.visualIdentity.colors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'primary', value: '#0b1b2b', label: 'Primary' }),
        expect.objectContaining({ role: 'accent', value: '#2ee6a6', label: 'Accent' }),
      ]),
    );
    expect(result.reviewPayload.visualIdentity.fonts[0]).toMatchObject({
      family: 'Inter',
      role: 'display',
      sampleText: 'Signal House',
      signalPath: 'typography.raw',
    });
    expect(result.reviewPayload.visualIdentity.logos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'logo',
          url: 'https://signal.example/logo.svg',
          availability: expect.objectContaining({ status: 'available' }),
        }),
      ]),
    );
    expect(result.reviewPayload.visualIdentity.images).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'product',
          label: 'Signal House product dashboard',
          url: 'https://signal.example/product-dashboard.png',
        }),
        expect.objectContaining({ kind: 'website_preview', url: 'https://signal.example/share-card.jpg' }),
      ]),
    );
    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          signalPath: 'assets.productImages',
          normalizedValue: expect.objectContaining({
            url: 'https://signal.example/product-dashboard.png',
            altText: 'Signal House product dashboard',
          }),
          confidence: 0.64,
        }),
      ]),
    );
    expect(result.candidates.every((candidate) => candidate.trustLevel)).toBe(true);
    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          signalPath: 'assets.logoCandidates',
          trustLevel: 'first_party_website',
        }),
        expect.objectContaining({
          sourceType: 'social_profile',
          trustLevel: 'public_social_page',
        }),
      ]),
    );
    expect(repository.getRecord('draft_signal_site')?.status).toBe('draft');
    expect(repository.listEvents('draft_signal_site').map((event) => event.type)).toEqual(['draft_saved']);
  });

  it('mirrors visual preview assets into durable storage before returning the review payload', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();
    const mirroredUrls: string[] = [];

    const result = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        brandId: 'brand_signal',
        websiteUrl: 'signal.example',
        jobId: 'job_visual_storage',
        profileRecordId: 'draft_visual_storage',
        now: NOW,
      },
      {
        repository,
        fetchOptions: {
          fetchFn: async (url, init) => {
            const target = String(url);
            if (init?.method === 'HEAD' && target.endsWith('.svg')) {
              return new Response('', { status: 200, headers: { 'content-type': 'image/svg+xml' } });
            }
            if (init?.method === 'HEAD' && (target.endsWith('.png') || target.endsWith('.jpg'))) {
              return new Response('', { status: 200, headers: { 'content-type': 'image/png' } });
            }
            return htmlResponse();
          },
        },
        visualAssetStorage: {
          async mirrorAsset(input) {
            mirroredUrls.push(input.url);
            return {
              ok: true,
              provider: 'test_r2',
              storageKey: `brandvault/${input.assetId}`,
              publicUrl: `https://cdn.signal.example/${input.assetId}`,
              contentType: input.url.endsWith('.svg') ? 'image/svg+xml' : 'image/png',
              sizeBytes: 2048,
              storedAt: NOW,
            };
          },
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(mirroredUrls).toEqual(
      expect.arrayContaining([
        'https://signal.example/logo.svg',
        'https://signal.example/product-dashboard.png',
        'https://signal.example/share-card.jpg',
      ]),
    );
    expect(result.warnings.some((warning) => warning.includes('visual asset storage'))).toBe(false);
    expect(result.reviewPayload.visualIdentity.logos[0]).toMatchObject({
      url: expect.stringMatching(/^https:\/\/cdn\.signal\.example\/visual_asset_/),
      originalUrl: 'https://signal.example/logo.svg',
      storage: {
        status: 'stored',
        provider: 'test_r2',
        originalUrl: 'https://signal.example/logo.svg',
        contentType: 'image/svg+xml',
        sizeBytes: 2048,
      },
    });
    expect(result.reviewPayload.visualIdentity.images).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'product',
          url: expect.stringMatching(/^https:\/\/cdn\.signal\.example\/visual_asset_/),
          originalUrl: 'https://signal.example/product-dashboard.png',
          storage: expect.objectContaining({ status: 'stored', provider: 'test_r2' }),
        }),
      ]),
    );
  });

  it('surfaces weak, missing, and fallback signal diagnostics for review UI', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();
    const sparseHtml = `
<!doctype html>
<html>
  <head>
    <title>Quiet Co</title>
    <meta name="description" content="Quiet Co provides planning software for service teams.">
    <meta property="og:site_name" content="Quiet Co">
    <meta name="theme-color" content="#101820">
    <style>
      :root { --ink: #101820; --paper: #f6f5f1; }
      body { color: #101820; background: #f6f5f1; font-family: Arial, sans-serif; }
    </style>
  </head>
  <body>
    <p>Planning software for service teams.</p>
    <a href="/contact">Contact</a>
  </body>
</html>
`;

    const result = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        brandId: 'brand_signal',
        websiteUrl: 'quiet.example',
        jobId: 'job_signal_diagnostics',
        profileRecordId: 'draft_signal_diagnostics',
        now: NOW,
      },
      {
        repository,
        fetchOptions: {
          fetchFn: async () => new Response(sparseHtml, { status: 200, headers: { 'content-type': 'text/html' } }),
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    const diagnostics = result.reviewPayload.signalDiagnostics;
    const byPath = new Map(diagnostics.items.map((item) => [item.path, item]));

    expect(diagnostics.summary.signalCount).toBe(diagnostics.items.length);
    expect(diagnostics.summary.readyCount).toBeGreaterThan(0);
    expect(diagnostics.summary.weakCount).toBeGreaterThan(0);
    expect(diagnostics.summary.missingCount).toBeGreaterThan(0);
    expect(diagnostics.summary.fallbackCount).toBeGreaterThan(0);
    expect(diagnostics.summary.reviewOnlyCount).toBe(
      diagnostics.summary.weakCount + diagnostics.summary.missingCount + diagnostics.summary.fallbackCount,
    );
    expect(diagnostics.summary.byGroup.voice.fallbackCount).toBeGreaterThan(0);
    expect(diagnostics.summary.byGroup.motion.fallbackCount).toBeGreaterThan(0);

    expect(byPath.get('identity.brandName')).toMatchObject({
      group: 'identity',
      status: 'ready',
      actionable: true,
      recommendedEvidence: [],
    });
    expect(byPath.get('voice.killList')).toMatchObject({
      group: 'voice',
      status: 'fallback',
      recommendedEvidence: expect.arrayContaining(['brand_uploads', 'manual_review']),
    });
    expect(byPath.get('voice.hookArchetypes')).toMatchObject({
      group: 'voice',
      status: 'missing',
      recommendedEvidence: expect.arrayContaining(['connected_social', 'pinned_posts']),
    });
    expect(byPath.get('motion.motionEnergy')).toMatchObject({
      group: 'motion',
      status: 'fallback',
      recommendedEvidence: expect.arrayContaining(['visual_scan']),
    });
    expect(diagnostics.priorityItems.map((item) => item.path)).toEqual(
      expect.arrayContaining(['voice.killList', 'voice.hookArchetypes', 'motion.motionEnergy']),
    );
  });

  it('runs typed text evidence compiler candidates before saving the draft profile', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();
    let compilerSawSourceCount = 0;
    let compilerSawExistingCandidateCount = 0;

    const result = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        brandId: 'brand_signal',
        websiteUrl: 'signal.example',
        socialLinks: ['https://www.instagram.com/insturix/'],
        jobId: 'job_text_compiler',
        profileRecordId: 'draft_text_compiler',
        sourceEvidence: [
          {
            kind: 'social_post',
            platform: 'instagram',
            url: 'https://www.instagram.com/p/founder/',
            text: 'Insturix exists because content production is broken for founder-led creative teams.',
            evidenceOrigin: 'public_fallback',
          },
        ],
        now: NOW,
      },
      {
        repository,
        fetchOptions: {
          fetchFn: async () => htmlResponse(),
        },
        textEvidenceCompiler: async (compilerInput) => {
          compilerSawSourceCount = compilerInput.sourceEvidence.length;
          compilerSawExistingCandidateCount = compilerInput.existingCandidates.length;
          return {
            warnings: ['Text evidence compiler produced review-only inferred candidates.'],
            candidates: [
              {
                id: 'raw_compiler_audience',
                brandId: 'wrong_brand',
                jobId: 'wrong_job',
                sourceType: 'social_post',
                sourceUrl: 'https://www.instagram.com/p/founder/',
                sourceField: 'compiler.rawAudience',
                signalPath: 'identity.audience',
                rawValue: ['founder-led creative teams'],
                normalizedValue: ['founder-led creative teams'],
                excerpt: 'Founder-led creative teams from representative social evidence.',
                confidence: 0.95,
                authorityClass: 'owned',
                observedAt: '2020-01-01T00:00:00.000Z',
                extractorId: 'unsafe-compiler',
              },
              {
                id: 'raw_compiler_motion',
                sourceType: 'social_post',
                sourceField: 'compiler.unsupportedMotion',
                signalPath: 'motion.motionEnergy',
                rawValue: 0.9,
                normalizedValue: 0.9,
                confidence: 0.99,
                authorityClass: 'owned',
                observedAt: '2020-01-01T00:00:00.000Z',
                extractorId: 'unsafe-compiler',
              },
              {
                id: 'raw_compiler_website_audience',
                sourceType: 'website',
                sourceUrl: 'https://signal.example/',
                sourceField: 'website.root',
                signalPath: 'identity.audience',
                rawValue: ['creative operators'],
                normalizedValue: ['creative operators'],
                excerpt: 'Creative operators from website evidence.',
                confidence: 0.61,
                authorityClass: 'owned',
                observedAt: '2020-01-01T00:00:00.000Z',
                extractorId: 'unsafe-compiler',
              },
              {
                id: 'raw_compiler_product_lower',
                sourceType: 'website',
                sourceUrl: 'https://signal.example/',
                sourceField: 'website.root',
                signalPath: 'identity.productServices',
                rawValue: ['automated content production platform'],
                normalizedValue: ['automated content production platform'],
                excerpt: 'Automated content production platform from website evidence.',
                confidence: 0.64,
                authorityClass: 'owned',
                observedAt: '2020-01-01T00:00:00.000Z',
                extractorId: 'unsafe-compiler',
              },
              {
                id: 'raw_compiler_product_title',
                sourceType: 'website',
                sourceUrl: 'https://signal.example/features',
                sourceField: 'compiler.productServices',
                signalPath: 'identity.productServices',
                rawValue: ['Automated Content Production Platform'],
                normalizedValue: ['Automated Content Production Platform'],
                excerpt: 'Automated Content Production Platform from feature-page evidence.',
                confidence: 0.66,
                authorityClass: 'owned',
                observedAt: '2020-01-01T00:00:00.000Z',
                extractorId: 'unsafe-compiler',
              },
            ],
          };
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(compilerSawSourceCount).toBe(1);
    expect(compilerSawExistingCandidateCount).toBeGreaterThan(0);
    expect(result.warnings).toContain('Text evidence compiler produced review-only inferred candidates.');
    expect(result.warnings).not.toContain(
      'Social links without connected post evidence were staged for review; connect read scopes or add pinned posts for richer social language.',
    );
    expect(result.reviewPayload.intake.social).toMatchObject({
      status: 'needs_review',
      linksProvided: 1,
      postSourceCount: 1,
      fetchedPostCount: 0,
      publicFallbackPostCount: 1,
      needsAuthCount: 0,
    });
    expect(result.reviewPayload.intake.social.notes).toEqual(
      expect.arrayContaining([
        '1 public fallback post sample staged for review.',
        'Connect matching social read access to promote reviewed public evidence into trusted account-matched evidence.',
      ]),
    );
    expect(result.reviewPayload.intake.social.platforms).toEqual([
      expect.objectContaining({
        platform: 'instagram',
        status: 'needs_review',
        fetchedPostCount: 0,
        publicFallbackPostCount: 1,
      }),
    ]);
    expect(result.reviewPayload.intake.evidenceLanes.find((lane) => lane.id === 'social')).toMatchObject({
      status: 'needs_review',
    });
    const nextActionIds = result.reviewPayload.intake.nextActions.map((action) => action.id);
    expect(nextActionIds).toContain('connect_social');
    expect(nextActionIds).not.toContain('add_pinned_posts');
    expect(result.reviewPayload.intake.nextActions.find((action) => action.id === 'connect_social')?.reason).toBe(
      'Public social evidence is staged for review; connected read access would make account-matched posts trusted enough for generation.',
    );

    const compilerCandidates = result.candidates.filter(
      (candidate) => candidate.extractorId === 'brand-vault-text-evidence-compiler.v1',
    );
    expect(compilerCandidates).toHaveLength(4);
    expect(compilerCandidates[0]).toMatchObject({
      brandId: 'brand_signal',
      jobId: 'job_text_compiler',
      signalPath: 'identity.audience',
      confidence: 0.68,
      authorityClass: 'inferred',
      observedAt: NOW,
    });
    expect(result.profile.identity.audience.value).toEqual(expect.arrayContaining(['founder-led creative teams', 'creative operators']));
    expect(result.profile.identity.audience.confidence).toBe(0.68);
    const productServices = result.profile.identity.productServices?.value ?? [];
    expect(productServices.map((value) => value.toLowerCase()).filter((value) => value === 'automated content production platform')).toHaveLength(1);
    expect(result.profile.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          extractor: 'brand-vault-text-evidence-compiler.v1',
          sourceType: 'public_social_page',
          sourceField: 'compiler.rawAudience',
        }),
        expect.objectContaining({
          extractor: 'brand-vault-text-evidence-compiler.v1',
          sourceType: 'first_party_website',
          sourceField: 'website.root',
          authorityClass: 'inferred_hint',
        }),
      ]),
    );
  });

  it('pulls first-party linked CSS into draft palette and typography evidence', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();
    const calls: string[] = [];
    const neutralCss = Array.from({ length: 40 }, (_, index) => {
      const channel = (30 + index * 4).toString(16).padStart(2, '0').slice(-2);
      return `--gray-${index}: #${channel}${channel}${channel};`;
    }).join('\n');
    const html = `
<!doctype html>
<html>
  <head>
    <title>Insturix - Creative operating system</title>
    <meta name="description" content="Insturix helps agencies run content production at scale.">
    <meta property="og:site_name" content="Insturix">
    <link rel="stylesheet" href="/_next/static/css/app.css">
    <link rel="stylesheet" href="https://cdn.example.com/brand.css">
  </head>
  <body>
    <h1>One platform for agency production</h1>
    <a class="hero-cta" href="/start">Start producing</a>
  </body>
</html>
`;
    const css = `
:root {
  ${neutralCss}
  --brand-blue: #5B8DEF;
  --brand-lavender: #9088D4;
  --brand-mint: rgb(33 201 164 / 0.9);
}
.hero-cta {
  font-family: "Plus Jakarta Sans", system-ui, sans-serif;
  background: linear-gradient(135deg, var(--brand-blue), #9088D4);
  border-color: rgb(91 141 239 / 0.8);
}
`;

    const result = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        brandId: 'brand_signal',
        websiteUrl: 'insturix.example',
        jobId: 'job_linked_css',
        profileRecordId: 'draft_linked_css',
        now: NOW,
      },
      {
        repository,
        fetchOptions: {
          fetchFn: async (url) => {
            calls.push(url);
            if (url === 'https://insturix.example/') {
              return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
            }
            if (url === 'https://insturix.example/_next/static/css/app.css') {
              return new Response(css, { status: 200, headers: { 'content-type': 'text/css' } });
            }
            return new Response('missing', { status: 404, headers: { 'content-type': 'text/html' } });
          },
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    const paletteColors = [
      result.profile.palette.primary?.value,
      result.profile.palette.accent?.value,
      ...result.profile.palette.supporting.value,
      ...result.profile.palette.neutrals.value,
    ].filter((color): color is string => Boolean(color));

    expect(calls).toContain('https://insturix.example/_next/static/css/app.css');
    expect(calls).not.toContain('https://cdn.example.com/brand.css');
    expect(paletteColors).toEqual(expect.arrayContaining(['#5b8def', '#9088d4', '#21c9a4']));
    expect(result.profile.typography.raw?.value).toBe('Plus Jakarta Sans');
    expect(result.reviewPayload.signalDiagnostics.items.find((item) => item.path === 'palette.accent')).toMatchObject({
      status: 'ready',
    });
  });

  it('uses website image OCR as product and service evidence before drafting signals', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();
    const ocrImageUrls: string[] = [];
    const html = `
<!doctype html>
<html>
  <head>
    <title>Glowbar</title>
    <meta name="description" content="Glowbar makes skincare essentials.">
    <meta property="og:site_name" content="Glowbar">
    <meta property="og:image" content="/share/glowbar-card.jpg">
  </head>
  <body>
    <h1>Daily essentials</h1>
    <img class="product-card" alt="Daily Barrier Serum product packshot" src="/cdn/shop/products/daily-barrier-serum.jpg">
  </body>
</html>
`;

    const result = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        brandId: 'brand_signal',
        websiteUrl: 'glowbar.example',
        jobId: 'job_website_image_ocr',
        profileRecordId: 'draft_website_image_ocr',
        now: NOW,
      },
      {
        repository,
        fetchOptions: {
          fetchFn: async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }),
        },
        websiteOcrProvider: {
          async readTextFromImage(input) {
            ocrImageUrls.push(input.imageUrl ?? '');
            return { text: 'Daily Barrier Serum\nDaily skincare essentials for sensitive skin.' };
          },
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(ocrImageUrls).toEqual([
      'https://glowbar.example/cdn/shop/products/daily-barrier-serum.jpg',
      'https://glowbar.example/share/glowbar-card.jpg',
    ]);
    expect(result.warnings).toContain('Brand Vault OCR extracted readable text from 2 website images for draft evidence review.');
    expect(result.profile.identity.productServices?.value).toEqual(
      expect.arrayContaining(['Daily Barrier Serum Daily skincare essentials for sensitive skin']),
    );
    expect(result.profile.assets?.productImages.value).toEqual(['https://glowbar.example/cdn/shop/products/daily-barrier-serum.jpg']);
    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceField: 'website.imageOcr.productImage',
          sourceUrl: 'https://glowbar.example/cdn/shop/products/daily-barrier-serum.jpg',
          signalPath: 'identity.productServices',
          normalizedValue: expect.arrayContaining(['Daily Barrier Serum Daily skincare essentials for sensitive skin']),
        }),
      ]),
    );
  });

  it('downgrades unreachable website asset candidates before review payload assembly', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();

    const result = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        brandId: 'brand_signal',
        websiteUrl: 'signal.example',
        jobId: 'job_asset_probe',
        profileRecordId: 'draft_asset_probe',
        now: NOW,
      },
      {
        repository,
        fetchOptions: {
          fetchFn: async (url) => {
            if (url === 'https://signal.example/') return htmlResponse();
            if (url.endsWith('/logo.svg')) return new Response('', { status: 404 });
            return new Response('', { status: 200, headers: { 'content-type': 'image/svg+xml' } });
          },
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    const logo = result.candidates.find(
      (candidate) => candidate.signalPath === 'assets.logoCandidates' && candidate.normalizedValue === 'https://signal.example/logo.svg',
    );
    expect(logo?.confidence).toBeLessThanOrEqual(0.18);
    expect(logo?.rawValue).toMatchObject({
      availability: {
        status: 'unavailable',
        httpStatus: 404,
      },
    });
    expect(result.warnings).toContain('1 website asset candidate was unreachable and downgraded before review.');
    expect(result.reviewPayload.warnings).toContain('1 website asset candidate was unreachable and downgraded before review.');
  });

  it('preserves primary audience and typography evidence from mixed website fonts', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();
    const mixedFontHtml = `
<!doctype html>
<html>
  <head>
    <title>Insturix - One platform for production</title>
    <meta name="description" content="Insturix is built for agencies producing content at scale.">
    <style>
      body { font-family: "Plus Jakarta Sans", "JetBrains Mono", sans-serif; }
    </style>
  </head>
  <body>
    <h1>One platform. Entire production.</h1>
    <p>Built for agencies producing content at scale.</p>
  </body>
</html>
`;

    const result = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        brandId: 'brand_signal',
        websiteUrl: 'insturix.example',
        jobId: 'job_mixed_font',
        profileRecordId: 'draft_mixed_font',
        now: NOW,
      },
      {
        repository,
        fetchOptions: {
          fetchFn: async () => new Response(mixedFontHtml, { status: 200, headers: { 'content-type': 'text/html' } }),
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.profile.identity.audience.value).toEqual(expect.arrayContaining(['agencies producing content at scale']));
    expect(result.profile.typography.category.value).toBe('sans');
  });

  it('crawls prioritized same-origin pages across depth with policy caps', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();
    const pages: Record<string, string> = {
      'https://signal.example/': pageHtml(
        'Signal House',
        [
          '<a href="/about?utm=ignored#team">About</a>',
          '<a href="/case-studies">Case studies</a>',
          '<a href="/privacy">Privacy</a>',
          '<a href="/brand.pdf">Brand PDF</a>',
          '<a href="https://other.example/work">Offsite work</a>',
        ].join(''),
      ),
      'https://signal.example/about': pageHtml(
        'About Signal House',
        '<h1>About Signal House</h1><a href="/customers">Customers</a><a href="/careers">Careers</a>',
      ),
      'https://signal.example/case-studies': pageHtml(
        'Signal House Case Studies',
        '<h1>Case studies</h1><a href="/features">Features</a>',
      ),
      'https://signal.example/customers': pageHtml(
        'Signal House Customers',
        '<h1>Customer proof</h1><a href="/features">Features</a>',
      ),
      'https://signal.example/features': pageHtml('Signal House Features', '<h1>Feature platform</h1>'),
    };
    const fetchCalls: string[] = [];

    const result = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        brandId: 'brand_signal',
        websiteUrl: 'signal.example',
        jobId: 'job_crawl',
        profileRecordId: 'draft_crawl',
        now: NOW,
        sourceEvidence: [
          {
            kind: 'crawl_seed',
            url: 'https://signal.example/about?utm=ignored#team',
            platform: 'website',
            crawl: {
              maxPages: 3,
              maxDepth: 2,
              includePaths: ['/about', '/case-studies', '/customers', '/features'],
              excludePaths: ['/careers'],
            },
          },
        ],
      },
      {
        repository,
        fetchOptions: {
          fetchFn: async (url) => {
            fetchCalls.push(url);
            return new Response(pages[url] ?? 'missing', {
              status: pages[url] ? 200 : 404,
              headers: { 'content-type': 'text/html' },
            });
          },
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    const crawled = result.candidates.filter((candidate) => candidate.sourceField === 'crawl.page');
    expect(fetchCalls).toEqual([
      'https://signal.example/',
      'https://signal.example/about',
      'https://signal.example/sitemap_index.xml',
      'https://signal.example/sitemap.xml',
      'https://signal.example/case-studies',
      'https://signal.example/customers',
    ]);
    expect(crawled.map((candidate) => candidate.sourceUrl)).toEqual([
      'https://signal.example/about',
      'https://signal.example/case-studies',
      'https://signal.example/customers',
    ]);
    expect(crawled.some((candidate) => /privacy|brand\.pdf|other\.example|careers|features/.test(candidate.sourceUrl ?? ''))).toBe(false);
    expect(crawled[0]?.normalizedValue).toMatchObject({ title: 'About Signal House' });
    expect(result.warnings).toContain('Crawled 3 additional brand pages for draft evidence.');
    expect(result.reviewPayload.intake.website.crawledPageCount).toBe(3);
    const rootWebsiteEvidenceCount = result.profile.evidence.filter((item) =>
      ['first_party_website', 'website', 'website_metadata', 'json_ld', 'css', 'logo_asset'].includes(item.sourceType)
      && item.extractor !== 'brand-vault-crawler.v1'
      && !(item.sourceField ?? '').startsWith('crawl.page')
    ).length;
    expect(result.reviewPayload.intake.website.evidenceCount).toBe(
      rootWebsiteEvidenceCount,
    );
    expect(result.reviewPayload.intake.website.evidenceCount).toBeLessThan(result.profile.evidence.length);
    expect(result.reviewPayload.intake.evidenceLanes.find((lane) => lane.id === 'crawl')).toMatchObject({
      status: 'complete',
      sourceCount: 3,
    });
    expect(result.reviewPayload.intake.evidenceLanes.find((lane) => lane.id === 'website')?.evidenceCount).toBe(
      result.reviewPayload.intake.website.evidenceCount,
    );
  });

  it('keeps crawler skips out of social intake and filters low-value crawl pages', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();
    const fetchCalls: string[] = [];

    const result = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        brandId: 'brand_signal',
        websiteUrl: 'signal.example',
        socialLinks: ['https://www.instagram.com/signalhouse'],
        jobId: 'job_crawl_noise',
        profileRecordId: 'draft_crawl_noise',
        now: NOW,
        sourceEvidence: [
          {
            kind: 'crawl_seed',
            url: 'https://signal.example/resources/blogs/1',
            platform: 'website',
            crawl: {
              maxPages: 2,
              maxDepth: 1,
              includePaths: ['/about', '/resources', '/legal'],
            },
          },
        ],
      },
      {
        repository,
        fetchSnapshot: async (url) => {
          fetchCalls.push(url);
          if (url === 'https://signal.example/') {
            return {
              normalizedUrl: url,
              html: pageHtml(
                'Signal House',
                [
                  '<a href="/about">About</a>',
                  '<a href="/resources/blogs/1">Missing post</a>',
                  '<a href="/legal/privacy">Privacy</a>',
                ].join(''),
              ),
              contentType: 'text/html',
              fetchedAt: NOW,
            };
          }
          if (url === 'https://signal.example/about') {
            return {
              normalizedUrl: url,
              html: pageHtml('About Signal House', '<h1>About Signal House</h1>'),
              contentType: 'text/html',
              fetchedAt: NOW,
            };
          }
          if (url === 'https://signal.example/resources/blogs/1') {
            return {
              normalizedUrl: url,
              html: pageHtml('Post Not Found | Signal House', '<h1>Post Not Found</h1>'),
              contentType: 'text/html',
              fetchedAt: NOW,
            };
          }
          throw new Error('not found');
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(fetchCalls).not.toContain('https://signal.example/legal/privacy');
    expect(result.warnings).toContain(
      'Brand Vault crawler skipped https://signal.example/resources/blogs/1: page appeared to be a soft 404 or low-value placeholder.',
    );
    expect(result.candidates.some((candidate) =>
      candidate.sourceField === 'crawl.page' && candidate.sourceUrl === 'https://signal.example/resources/blogs/1',
    )).toBe(false);
    expect(result.reviewPayload.intake.social.skippedCount).toBe(0);
    expect(result.reviewPayload.intake.social.notes).not.toEqual(
      expect.arrayContaining(['1 social enrichment step skipped.']),
    );
  });

  it('normalizes bare-domain crawl seeds against the final website origin', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();
    const fetchCalls: string[] = [];

    const result = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        brandId: 'brand_signal',
        websiteUrl: 'signal.example',
        jobId: 'job_bare_seed_crawl',
        profileRecordId: 'draft_bare_seed_crawl',
        now: NOW,
        sourceEvidence: [
          {
            kind: 'crawl_seed',
            url: 'signal.example/about?utm=ignored#team',
            platform: 'website',
            crawl: {
              maxPages: 1,
              maxDepth: 0,
              includePaths: ['/about'],
            },
          },
        ],
      },
      {
        repository,
        fetchSnapshot: async (url) => {
          fetchCalls.push(url);
          if (url === 'https://signal.example/') {
            return {
              normalizedUrl: 'https://www.signal.example/',
              html: pageHtml('Signal House', '<h1>Signal House</h1>'),
              contentType: 'text/html',
              fetchedAt: NOW,
            };
          }
          if (url === 'https://www.signal.example/about') {
            return {
              normalizedUrl: url,
              html: pageHtml('About Signal House', '<h1>About Signal House</h1>'),
              contentType: 'text/html',
              fetchedAt: NOW,
            };
          }
          throw new Error(`Unexpected crawl URL: ${url}`);
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(fetchCalls).toEqual(['https://signal.example/', 'https://www.signal.example/about']);
    expect(fetchCalls).not.toContain('https://www.signal.example/signal.example/about');
    expect(result.candidates.find((candidate) => candidate.sourceField === 'crawl.page')?.sourceUrl).toBe(
      'https://www.signal.example/about',
    );
  });

  it('auto-crawls brand pages and expands sitemap URLs without requiring a crawl seed', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();
    const pages: Record<string, { html: string; contentType: string }> = {
      'https://signal.example/': {
        contentType: 'text/html',
        html: pageHtml(
          'Signal House',
          [
            '<link rel="sitemap" href="/brand-sitemap.xml">',
            '<a href="/about">About</a>',
            '<a href="/privacy">Privacy</a>',
            '<a href="/logo.png">Logo</a>',
          ].join(''),
        ),
      },
      'https://signal.example/brand-sitemap.xml': {
        contentType: 'application/xml',
        html: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset>',
          '<url><loc>https://signal.example/mission</loc></url>',
          '<url><loc>https://signal.example/customers?utm=ignored#proof</loc></url>',
          '<url><loc>https://signal.example/privacy</loc></url>',
          '<url><loc>https://other.example/work</loc></url>',
          '</urlset>',
        ].join(''),
      },
      'https://signal.example/about': {
        contentType: 'text/html',
        html: pageHtml(
          'About Signal House',
          '<h1>About the team</h1><p>Built for B2B agency operators scaling video production.</p><a href="/demo">Book a demo</a>',
        ),
      },
      'https://signal.example/mission': {
        contentType: 'text/html',
        html: pageHtml('Signal House Mission', '<h1>Operator-first mission</h1><blockquote>Trusted by 120 agency teams.</blockquote>'),
      },
      'https://signal.example/customers': {
        contentType: 'text/html',
        html: pageHtml('Signal House Customers', '<h1>Customer proof</h1><section class="case-study">120 agency teams ship weekly.</section>'),
      },
    };

    const result = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        brandId: 'brand_signal',
        websiteUrl: 'signal.example',
        jobId: 'job_auto_crawl',
        profileRecordId: 'draft_auto_crawl',
        now: NOW,
      },
      {
        repository,
        fetchSnapshot: async (url) => {
          const page = pages[url];
          if (!page) throw new Error('not found');
          return {
            normalizedUrl: url,
            html: page.html,
            contentType: page.contentType,
            fetchedAt: NOW,
          };
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    const crawledUrls = result.candidates
      .filter((candidate) => candidate.sourceField === 'crawl.page')
      .map((candidate) => candidate.sourceUrl);
    expect(crawledUrls).toEqual(expect.arrayContaining([
      'https://signal.example/about',
      'https://signal.example/mission',
      'https://signal.example/customers',
    ]));
    expect(crawledUrls.some((url) => /privacy|logo\.png|other\.example|brand-sitemap/.test(url ?? ''))).toBe(false);
    expect(result.warnings).toContain('Crawled 3 additional brand pages for draft evidence.');
    expect(result.reviewPayload.intake.website.crawledPageCount).toBe(3);
    const crawlLane = result.reviewPayload.intake.evidenceLanes.find((lane) => lane.id === 'crawl');
    const crawlSignalCandidates = result.candidates.filter((candidate) =>
      candidate.extractorId === 'brand-vault-crawler.v1' && candidate.sourceField !== 'crawl.page',
    );
    expect(crawlLane).toMatchObject({
      status: 'complete',
      sourceCount: 3,
      topSignalPaths: expect.arrayContaining(['identity.proofStyle', 'identity.audience', 'identity.category', 'identity.industry']),
    });
    expect(crawlLane?.candidateCount).toBeGreaterThan(3);
    expect(crawlLane?.notes).toEqual([
      'Crawled 3 additional pages and extracted 16 page-level candidates.',
    ]);
    expect(crawlSignalCandidates.map((candidate) => candidate.sourceField)).toEqual(
      expect.arrayContaining([
        'crawl.page.1.headings',
        'crawl.page.1.copy',
        'crawl.page.2.proof',
        'crawl.page.3.hooks',
        'crawl.page.3.proof',
      ]),
    );
    expect(crawlSignalCandidates.map((candidate) => candidate.signalPath)).toEqual(
      expect.arrayContaining([
        'identity.audience',
        'identity.category',
        'identity.industry',
        'identity.proofStyle',
        'voice.hookArchetypes',
      ]),
    );
    expect(result.reviewPayload.signalDiagnostics.items.find((item) => item.path === 'identity.proofStyle')?.candidateCount).toBeGreaterThan(3);
    expect(result.reviewPayload.signalDiagnostics.items.find((item) => item.path === 'identity.audience')?.candidateCount).toBeGreaterThan(1);
  });

  it('promotes useful crawler candidates into weak draft signals without inflating confidence', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();
    const pages: Record<string, string> = {
      'https://signal.example/': pageHtml(
        'Signal House',
        [
          '<h1>Signal House</h1>',
          '<p>Planning software for service teams.</p>',
          '<a href="/customers">Customers</a>',
        ].join(''),
      ),
      'https://signal.example/customers': pageHtml(
        'Signal House Customers',
        [
          '<h1>One operating system for agency production</h1>',
          '<p>Built for B2B agency operators scaling video production.</p>',
          '<p>120 agency teams ship weekly with the system.</p>',
          '<a href="/demo">Book a demo</a>',
        ].join(''),
      ),
    };

    const result = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        brandId: 'brand_signal',
        websiteUrl: 'signal.example',
        jobId: 'job_crawl_signal_enrichment',
        profileRecordId: 'draft_crawl_signal_enrichment',
        now: NOW,
        sourceEvidence: [
          {
            kind: 'crawl_seed',
            url: 'https://signal.example/customers',
            platform: 'website',
            crawl: {
              maxPages: 1,
              maxDepth: 0,
              includePaths: ['/customers'],
            },
          },
        ],
      },
      {
        repository,
        fetchSnapshot: async (url) => {
          const html = pages[url];
          if (!html) throw new Error(`Unexpected crawl URL: ${url}`);
          return {
            normalizedUrl: url,
            html,
            contentType: 'text/html',
            fetchedAt: NOW,
          };
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    const audienceCandidate = result.candidates.find((candidate) =>
      candidate.extractorId === 'brand-vault-crawler.v1' && candidate.signalPath === 'identity.audience'
    );
    expect(audienceCandidate?.normalizedValue).toEqual(
      expect.arrayContaining(['B2B agency operators scaling video production', 'agency teams']),
    );
    expect(result.profile.identity.audience.value).toEqual(expect.arrayContaining(['agency teams']));
    expect(result.profile.identity.proofStyle).toMatchObject({
      value: 'metrics',
      confidence: 0.58,
      trustLevel: 'first_party_website',
    });
    expect(result.profile.voice.hookArchetypes.value).toEqual(expect.arrayContaining(['system']));
    expect(result.profile.voice.hookArchetypes.confidence).toBe(0.48);
    expect(result.profile.voice.hookArchetypes.confidence).toBeLessThan(0.55);
    expect(result.profile.voice.hookArchetypes.evidenceIds.length).toBeGreaterThan(1);
  });

  it('promotes crawled vertical evidence when the root page is thin', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();
    const pages: Record<string, string> = {
      'https://roper.example/': pageHtml(
        'Investor Relations | Roper Technologies, Inc.',
        [
          '<h1>Investor Relations</h1>',
          '<p>Cookie settings and investor news.</p>',
        ].join(''),
      ),
      'https://roper.example/about-us/who-we-are': pageHtml(
        'Who We Are | Roper Technologies',
        [
          '<h1>Diversified industrial technology</h1>',
          '<p>Cookie Settings Accept All Privacy Overview Necessary Functional Performance Analytics Advertisement Others SAVE & ACCEPT.</p>',
          '<p>Cash return on investment, compounding cash flow, minimize risk, shareholders, and financial results.</p>',
          '<p>Roper is a diversified technology company with engineered products, application software, instrumentation, imaging systems, and industrial growth markets.</p>',
          '<p>Our businesses serve test and measurement, aerospace and defense, and industrial teams.</p>',
        ].join(''),
      ),
    };

    const result = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_roper',
        brandId: 'brand_roper',
        websiteUrl: 'roper.example',
        jobId: 'job_crawl_vertical',
        profileRecordId: 'draft_crawl_vertical',
        now: NOW,
        sourceEvidence: [
          {
            kind: 'crawl_seed',
            url: 'https://roper.example/about-us/who-we-are',
            platform: 'website',
            crawl: {
              maxPages: 1,
              maxDepth: 0,
              includePaths: ['/about-us/who-we-are'],
            },
          },
        ],
      },
      {
        repository,
        fetchSnapshot: async (url) => {
          const html = pages[url];
          if (!html) throw new Error(`Unexpected crawl URL: ${url}`);
          return {
            normalizedUrl: url,
            html,
            contentType: 'text/html',
            fetchedAt: NOW,
          };
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    const verticalCandidate = result.candidates.find((candidate) =>
      candidate.extractorId === 'brand-vault-crawler.v1' && candidate.signalPath === 'identity.industry'
    );
    expect(verticalCandidate).toMatchObject({
      sourceField: 'crawl.page.1.industry',
      sourceUrl: 'https://roper.example/about-us/who-we-are',
      normalizedValue: 'hardware/electronics',
      confidence: 0.58,
    });
    expect(result.profile.identity.industry).toMatchObject({
      value: 'hardware/electronics',
      confidence: 0.58,
      trustLevel: 'first_party_website',
    });
    expect(result.profile.identity.category).toMatchObject({
      value: 'hardware/electronics',
      confidence: 0.58,
      trustLevel: 'first_party_website',
    });
    const industryEvidence = result.profile.evidence.find((item) =>
      item.signalPath === 'identity.industry' && item.extractor === 'brand-vault-crawler.v1'
    );
    expect(industryEvidence?.sourceUrl).toBe('https://roper.example/about-us/who-we-are');
  });

  it('keeps full-crawl app UI evidence out of canonical website copy', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();
    const pages: Record<string, string> = {
      'https://signal.example/': pageHtml(
        'Signal House',
        [
          '<h1>Signal House</h1>',
          '<p>Planning software for service teams.</p>',
          '<a href="/app-demo">Product demo</a>',
        ].join(''),
      ),
      'https://signal.example/app-demo': pageHtml(
        'Signal House Product Demo',
        [
          '<h1>One operating system for agency production</h1>',
          '<p>Built for B2B agency operators scaling video production.</p>',
          '<div class="editor-shell">',
          '<button>Export</button>',
          '<button>LAYERS</button>',
          '<button>Script</button>',
          '<button>Media</button>',
          '<button>Captions</button>',
          '<button>Pipeline</button>',
          '</div>',
        ].join(''),
      ),
    };

    const result = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        brandId: 'brand_signal',
        websiteUrl: 'signal.example',
        jobId: 'job_crawl_root_separation',
        profileRecordId: 'draft_crawl_root_separation',
        now: NOW,
        sourceEvidence: [
          {
            kind: 'crawl_seed',
            url: 'https://signal.example/app-demo',
            platform: 'website',
            crawl: {
              maxPages: 1,
              maxDepth: 0,
              includePaths: ['/app-demo'],
            },
          },
        ],
      },
      {
        repository,
        fetchSnapshot: async (url) => {
          const html = pages[url];
          if (!html) throw new Error(`Unexpected crawl URL: ${url}`);
          return {
            normalizedUrl: url,
            html,
            contentType: 'text/html',
            fetchedAt: NOW,
          };
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    const crawlCandidates = result.candidates.filter((candidate) =>
      candidate.extractorId === 'brand-vault-crawler.v1' && candidate.sourceUrl === 'https://signal.example/app-demo',
    );
    expect(crawlCandidates.map((candidate) => candidate.signalPath)).toEqual(
      expect.arrayContaining(['voice.hookArchetypes', 'identity.audience']),
    );
    expect(result.profile.voice.hookArchetypes.value).toEqual(expect.arrayContaining(['system']));
    expect(result.profile.identity.audience.value).toEqual(expect.arrayContaining(['B2B agency operators scaling video production']));

    const canonicalWebsiteCopy = result.profile.evidence
      .filter((item) => item.extractor === 'brand-website-refinery.v1' && item.sourceField === 'website.copy')
      .map((item) => item.excerpt ?? '')
      .join(' ');
    expect(canonicalWebsiteCopy).toContain('Planning software for service teams.');
    expect(canonicalWebsiteCopy).not.toMatch(/\b(?:Export|LAYERS|Script|Media|Captions|Pipeline)\b/);

    expect(result.reviewPayload.intake.evidenceLanes.find((lane) => lane.id === 'crawl')).toMatchObject({
      status: 'complete',
      sourceCount: 1,
    });
  });

  it('keeps crawled Insturix-shaped audience and phrase promotions concise', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();
    const pages: Record<string, string> = {
      'https://signal.example/': pageHtml(
        'Insturix',
        [
          '<h1>Automated content production for agencies, in-house teams, businesses, enterprises, creator houses, and filmmakers.</h1>',
          '<p>Insturix is an automated content production platform for agencies, in-house teams, businesses, enterprises, creator houses, and filmmakers.</p>',
          '<a href="/evidence">Evidence</a>',
        ].join(''),
      ),
      'https://signal.example/evidence': pageHtml(
        'Insturix Evidence',
        [
          '<h1>Choose your access level</h1>',
          '<h2>Your current stack costs more than you think</h2>',
          '<h2>One platform. Entire production.</h2>',
          '<h2>Stay in the loop</h2>',
          '<p>AI-assisted editing helps with the editing stage.</p>',
          '<p>For simple projects, that path can be informal.</p>',
          '<p>Agencies scale by keeping the production workflow connected.</p>',
          '<p>Scale multiple clients without creating more handoffs or brand drift.</p>',
          '<p>Automated content production for creator houses, in-house teams, agencies, businesses, enterprises, and filmmakers.</p>',
          '<a href="/start">Start scan</a>',
          '<a href="/faq">Frequently asked questions</a>',
        ].join(''),
      ),
    };

    const result = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        brandId: 'brand_signal',
        websiteUrl: 'signal.example',
        jobId: 'job_insturix_crawl_quality',
        profileRecordId: 'draft_insturix_crawl_quality',
        now: NOW,
        sourceEvidence: [
          {
            kind: 'crawl_seed',
            url: 'https://signal.example/evidence',
            platform: 'website',
            crawl: {
              maxPages: 1,
              maxDepth: 0,
              includePaths: ['/evidence'],
            },
          },
        ],
      },
      {
        repository,
        fetchSnapshot: async (url) => {
          const html = pages[url];
          if (!html) throw new Error(`Unexpected crawl URL: ${url}`);
          return {
            normalizedUrl: url,
            html,
            contentType: 'text/html',
            fetchedAt: NOW,
          };
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.profile.identity.industry?.value).toBe('content production software');
    expect(result.profile.identity.audience.value).toEqual(expect.arrayContaining([
      'agencies',
      'in-house teams',
      'enterprises',
      'creator houses',
      'filmmakers',
    ]));
    expect(result.profile.identity.audience.value.join(' | ')).not.toMatch(
      /editing stage|production workflow connected|brand drift|handoffs|path can be|multiple clients/i,
    );

    expect(result.profile.voice.recurringPhrases.value.length).toBeLessThanOrEqual(12);
    expect(result.profile.voice.recurringPhrases.value).not.toEqual(expect.arrayContaining([
      'Choose your access level',
      'Stay in the loop',
      'Start scan',
      'Frequently asked questions',
    ]));
    expect(result.profile.voice.hookArchetypes.value).toEqual(expect.arrayContaining(['system']));
    expect(result.profile.voice.hookArchetypes.value).not.toEqual(expect.arrayContaining([
      'Your current stack costs more than you think',
      'Choose your access level',
      'Stay in the loop',
      'Start scan',
      'Frequently asked questions',
    ]));
  });

  it('strips script payloads before deriving crawler proof snippets', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();
    const pages: Record<string, string> = {
      'https://signal.example/': pageHtml(
        'Signal House',
        [
          '<h1>Signal House</h1>',
          '<a href="/customers">Customers</a>',
        ].join(''),
      ),
      'https://signal.example/customers': pageHtml(
        'Signal House Customers',
        [
          '<h1>Customer proof</h1>',
          '<p>Trusted by 120 agency teams.</p>',
          '<script>self.__next_f.push(["$","meta",{"name":"application-name","content":"Signal House"}]);</script>',
          '<script>{"manifest":"/site.webmanifest","someMetric":"999 fake customers"}</script>',
        ].join(''),
      ),
    };

    const result = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        brandId: 'brand_signal',
        websiteUrl: 'signal.example',
        jobId: 'job_crawl_script_noise',
        profileRecordId: 'draft_crawl_script_noise',
        now: NOW,
        sourceEvidence: [
          {
            kind: 'crawl_seed',
            url: 'https://signal.example/customers',
            platform: 'website',
            crawl: {
              maxPages: 1,
              maxDepth: 0,
              includePaths: ['/customers'],
            },
          },
        ],
      },
      {
        repository,
        fetchSnapshot: async (url) => {
          const html = pages[url];
          if (!html) throw new Error(`Unexpected crawl URL: ${url}`);
          return {
            normalizedUrl: url,
            html,
            contentType: 'text/html',
            fetchedAt: NOW,
          };
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    const proofCandidate = result.candidates.find(
      (candidate) => candidate.extractorId === 'brand-vault-crawler.v1' && candidate.sourceField.endsWith('.proof'),
    );
    const proofEvidenceText = [
      ...(Array.isArray(proofCandidate?.rawValue) ? proofCandidate.rawValue.map(String) : [String(proofCandidate?.rawValue)]),
      proofCandidate?.excerpt,
    ].join(' ');

    expect(proofEvidenceText).toContain('Trusted by 120 agency teams.');
    expect(proofEvidenceText).not.toMatch(/__next_f|\$|application-name|manifest|fake customers/i);
  });

  it('bounds crawler attempts when queued brand links keep failing', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();
    const crawlRequests: string[] = [];
    const rootHtml = pageHtml(
      'Signal House',
      [
        '<h1>Signal House</h1>',
        ...Array.from({ length: 20 }, (_, index) => `<a href="/brand-${index}">Brand ${index}</a>`),
      ].join(''),
    );

    const result = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        brandId: 'brand_signal',
        websiteUrl: 'signal.example',
        jobId: 'job_crawl_attempt_budget',
        profileRecordId: 'draft_crawl_attempt_budget',
        now: NOW,
        sourceEvidence: [
          {
            kind: 'crawl_seed',
            url: 'https://signal.example/',
            platform: 'website',
            crawl: { maxPages: 1, maxDepth: 1 },
          },
        ],
      },
      {
        repository,
        fetchSnapshot: async (url) => {
          if (url === 'https://signal.example/') {
            return {
              normalizedUrl: url,
              html: rootHtml,
              contentType: 'text/html',
              fetchedAt: NOW,
            };
          }
          crawlRequests.push(url);
          throw new Error('simulated crawl failure');
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(crawlRequests.length).toBeLessThanOrEqual(3);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('Brand Vault crawler stopped after 3 crawl fetch attempts'),
    ]));
  });

  it('turns uploaded brand books and assets into reviewable draft signal evidence', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();

    const result = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        brandId: 'brand_signal',
        websiteUrl: 'signal.example',
        jobId: 'job_uploads',
        profileRecordId: 'draft_uploads',
        now: NOW,
        sourceEvidence: [
          {
            kind: 'uploaded_guideline',
            name: 'brand-book.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 420_000,
            text: [
              'Color palette: #102033 #ffcc33 #f7f7f7',
              'Tone: precise, editorial, operator-first.',
              'Do not use stock-photo language.',
              'Avoid neon gradients.',
            ].join('\n'),
            assetRole: 'brand_book',
          },
          {
            kind: 'uploaded_asset',
            name: 'primary-logo.svg',
            url: 'https://signal.example/assets/primary-logo.svg',
            mimeType: 'image/svg+xml',
            dominantColors: ['#102033', '#ffcc33'],
            assetRole: 'logo',
          },
        ],
      },
      {
        repository,
        fetchOptions: {
          fetchFn: async () => htmlResponse(),
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    const stagedGuideline = result.candidates.find(
      (candidate) => candidate.extractorId === 'brand-vault-source-staging.v1' && candidate.sourceField === 'sourceEvidence.0.uploaded_guideline',
    );
    expect(stagedGuideline?.normalizedValue).toMatchObject({
      kind: 'uploaded_guideline',
      mimeType: 'application/pdf',
      sizeBytes: 420_000,
      textLength: 135,
      assetRole: 'brand_book',
      status: 'staged',
    });

    const uploadCandidates = result.candidates.filter((candidate) => candidate.extractorId === 'brand-vault-upload-evidence.v1');
    expect(uploadCandidates.map((candidate) => candidate.sourceField)).toEqual(
      expect.arrayContaining([
        'sourceEvidence.0.uploaded_guideline.colors',
        'sourceEvidence.0.uploaded_guideline.brandRules',
        'sourceEvidence.0.uploaded_guideline.voiceGuidelines',
        'sourceEvidence.1.uploaded_asset.colors',
        'sourceEvidence.1.uploaded_asset.logoAsset',
      ]),
    );
    expect(uploadCandidates.find((candidate) => candidate.sourceField === 'sourceEvidence.0.uploaded_guideline.colors')?.normalizedValue).toEqual([
      '#102033',
      '#ffcc33',
      '#f7f7f7',
    ]);
    expect(uploadCandidates.find((candidate) => candidate.sourceField === 'sourceEvidence.0.uploaded_guideline.brandRules')?.signalPath).toBe(
      'voice.killList',
    );
    expect(uploadCandidates.find((candidate) => candidate.sourceField === 'sourceEvidence.0.uploaded_guideline.brandRules')?.normalizedValue).toEqual(
      expect.arrayContaining(['Do not use stock-photo language', 'Avoid neon gradients.']),
    );
    expect(uploadCandidates.find((candidate) => candidate.sourceField === 'sourceEvidence.0.uploaded_guideline.voiceGuidelines')?.signalPath).toBe(
      'voice.recurringPhrases',
    );
    expect(uploadCandidates.find((candidate) => candidate.sourceField === 'sourceEvidence.1.uploaded_asset.logoAsset')?.signalPath).toBe(
      'assets.logoCandidates',
    );
    expect(result.profile.palette.supporting.value).toEqual(expect.arrayContaining(['#102033', '#ffcc33', '#f7f7f7']));
    expect(result.profile.palette.supporting.trustLevel).toBe('uploaded_brand_guideline');
    expect(result.profile.voice.killList.value).toEqual(
      expect.arrayContaining(['Do not use stock-photo language', 'Avoid neon gradients.']),
    );
    expect(result.profile.voice.killList.trustLevel).toBe('uploaded_brand_guideline');
    expect(result.profile.voice.recurringPhrases.value).toEqual(
      expect.arrayContaining(['Tone: precise, editorial, operator-first']),
    );
    expect(result.profile.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          signalPath: 'voice.killList',
          trustLevel: 'uploaded_brand_guideline',
          authorityClass: 'brand_constraint',
        }),
      ]),
    );
    expect(result.job.warnings).toContain('7 additional Brand Vault sources staged for enrichment and evidence review.');
    expect(result.reviewPayload.intake.uploads).toMatchObject({
      status: 'complete',
      guidelineCount: 1,
      assetCount: 1,
      parsedColorCandidateCount: 2,
      parsedTextCandidateCount: 2,
      logoCandidateCount: 1,
    });
    expect(result.reviewPayload.intake.sources.byKind).toMatchObject({
      uploaded_guideline: 1,
      uploaded_asset: 1,
    });
    expect(result.reviewPayload.intake.evidenceLanes.find((lane) => lane.id === 'uploads')).toMatchObject({
      status: 'complete',
      sourceCount: 2,
    });
  });

  it('does not fetch or persist when the website URL is unsupported', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();
    let fetchCalls = 0;

    const result = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        websiteUrl: 'mailto:hello@signal.example',
        jobId: 'job_bad_url',
        now: NOW,
      },
      {
        repository,
        fetchOptions: {
          fetchFn: async () => {
            fetchCalls += 1;
            return htmlResponse();
          },
        },
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Invalid URL should not produce a draft.');
    expect(result.error.code).toBe('invalid_url');
    expect(result.job.status).toBe('failed');
    expect(fetchCalls).toBe(0);
    expect(repository.listRecords()).toHaveLength(0);
  });

  it('returns a failed job when the website fetch fails', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();

    const result = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        websiteUrl: 'signal.example',
        jobId: 'job_fetch_fail',
        now: NOW,
      },
      {
        repository,
        fetchOptions: {
          fetchFn: async () => htmlResponse(500),
        },
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Failed fetch should not produce a draft.');
    expect(result.error.code).toBe('fetch_failed');
    expect(result.error.message).toBe('Website fetch failed with HTTP 500.');
    expect(result.job.inputs.websiteUrl).toBe('https://signal.example/');
    expect(repository.listRecords()).toHaveLength(0);
  });

  it('creates a source-evidence draft when the website fetch fails but social evidence exists', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();

    const result = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        brandId: 'brand_chai',
        companyName: 'Chaayos',
        websiteUrl: 'chaayos.example',
        socialLinks: ['https://www.instagram.com/chaayos'],
        sourceEvidence: [
          {
            kind: 'crawl_seed',
            url: 'chaayos.example',
            platform: 'website',
            evidenceOrigin: 'user_supplied',
          },
          {
            kind: 'social_post',
            url: 'https://www.instagram.com/p/chaayos-test/',
            platform: 'instagram',
            name: 'Chaayos',
            text: 'Kadak chai, bun maska, mango matcha, cafe reels, monsoon comfort.',
            evidenceOrigin: 'public_fallback',
            connection: {
              provider: 'alyzitron_apify',
              status: 'public_fallback_available',
              accountHandle: 'chaayos',
              canReadProfile: false,
              canReadPosts: true,
              canReadPinned: false,
              matchStatus: 'matched',
            },
          },
        ],
        jobId: 'job_fetch_fail_social_fallback',
        profileRecordId: 'draft_fetch_fail_social_fallback',
        now: NOW,
      },
      {
        repository,
        fetchOptions: {
          fetchFn: async () => htmlResponse(500),
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.job.status).toBe('needs_review');
    expect(result.job.warnings.some((warning) => warning.includes('Website fetch failed'))).toBe(true);
    expect(result.record.id).toBe('draft_fetch_fail_social_fallback');
    expect(result.profile.identity.brandName.value).toBe('Chaayos');
    expect(result.candidates.some((candidate) => candidate.sourceType === 'social_post')).toBe(true);
    expect(result.reviewPayload.candidateCount).toBeGreaterThan(0);
    expect(result.reviewPayload.intake.website.status).toBe('failed');
    expect(result.reviewPayload.intake.website.evidenceCount).toBe(0);
    expect(result.reviewPayload.intake.social.status).toBe('needs_review');
    expect(result.reviewPayload.intake.social.publicFallbackPostCount).toBe(1);
    expect(repository.listRecords()).toHaveLength(1);
  });

  it('keeps accept, reject, and latest profile operations behind the Brand Vault boundary', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();
    const draft = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        brandId: 'brand_signal',
        websiteUrl: 'signal.example',
        jobId: 'job_accept',
        profileRecordId: 'draft_accept',
        now: NOW,
      },
      {
        repository,
        fetchOptions: {
          fetchFn: async () => htmlResponse(),
        },
      },
    );
    if (!draft.ok) throw new Error(draft.error.message);

    const accepted = acceptBrandVaultSignalProfileDraft(repository, 'draft_accept', {
      actorId: 'brand_manager',
      now: '2026-06-09T05:05:00.000Z',
    });

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) throw new Error('Expected accepted draft.');
    expect(accepted.record.status).toBe('accepted');
    expect(getLatestAcceptedBrandVaultProfile(repository, { brandId: 'brand_signal', userId: 'user_signal' })?.identity.brandName.value).toBe(
      'Signal House',
    );

    const rejectDraft = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        brandId: 'brand_signal',
        websiteUrl: 'signal.example',
        jobId: 'job_reject',
        profileRecordId: 'draft_reject',
        now: '2026-06-09T05:10:00.000Z',
      },
      {
        repository,
        fetchOptions: {
          fetchFn: async () => htmlResponse(),
        },
      },
    );
    if (!rejectDraft.ok) throw new Error(rejectDraft.error.message);

    const rejected = rejectBrandVaultSignalProfileDraft(repository, 'draft_reject', 'Wrong client site.', {
      actorId: 'brand_manager',
      now: '2026-06-09T05:15:00.000Z',
    });

    expect(rejected.ok).toBe(true);
    if (!rejected.ok) throw new Error('Expected rejected draft.');
    expect(rejected.record.status).toBe('rejected');
    expect(rejected.record.review.rejectionReason).toBe('Wrong client site.');
  });
});
