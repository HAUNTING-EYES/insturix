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
      .hero { display: grid; gap: 24px; justify-content: center; border-radius: 24px; box-shadow: 0 24px 60px rgba(16, 32, 51, 0.18); }
      .metric-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
      .chart-panel { border-radius: 18px; background: linear-gradient(135deg, #102033, #ff6a00); }
      .cta { background: rgb(255, 106, 0); transition-duration: 180ms; transition-property: transform; transition-timing-function: cubic-bezier(.2, .8, .2, 1); }
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
    <main class="hero">
      <h1>Turn pipeline data into 3x faster decisions</h1>
      <h2>Trusted dashboards for revenue teams</h2>
      <section class="metric-grid dashboard analytics data-viz">
        <article class="chart-panel">Pipeline velocity chart</article>
        <article>Forecast accuracy metric</article>
        <article>Revenue risk graph</article>
      </section>
      <a class="cta" href="/demo">Book a demo</a>
      <button>Start free</button>
      <blockquote class="testimonial">Trusted by 500 SaaS teams to improve forecast accuracy.</blockquote>
      <img alt="Northstar logo" src="/logo-mark.svg">
    </main>
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

  it('rejects private network website targets before fetching', async () => {
    let fetchCount = 0;
    await expect(
      fetchWebsiteBrandSnapshot('http://127.0.0.1:3000/admin', {
        fetchFn: async () => {
          fetchCount += 1;
          return new Response(HTML, { status: 200, headers: { 'content-type': 'text/html' } });
        },
      }),
    ).rejects.toThrow('Brand Vault cannot scan private or local network targets.');
    await expect(
      fetchWebsiteBrandSnapshot('http://localhost:3000/admin', {
        fetchFn: async () => {
          fetchCount += 1;
          return new Response(HTML, { status: 200, headers: { 'content-type': 'text/html' } });
        },
      }),
    ).rejects.toThrow('Brand Vault cannot scan private or local network targets.');
    expect(fetchCount).toBe(0);
  });

  it('rejects redirects into private network targets before following them', async () => {
    const fetchedUrls: string[] = [];
    await expect(
      fetchWebsiteBrandSnapshot('https://northstar.example', {
        fetchFn: async (url) => {
          fetchedUrls.push(url);
          return new Response('', {
            status: 302,
            headers: { location: 'http://169.254.169.254/latest/meta-data/' },
          });
        },
      }),
    ).rejects.toThrow('Brand Vault cannot scan private or local network targets.');
    expect(fetchedUrls).toEqual(['https://northstar.example/']);
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
    expect(result.profile.identity.industry?.value).toBe('B2B analytics');
    expect(result.profile.identity.industry?.value).not.toBe('Organization');
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
    const emotionalArcCandidate = result.candidates.find((candidate) => candidate.signalPath === 'narrative.emotionalArc');
    const anticipationCandidate = result.candidates.find((candidate) => candidate.signalPath === 'motion.anticipationStyle');
    const safeZonesCandidate = result.candidates.find((candidate) => candidate.signalPath === 'composition.safeZones');
    expect(dataVizCandidate?.normalizedValue).toBe(result.profile.visual.dataVizAffinity.value);
    expect(dataVizCandidate?.normalizedValue).toBeGreaterThan(0.5);
    expect(dataVizCandidate?.sourceField).toBe('website.visualPrimitives');
    expect(dataVizCandidate?.rawValue).toMatchObject({
      'website.data_viz_density': expect.any(Number),
      'website.element_density': expect.any(Number),
    });
    expect(motionEnergyCandidate?.normalizedValue).toBe(result.profile.motion.motionEnergy.value);
    expect(motionEnergyCandidate?.sourceField).toBe('website.motionPrimitives');
    expect(motionEnergyCandidate?.rawValue).toMatchObject({
      'website.motion_intensity': expect.any(Number),
      'website.transition_density': expect.any(Number),
    });
    expect(result.profile.narrative.emotionalArc.trustLevel).toBe('first_party_website');
    expect(emotionalArcCandidate?.sourceField).toBe('website.copy');
    expect(anticipationCandidate?.normalizedValue).toBe(result.profile.motion.anticipationStyle.value);
    expect(anticipationCandidate?.sourceField).toBe('website.motionPrimitives');
    expect(safeZonesCandidate?.normalizedValue).toBe(result.profile.composition.safeZones.value);
    expect(safeZonesCandidate?.sourceField).toBe('website.visualPrimitives');

    const validation = validateBrandSignalProfile(result.profile);
    expect(validation.valid).toBe(true);
    expect(validation.warnings.some((issue) => issue.path === 'voice.killList')).toBe(true);
  });

  it('uses the scanned site identity instead of an affiliated off-domain organization in JSON-LD', () => {
    const result = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://nimitgotnolimit.example',
      brandId: 'brand_personal_site',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_personal_site',
      html: `
        <!doctype html>
        <html>
          <head>
            <title>Nimit Jain, Founder & CEO of Insturix</title>
            <meta property="og:site_name" content="Nimit Jain">
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@graph": [
                  {
                    "@type": "Person",
                    "@id": "https://nimitgotnolimit.example/#nimit",
                    "name": "Nimit Jain",
                    "url": "https://nimitgotnolimit.example/",
                    "worksFor": { "@id": "https://insturix.example/#organization" }
                  },
                  {
                    "@type": "Organization",
                    "@id": "https://insturix.example/#organization",
                    "name": "Insturix",
                    "url": "https://insturix.example/"
                  },
                  {
                    "@type": "WebSite",
                    "@id": "https://nimitgotnolimit.example/#website",
                    "name": "Nimit Jain",
                    "url": "https://nimitgotnolimit.example/",
                    "publisher": { "@id": "https://nimitgotnolimit.example/#nimit" }
                  }
                ]
              }
            </script>
          </head>
          <body><h1>Nimit Jain</h1></body>
        </html>
      `,
    });

    expect(result.profile.identity.brandName).toMatchObject({
      value: 'Nimit Jain',
      trustLevel: 'first_party_website',
    });
    expect(result.candidates.find((candidate) => candidate.signalPath === 'identity.brandName')).toMatchObject({
      sourceType: 'json_ld',
      rawValue: 'Nimit Jain',
    });
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

  it('ignores CSS variable fallback chains when extracting brand typography', () => {
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
        --font-sans: "Plus Jakarta Sans";
        --font-mono: "JetBrains Mono";
        --default-font-family: var(--font-sans), var(--font-mono), sans-serif;
      }
      body { font-family: var(--font-sans), "Plus Jakarta Sans", system-ui, sans-serif; }
      code { font-family: var(--font-mono), "JetBrains Mono", monospace; }
      .wordmark { font-family: Blanka, var(--font-caveat), cursive; }
    </style>
  </head>
  <body>
    <h1>One platform for agency production</h1>
  </body>
</html>
`,
      brandId: 'brand_insturix',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_font_variable_noise',
    });

    expect(result.profile.typography.raw?.value).toBe('Plus Jakarta Sans, JetBrains Mono, Blanka');
    expect(result.profile.typography.raw?.value).not.toContain('var(');
    expect(result.profile.typography.raw?.value).not.toContain('default-font-family');
  });

  it('keeps plural client ICPs from comma-separated homepage audience claims', () => {
    const result = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://insturix.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>Insturix - Automated content production</title>
    <meta name="description" content="Insturix is an automated content production platform for agencies, in-house teams, businesses, enterprises, creator houses, and filmmakers.">
    <style>
      body { font-family: "Plus Jakarta Sans", sans-serif; color: #d4a652; background: #0b0b0f; }
    </style>
  </head>
  <body>
    <h1>Automated content production for agencies, in-house teams, businesses, enterprises, creator houses, and filmmakers.</h1>
    <p>Help us keep the floor running and accessible.</p>
    <p>The standard for production-grade tools.</p>
    <p>30-second launch for a premium specialty coffee brand.</p>
    <p>AI-assisted editing helps with the editing stage.</p>
    <p>For simple projects, that path can be informal.</p>
    <p>Agencies scale by keeping the production workflow connected.</p>
    <p>Scale multiple clients without creating more handoffs or brand drift.</p>
    <h2>One platform.Entire production.</h2>
    <h2>One platform. Entire production.</h2>
    <h2>Stay in the loop</h2>
  </body>
</html>
`,
      brandId: 'brand_insturix',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_insturix_audience',
    });

    expect(result.profile.identity.industry?.value).toBe('content production software');
    expect(result.profile.identity.audience.value).toEqual(expect.arrayContaining([
      'agencies',
      'in-house teams',
      'enterprises',
      'creator houses',
      'filmmakers',
    ]));
    expect(result.profile.identity.audience.value).not.toEqual(expect.arrayContaining([
      'us keep the floor running and accessible',
      'production-grade tools',
      'premium specialty coffee brand',
      'with the editing stage',
      'that path can be informal',
      'by keeping the production workflow connected',
      'multiple clients without creating more handoffs',
      'or brand drift',
    ]));
    expect(result.profile.voice.recurringPhrases.value).toContain('One platform. Entire production.');
    expect(result.profile.voice.recurringPhrases.value.filter((value) => value === 'One platform. Entire production.')).toHaveLength(1);
    expect(result.profile.voice.recurringPhrases.value).not.toContain('Stay in the loop');
  });

  it('does not treat homepage hook headings as product or service evidence', () => {
    const result = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://insturix.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>Insturix - Automated content production</title>
    <meta name="description" content="Insturix is an automated content production platform for agencies, in-house teams, businesses, enterprises, creator houses, and filmmakers.">
    <style>
      body { font-family: "Plus Jakarta Sans", sans-serif; color: #d4a652; background: #0b0b0f; }
    </style>
  </head>
  <body>
    <h1>Already have footage?</h1>
    <h2>The old way vs. Insturix</h2>
    <h2>Two paths. Same engine.</h2>
    <h2>For in-house teams</h2>
    <h2>For agencies</h2>
    <h2>Your vision. Not a version.</h2>
  </body>
</html>
`,
      brandId: 'brand_insturix',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_insturix_product_service_hooks',
    });

    expect(result.profile.identity.productServices?.value).toEqual(['automated content production platform']);
    expect(result.profile.identity.productServices?.value).not.toEqual(expect.arrayContaining([
      'Already have footage?',
      'The old way vs',
      'Two paths',
      'Same engine',
      'For in-house teams',
      'For agencies',
      'Your vision',
      'Not a version',
    ]));
    expect(result.candidates.find((candidate) => candidate.signalPath === 'identity.productServices')).toMatchObject({
      sourceField: 'website.productServices',
      normalizedValue: ['automated content production platform'],
    });
  });

  it('keeps embedded product editor chrome out of root website copy evidence', () => {
    const result = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://insturix.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>Insturix - Automated content production</title>
    <meta name="description" content="Insturix is an automated content production platform for agencies, in-house teams, businesses, enterprises, creator houses, and filmmakers.">
    <style>
      body { font-family: "Plus Jakarta Sans", sans-serif; color: #d4a652; background: #0b0b0f; }
    </style>
  </head>
  <body>
    <main>
      <h1>One platform. Entire production.</h1>
      <p>Insturix helps agencies and in-house teams move from brief to publish without disconnected tools.</p>
      <section class="product-mockup">
        <h2>LAYERS</h2>
        <button>Export</button>
        <button>Script</button>
        <button>Media</button>
        <button>Captions</button>
        <button>Music</button>
        <button>Graphics</button>
        <button>Thumbnails</button>
        <p>PIPELINE Input Script Edit Analyze Thumbnails Publish FILM STRIP EXPOSING</p>
      </section>
      <section data-testid="timeline-preview">
        <span>0</span><span>:</span><span>0</span><span>Export</span><span>LAYERS</span>
      </section>
      <div><span>Export</span><span>LAYERS</span><span>Script</span><span>Media</span></div>
    </main>
  </body>
</html>
`,
      brandId: 'brand_insturix',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_insturix_editor_chrome',
    });

    const websiteCopy = result.candidates
      .filter((candidate) => candidate.sourceField === 'website.copy' || candidate.sourceField === 'website.proofSnippets')
      .map((candidate) => `${candidate.rawValue ?? ''} ${candidate.excerpt ?? ''}`)
      .join(' ');

    expect(result.profile.identity.industry?.value).toBe('content production software');
    expect(result.profile.identity.audience.value).toEqual(expect.arrayContaining(['agencies', 'in-house teams']));
    expect(result.profile.voice.recurringPhrases.value).toContain('One platform. Entire production.');
    expect(websiteCopy).toContain('brief to publish');
    expect(websiteCopy).not.toMatch(/\b(?:Export|LAYERS|Captions|Thumbnails|PIPELINE|FILM STRIP|EXPOSING)\b/i);
  });

  it('prefers enterprise-tech and D2C vertical taxonomy over generic software or commerce', () => {
    const semiconductor = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://nvidia.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>NVIDIA - Accelerated computing</title>
    <meta name="description" content="NVIDIA builds semiconductors, GPUs, silicon processors, and AI infrastructure for data centers.">
  </head>
  <body>
    <h1>Accelerated computing for data centers</h1>
    <p>Our semiconductor platforms power advanced AI infrastructure.</p>
  </body>
</html>
`,
      brandId: 'brand_nvidia',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_semiconductor_taxonomy',
    });

    expect(semiconductor.profile.identity.industry?.value).toBe('semiconductors');
    expect(semiconductor.profile.identity.category.value).toBe('semiconductors');

    const hardware = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://hp.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>HP - PCs, printers, and peripherals</title>
    <meta name="description" content="Technology hardware, storage systems, personal computers, printers, and peripherals for homes and businesses.">
  </head>
  <body>
    <h1>Hardware platforms for work and play</h1>
    <p>Build reliable device fleets with PCs, workstations, printers, memory, and connected peripherals.</p>
  </body>
</html>
`,
      brandId: 'brand_hp',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_hardware_taxonomy',
    });

    expect(hardware.profile.identity.industry?.value).toBe('hardware/electronics');
    expect(hardware.profile.identity.category.value).toBe('hardware/electronics');

    const consulting = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://accenture.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>Accenture - Technology consulting</title>
    <meta name="description" content="Technology consulting, managed services, systems integration, and digital transformation for enterprises.">
  </head>
  <body>
    <h1>Reinvent enterprise technology with consulting and managed services</h1>
  </body>
</html>
`,
      brandId: 'brand_accenture',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_it_services_taxonomy',
    });

    expect(consulting.profile.identity.industry?.value).toBe('IT services');
    expect(consulting.profile.identity.category.value).toBe('IT services');

    const beauty = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://drsheths.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>Dr. Sheth's - Skincare</title>
    <meta name="description" content="Dermatologist-formulated skincare, sunscreen, serum, and moisturiser for Indian skin.">
  </head>
  <body>
    <h1>Daily skincare for sensitive skin</h1>
    <button>Shop now</button>
  </body>
</html>
`,
      brandId: 'brand_beauty',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_beauty_taxonomy',
    });

    expect(beauty.profile.identity.industry?.value).toBe('beauty/personal care');
    expect(beauty.profile.identity.category.value).toBe('beauty/personal care');

    const fashion = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://libas.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>Libas - Ethnic wear</title>
    <meta name="description" content="Fashion, ethnic wear, kurtas, sarees, dresses, and apparel for women.">
  </head>
  <body>
    <h1>Fresh festive wear for women</h1>
    <a href="/new">New arrivals</a>
  </body>
</html>
`,
      brandId: 'brand_fashion',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_fashion_taxonomy',
    });

    expect(fashion.profile.identity.industry?.value).toBe('fashion/apparel');
    expect(fashion.profile.identity.category.value).toBe('fashion/apparel');

    const consumerElectronics = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://boat.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>boAt - Audio electronics</title>
    <meta name="description" content="Consumer electronics, earbuds, headphones, speakers, smartwatches, chargers, and cables for everyday use.">
  </head>
  <body>
    <h1>Audio electronics for music, calls, workouts, and gaming</h1>
    <a href="/collections">Shop now</a>
  </body>
</html>
`,
      brandId: 'brand_boat',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_consumer_electronics_taxonomy',
    });

    expect(consumerElectronics.profile.identity.industry?.value).toBe('electronics/appliances');
    expect(consumerElectronics.profile.identity.category.value).toBe('electronics/appliances');
  });

  it('keeps specific vertical taxonomy when broad pages contain generic navigation noise', () => {
    const electronics = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://devices.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>Devices Store - Consumer electronics</title>
    <meta name="description" content="Phones, laptops, tablets, watches, earbuds, personal computers, and consumer electronics for work, school, and creative pros.">
  </head>
  <body>
    <h1>Shop latest devices</h1>
    <p>Store checkout catalog retail shop shop shop.</p>
    <p>Hardware devices for students, families, and creative professionals.</p>
  </body>
</html>
`,
      brandId: 'brand_devices',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_noisy_hardware_taxonomy',
    });

    expect(electronics.profile.identity.industry?.value).toBe('hardware/electronics');
    expect(electronics.profile.identity.category.value).toBe('hardware/electronics');
    expect(electronics.profile.identity.audience.value).toEqual(expect.arrayContaining(['creative professionals', 'families', 'students']));

    const creativeSoftware = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://creative-suite.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>Creative Suite - Creative software</title>
    <meta name="description" content="Creative software apps for designers, marketers, video editors, photographers, and creative teams.">
  </head>
  <body>
    <h1>Design, video, PDF, and marketing software</h1>
    <p>Apps and cloud platform for creative teams and businesses.</p>
    <p>Creative campaign content studio production creative campaign content studio production.</p>
  </body>
</html>
`,
      brandId: 'brand_creative_suite',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_noisy_creative_software_taxonomy',
    });

    expect(creativeSoftware.profile.identity.industry?.value).toBe('creative software');
    expect(creativeSoftware.profile.identity.category.value).toBe('software');
    expect(creativeSoftware.profile.identity.audience.value).toEqual(expect.arrayContaining(['creative teams', 'video editors']));
    const framework = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://open-ui-framework.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>Open UI Framework - JavaScript library</title>
    <meta name="description" content="A JavaScript library for web and native user interfaces, reusable components, developer tools, and app frameworks.">
  </head>
  <body>
    <h1>Build web and native user interfaces out of components</h1>
    <p>Creative content examples and studio docs should not make this a creative services company.</p>
  </body>
</html>
`,
      brandId: 'brand_open_ui_framework',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_noisy_framework_taxonomy',
    });

    expect(framework.profile.identity.industry?.value).toBe('software');
    expect(framework.profile.identity.category.value).toBe('software');
    expect(framework.profile.identity.industry?.value).not.toBe('creative software');
    const reactFramework = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://react-framework.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>Next.js by Vercel - The React Framework</title>
    <meta name="description" content="A full-stack React framework for the web, high-quality web applications, React components, server and client data fetching, route handlers, and developer tools.">
  </head>
  <body>
    <h1>The React Framework for the Web</h1>
    <p>Build web applications with reusable React components, advanced routing patterns, and UI layouts.</p>
    <p>Customer testimonials mention consistent 60fps UI animations, but this is still software, not hardware electronics.</p>
  </body>
</html>
`,
      brandId: 'brand_react_framework',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_noisy_react_framework_taxonomy',
    });

    expect(reactFramework.profile.identity.industry?.value).toBe('software');
    expect(reactFramework.profile.identity.category.value).toBe('software');
    expect(reactFramework.profile.identity.category.value).not.toBe('hardware/electronics');
  });

  it('classifies broad-scan thin-page verticals without brand-name special cases', () => {
    const industrial = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://industrial.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>Industrial systems company</title>
    <meta name="description" content="Diversified technology and engineered products for industrial growth markets, instrumentation, imaging systems, and test and measurement teams.">
  </head>
  <body><h1>Industrial technology for critical equipment markets</h1></body>
</html>
`,
      brandId: 'brand_industrial',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_industrial_taxonomy',
    });

    expect(industrial.profile.identity.industry?.value).toBe('hardware/electronics');
    expect(industrial.profile.identity.category.value).toBe('hardware/electronics');

    const botanicalCare = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://botanical-care.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>Botanical Care - Hair and skin essentials</title>
    <meta name="description" content="Botanical care products for hair fall, anti-aging, skin brightening, shampoo, body wash, and personal care routines.">
  </head>
  <body><h1>Natural beauty routines for skin and hair</h1></body>
</html>
`,
      brandId: 'brand_botanical_care',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_botanical_care_taxonomy',
    });

    expect(botanicalCare.profile.identity.industry?.value).toBe('beauty/personal care');
    expect(botanicalCare.profile.identity.category.value).toBe('beauty/personal care');

    const fashion = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://style-market.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>Style Market - Women's fashion</title>
    <meta name="description" content="Women's fashion with dresses, co-ords, tops, bottoms, and everyday wardrobe drops.">
  </head>
  <body><h1>New-season style for modern wardrobes</h1></body>
</html>
`,
      brandId: 'brand_style_market',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_style_market_taxonomy',
    });

    expect(fashion.profile.identity.industry?.value).toBe('fashion/apparel');
    expect(fashion.profile.identity.category.value).toBe('fashion/apparel');

    const beverage = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://drink-maker.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>Drink Maker - Traditional Indian drinks</title>
    <meta name="description" content="Traditional Indian drinks, fruit drinks, nuts, seeds, berries, and memories for everyday beverage occasions.">
  </head>
  <body><h1>Drinks and memories for families and food lovers</h1></body>
</html>
`,
      brandId: 'brand_drink_maker',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_drink_maker_taxonomy',
    });

    expect(beverage.profile.identity.industry?.value).toBe('food/beverage');
    expect(beverage.profile.identity.category.value).toBe('food/beverage');
  });

  it('does not classify investor-relations boilerplate as the brand industry', () => {
    const result = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://industrial-holdco.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>Investor Relations | Industrial HoldCo</title>
    <meta name="description" content="Investor relations website for stockholders, potential investors, and financial analysts.">
  </head>
  <body>
    <h1>Investor Relations</h1>
    <p>Recent financial results, quarterly financial information, earnings webcast, dividend, stock quote, SEC filings, and annual reports.</p>
  </body>
</html>
`,
      brandId: 'brand_investor_noise',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_investor_taxonomy_noise',
    });

    expect(result.profile.identity.industry).toBeUndefined();
    expect(result.profile.identity.category.value).toBe('unknown');
  });

  it('filters ecommerce, browser, and markup junk from consumer audience signals', () => {
    const result = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://consumer.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>Everyday SPF - Personal care</title>
    <meta name="description" content="Skincare essentials made for women with sensitive skin and men building daily grooming routines.">
  </head>
  <body>
    <h1>Clean SPF for sensitive skin</h1>
    <p>Made for women with sensitive skin, men building daily grooming routines, and parents shopping for kids.</p>
    <p>All your Chai Cravings in one place. For any queries or issues, contact customer care.</p>
    <section class="product-grid">
      <a href="/products/valerie">women"> VALERIE SHOULDER BAG No reviews MRP Rs. 22,500 Add to cart Wishlist</a>
    </section>
    <p>Please use a different browser to view this site. raw = await resp; document.querySelector(".product-card")</p>
    <button>Shop now</button>
  </body>
</html>
`,
      brandId: 'brand_consumer',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_consumer_audience_noise',
    });

    const audience = result.profile.identity.audience.value;
    expect(audience).toEqual(expect.arrayContaining(['women']));
    expect(audience.join(' | ')).not.toMatch(/wishlist|MRP|No reviews|VALERIE|browser|document|raw =|product-card|Shop now|Chai Cravings|queries or issues|customer care/i);
    expect(result.profile.voice.recurringPhrases.value.join(' | ')).not.toMatch(/Shop now|Add to cart|Wishlist|No reviews/i);
  });

  it('extracts concrete audience entity phrases without using generic defaults', () => {
    const result = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://edgebrand.example',
      html: `
<!doctype html>
<html>
  <head><title>EdgeBrand security platform</title></head>
  <body>
    <h1>Secure apps and APIs across every edge</h1>
    <p>Enterprise IT teams protect customer journeys with edge security, bot defense, and API protection.</p>
    <p>Women's skincare routines need gentle daily care, not noisy product-card copy.</p>
  </body>
</html>
`,
      brandId: 'brand_edgebrand',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_entity_audience',
    });

    const audience = result.profile.identity.audience.value;
    expect(audience).toEqual(expect.arrayContaining(['Enterprise IT teams', 'Women']));
    expect(audience).not.toEqual(expect.arrayContaining(['teams']));
  });

  it('filters broad-scan audience junk without hiding real customer groups', () => {
    const result = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://broad-scan.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>SignalWorks - Infrastructure software</title>
    <meta name="description" content="Infrastructure software for enterprise IT teams, security leaders, and ecommerce operators.">
  </head>
  <body>
    <h1>Keep enterprise systems reliable</h1>
    <p>Built for enterprise IT teams, security leaders, and ecommerce operators.</p>
    <p>Used by AI guided recommendations, online store members, NVIDIA Vera Rubin, and local content.</p>
    <p>Trusted by You at Your Nearest HP World Store, latest Intel Core CPUs, and newest 8K polling rate keyboard for gameplay.</p>
    <p>Made for working of basic functionalities of the website and life today - and tomorrow.</p>
    <p>Created for first three months and please visit the site.</p>
    <p>Created for climate goals isn't a 30-year goal - it is now.</p>
    <p>Designed for early Sale access plus tailored new arrivals and updates on new arrivals.</p>
  </body>
</html>
`,
      brandId: 'brand_broad_scan',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_broad_scan_audience_noise',
    });

    const audience = result.profile.identity.audience.value;
    expect(audience).toEqual(expect.arrayContaining(['enterprise IT teams', 'security leaders', 'ecommerce operators']));
    expect(audience.join(' | ')).not.toMatch(
      /AI guided recommendations|online store members|NVIDIA Vera Rubin|local content|Nearest HP World Store|Intel Core|8K polling|basic functionalities|life today|first three months|please visit|tailored new arrivals|updates on new arrivals|climate goals|30-year goal/i,
    );
  });

  it('keeps product-card, payment, and generic page-copy noise out without brand-specific exceptions', () => {
    const personalCare = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://general-care.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>General Care - Skin and hair routines</title>
    <meta name="description" content="Dermatologist-tested skincare and haircare for women with sensitive skin and men building grooming routines.">
  </head>
  <body>
    <h1>Personal care for women with sensitive skin and men building grooming routines</h1>
    <p>For better experience and exclusive features, please open your Gpay app on next step.</p>
    <p>Trusted by Dark Spots & Pigmentation - 100ml (Pack of 2), SPF 50 sunscreen, and Clear & Bright Skin.</p>
    <p>Premium Diwali Gift Hamper for Family & Friends. All skin types No SLS and Parabens.</p>
    <p>Beard precision and U-shape for body trimming. Control oil and keep your skin clear & bright.</p>
    <p>Made for beard and Women | Scentsutra collection labels.</p>
    <p>Fast and convenient charging even, for your body and a nose & ears attachment for a neat finish. Easy cleaning under water.</p>
    <p>Buy 1 Get 1 FREE when you pay online. Add items worth Rs.399 to get FREE DELIVERY.</p>
  </body>
</html>
`,
      brandId: 'brand_general_care',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_generalized_noise',
    });

    expect(personalCare.profile.identity.industry?.value).toBe('beauty/personal care');
    expect(personalCare.profile.identity.category.value).toBe('beauty/personal care');
    expect(personalCare.profile.identity.audience.value).toEqual(expect.arrayContaining(['women']));
    expect(personalCare.profile.identity.audience.value.join(' | ')).not.toMatch(
      /better experience|exclusive features|Gpay|Dark Spots|100ml|Pack of 2|SPF 50|gift hamper|No SLS|Parabens|body trimming|control oil|clear & bright|Women \| Scentsutra|\bbeard\b|charging|nose & ears attachment|Easy cleaning under water|pay online|FREE DELIVERY/i,
    );

    const software = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://design-systems.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>Design Systems - Product development software</title>
    <meta name="description" content="Product development software for product teams and engineering teams.">
  </head>
  <body>
    <h1>Software for product teams and engineering teams</h1>
    <p>Accessibility resources for children and families are part of our community program.</p>
  </body>
</html>
`,
      brandId: 'brand_design_systems',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_generic_children_noise',
    });

    expect(software.profile.identity.industry?.value).toBe('product management software');
    expect(software.profile.identity.category.value).toBe('software');
    expect(software.profile.identity.category.value).not.toBe('baby/kids');
  });
  it('keeps multi-site website fixtures free of generic audience, CTA, and font noise', () => {
    const payments = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://stripe.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>Stripe - Financial infrastructure</title>
    <meta name="description" content="Stripe builds financial infrastructure for businesses of all sizes.">
  </head>
  <body>
    <h1>Financial infrastructure to grow your revenue</h1>
    <h2>Flexible solutions for every business model</h2>
    <p>Build flexible billing models and manage payments globally.</p>
    <p>Stripe helps all types of businesses accept payments.</p>
  </body>
</html>
`,
      brandId: 'brand_stripe',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_payments_fixture',
    });

    expect(payments.profile.identity.industry?.value).toBe('finance');
    expect(payments.profile.identity.audience.value).toEqual(expect.arrayContaining(['businesses of all sizes', 'all types of businesses']));
    expect(payments.profile.identity.audience.value.join(' | ')).not.toMatch(/build flexible billing models and|accept payments|payments$/i);

    const design = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://figma.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>Figma - Design software</title>
    <meta name="description" content="Figma is design software for devs and designers building meaningful products.">
  </head>
  <body>
    <h1>Make anything possible, all in Figma</h1>
    <p>Resources for video.</p>
    <p>Create one source of truth for devs and designers.</p>
  </body>
</html>
`,
      brandId: 'brand_figma',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_design_fixture',
    });

    expect(design.profile.identity.industry?.value).toBe('creative software');
    expect(design.profile.identity.category.value).toBe('software');
    expect(design.profile.identity.industry?.value).not.toBe('Organization');
    expect(design.profile.identity.audience.value.some((value) => /devs and designers/i.test(value))).toBe(true);
    expect(design.profile.identity.audience.value).not.toContain('video');
    expect(design.profile.identity.audience.value).not.toContain('building meaningful products');

    const marketing = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://hubspot.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>HubSpot - Customer platform</title>
    <meta name="description" content="HubSpot is customer platform software for startups and small businesses.">
  </head>
  <body>
    <h1>The HubSpot Customer Platform</h1>
    <h2>Learn more about HubSpot's Starter Customer Platform</h2>
    <h2>Get started free with HubSpot's free tools</h2>
    <h2>Small Business Bundle</h2>
  </body>
</html>
`,
      brandId: 'brand_hubspot',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_marketing_fixture',
    });

    expect(marketing.profile.identity.audience.value).toEqual(expect.arrayContaining(['startups and small businesses']));
    expect(marketing.profile.voice.recurringPhrases.value).not.toEqual(expect.arrayContaining([
      "Learn more about HubSpot's Starter Customer Platform",
      "Get started free with HubSpot's free tools",
    ]));

    const retail = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://patagonia.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>Patagonia - Outdoor clothing and gear</title>
    <meta name="description" content="Outdoor clothing and gear for trail runners, climbers, and families.">
    <style>
      body { font-family: "Ridgeway Sans", sans-serif; }
      .article { font-family: "Copernicus", serif; }
      .icon { font-family: "swiper-icons"; }
      .utility { font-family: "object-fit\\: cover"; }
    </style>
  </head>
  <body>
    <h2>Be the nextAI all-star</h2>
    <h2>store they line up for</h2>
    <h1>Planet and culture</h1>
  </body>
</html>
`,
      brandId: 'brand_patagonia',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_retail_fixture',
    });

    expect(retail.profile.identity.industry?.value).toBe('fashion/apparel');
    expect(retail.profile.typography.raw?.value).toBe('Ridgeway Sans, Copernicus');
    expect(retail.profile.typography.raw?.value).not.toMatch(/icons|object-fit/i);
    expect(retail.profile.voice.recurringPhrases.value).toContain('Be the next AI all-star');
    expect(retail.profile.voice.recurringPhrases.value).not.toContain('store they line up for');
  });

  it('filters generated fallback font family names from compiled CSS', () => {
    const result = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://insturix.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>Insturix - Creative operating system</title>
    <meta name="description" content="Insturix helps agencies run content production at scale.">
    <style>
      body { font-family: "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", system-ui, sans-serif; }
      .headline { font-family: "Inter Fallback", "Space Grotesk", sans-serif; }
      code { font-family: "JetBrains Mono", "JetBrains Mono Fallback", monospace; }
    </style>
  </head>
  <body>
    <h1>One platform for agency production</h1>
  </body>
</html>
`,
      brandId: 'brand_insturix',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_fallback_fonts',
    });

    expect(result.profile.typography.raw?.value).toBe('Plus Jakarta Sans, Space Grotesk, JetBrains Mono');
    expect(result.profile.typography.raw?.value).not.toContain('Fallback');
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

  it('uses logo srcset and lazy sources without accepting product or preview image noise', () => {
    const result = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://northstar.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>Northstar Analytics</title>
    <meta property="og:image" content="/share/brand-card.jpg">
    <meta property="og:logo" content="/brand/primary-logo.svg">
  </head>
  <body>
    <img alt="Northstar wordmark logo" srcset="/assets/wordmark.png 1x, /assets/wordmark.svg 2x">
    <img class="product-card" src="/products/mark-product.png">
    <img alt="brand logo" data-src="/cdn/logo-dark.svg">
  </body>
</html>
`,
      brandId: 'brand_northstar',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_logo_srcset_noise',
    });

    const logoUrls = result.candidates
      .filter((candidate) => candidate.signalPath === 'assets.logoCandidates')
      .map((candidate) => candidate.normalizedValue);
    expect(logoUrls).toEqual(expect.arrayContaining([
      'https://northstar.example/assets/wordmark.svg',
      'https://northstar.example/cdn/logo-dark.svg',
      'https://northstar.example/brand/primary-logo.svg',
    ]));
    expect(logoUrls).not.toContain('https://northstar.example/products/mark-product.png');
    expect(logoUrls).not.toContain('https://northstar.example/share/brand-card.jpg');
  });

  it('uses header or home-link wrapper context for generic logo filenames', () => {
    const result = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://edgebrand.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>EdgeBrand</title>
    <meta property="og:image" content="/share/social-card.jpg">
  </head>
  <body>
    <header>
      <a href="/" aria-label="EdgeBrand home"><img src="/assets/edgebrand.svg" alt="EdgeBrand"></a>
    </header>
    <main><img class="product-card" src="/products/device.svg" alt="Edge appliance"></main>
  </body>
</html>
`,
      brandId: 'brand_edgebrand',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_logo_wrapper_context',
    });

    const logoCandidates = result.candidates.filter((candidate) => candidate.signalPath === 'assets.logoCandidates');
    expect(logoCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        normalizedValue: 'https://edgebrand.example/assets/edgebrand.svg',
        sourceField: 'website.logoWrapperImage',
      }),
    ]));
    expect(logoCandidates.map((candidate) => candidate.normalizedValue)).not.toContain('https://edgebrand.example/products/device.svg');
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

  it('downgrades asset candidates that resolve to HTML instead of image content', async () => {
    const result = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://northstar.example',
      html: `
<!doctype html>
<html>
  <head><title>Northstar Analytics</title></head>
  <body><img alt="Northstar logo" src="/assets/logo.svg"></body>
</html>
`,
      brandId: 'brand_northstar',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_asset_html_probe',
    });

    const checked = await verifyWebsiteBrandAssetCandidates(result.candidates, {
      fetchFn: async () => new Response('<html>not an image</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    });

    const candidate = checked.candidates.find((item) => item.normalizedValue === 'https://northstar.example/assets/logo.svg');
    expect(candidate?.confidence).toBeLessThanOrEqual(0.18);
    expect(candidate?.rawValue).toMatchObject({
      availability: {
        status: 'unavailable',
        method: 'HEAD',
        httpStatus: 200,
        contentType: 'text/html',
      },
    });
  });

  it('keeps brand palette colors ahead of transparent and compiled utility colors', () => {
    const result = createWebsiteBrandSignalProfile({
      websiteUrl: 'https://northstar.example',
      html: `
<!doctype html>
<html>
  <head>
    <title>Northstar Analytics</title>
    <meta name="theme-color" content="#102033">
    <style>
      :root {
        --brand-primary: #102033;
        --brand-accent: #ff6a00;
        --color-accent: #ff5722;
        --color-red-500: #fb2c36;
        --color-purple-500: #ac4bff;
        --color-emerald-500: #00bb7f;
        --chart-1: #f99c00;
        --destructive: #d46a5c;
        --tw-ring-color: #ef4444;
        --radix-tooltip-background: #22c55e;
        --invisible: #00000000;
      }
      .hero { color: var(--brand-primary); background: rgba(255, 106, 0, 0.95); }
      .enterprise-cta { color: #ff5722; }
      .ghost { border-color: rgba(1, 2, 3, 0); }
    </style>
  </head>
  <body><h1>Northstar Analytics</h1></body>
</html>
`,
      brandId: 'brand_northstar',
      userId: 'user_1',
      fetchedAt: NOW,
      jobId: 'job_palette_utility_noise',
    });

    const paletteColors = [
      result.profile.palette.primary?.value,
      result.profile.palette.accent?.value,
      ...result.profile.palette.supporting.value,
      ...result.profile.palette.neutrals.value,
    ].filter((color): color is string => Boolean(color));
    expect(paletteColors).toEqual(expect.arrayContaining(['#102033', '#ff6a00', '#ff5722']));
    expect(paletteColors).not.toEqual(expect.arrayContaining([
      '#fb2c36',
      '#ac4bff',
      '#00bb7f',
      '#f99c00',
      '#d46a5c',
      '#ef4444',
      '#22c55e',
      '#000000',
      '#010203',
    ]));
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

  it('fetches trusted cross-origin Shopify and font stylesheets while ignoring unknown hosts', async () => {
    const calls: string[] = [];
    const html = `
<!doctype html>
<html>
  <head>
    <title>Glowbar</title>
    <link rel="stylesheet" href="https://cdn.shopify.com/s/files/theme.css">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:wght@600&display=swap">
    <link rel="stylesheet" href="https://cdn.untrusted.example/theme.css">
  </head>
  <body>
    <h1>Glowbar skincare for sensitive customers</h1>
  </body>
</html>`;
    const snapshot = await fetchWebsiteBrandSnapshot('glowbar.example', {
      now: NOW,
      fetchFn: async (url) => {
        calls.push(url);
        if (url === 'https://cdn.shopify.com/s/files/theme.css') {
          return new Response(':root { --brand: #9f5f4f; --accent: #f8d7ca; }', {
            status: 200,
            headers: { 'content-type': 'text/css' },
          });
        }
        if (url.startsWith('https://fonts.googleapis.com/')) {
          return new Response('body { font-family: "Fraunces", serif; }', {
            status: 200,
            headers: { 'content-type': 'text/css' },
          });
        }
        return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
      },
    });
    const result = createWebsiteBrandSignalProfile({
      websiteUrl: snapshot.normalizedUrl,
      html: snapshot.html,
      stylesheets: snapshot.stylesheets,
      brandId: 'brand_glowbar',
      userId: 'user_1',
      fetchedAt: snapshot.fetchedAt,
      jobId: 'job_trusted_cross_origin_css',
    });

    expect(calls).toEqual(expect.arrayContaining([
      'https://glowbar.example/',
      'https://cdn.shopify.com/s/files/theme.css',
      'https://fonts.googleapis.com/css2?family=Fraunces:wght@600&display=swap',
    ]));
    expect(calls).not.toContain('https://cdn.untrusted.example/theme.css');
    expect([
      result.profile.palette.primary?.value,
      result.profile.palette.accent?.value,
      ...result.profile.palette.supporting.value,
    ]).toEqual(expect.arrayContaining(['#9f5f4f', '#f8d7ca']));
    expect(result.profile.typography.raw?.value).toContain('Fraunces');
    expect(result.profile.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        signalPath: 'typography.raw',
        sourceUrl: 'https://fonts.googleapis.com/css2?family=Fraunces:wght@600&display=swap',
      }),
    ]));
  });

  it('fetches linked stylesheets concurrently within the configured cap', async () => {
    let activeStylesheetFetches = 0;
    let maxConcurrentStylesheetFetches = 0;
    const html = `
<!doctype html>
<html>
  <head>
    <title>Northstar</title>
    <link rel="stylesheet" href="/one.css">
    <link rel="stylesheet" href="/two.css">
    <link rel="stylesheet" href="/three.css">
  </head>
  <body><h1>Northstar analytics for revenue teams</h1></body>
</html>`;

    const snapshot = await fetchWebsiteBrandSnapshot('northstar.example', {
      now: NOW,
      stylesheetTimeoutMs: 1_000,
      fetchFn: async (url) => {
        if (String(url).endsWith('.css')) {
          activeStylesheetFetches += 1;
          maxConcurrentStylesheetFetches = Math.max(maxConcurrentStylesheetFetches, activeStylesheetFetches);
          await new Promise((resolve) => setTimeout(resolve, 20));
          activeStylesheetFetches -= 1;
          return new Response(':root { --brand: #102033; }', {
            status: 200,
            headers: { 'content-type': 'text/css' },
          });
        }
        return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
      },
    });

    expect(snapshot.stylesheets).toHaveLength(3);
    expect(maxConcurrentStylesheetFetches).toBeGreaterThan(1);
  });

  it('retries blocked website fetches with browser-like headers and records fetch warnings', async () => {
    const calls: string[] = [];
    const snapshot = await fetchWebsiteBrandSnapshot('northstar.example', {
      now: NOW,
      fetchFn: async (_url, init) => {
        const userAgent = String((init?.headers as Record<string, string> | undefined)?.['user-agent'] ?? '');
        calls.push(userAgent);
        if (userAgent.includes('InsturixBrandVault')) {
          return new Response('<html><title>Access denied</title><body>Checking your browser before accessing the site.</body></html>', {
            status: 403,
            headers: { 'content-type': 'text/html' },
          });
        }
        return new Response(HTML, {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      },
    });

    expect(calls).toHaveLength(2);
    expect(snapshot.html).toContain('Northstar Analytics');
    expect(snapshot.fetchWarnings?.join(' ')).toMatch(/browser-like request headers/i);
    expect(snapshot.browserFallbackRequired).toBe(false);
  });

  it('does not treat Shopify recaptcha helper scripts as browser challenges when visible brand copy exists', async () => {
    const shopifyHtml = `
<!doctype html>
<html>
  <head>
    <title>Chaayos Bazaar</title>
    <script>window.Shopify = { theme: { name: 'bazaar' } };</script>
  </head>
  <body>
    <main>
      <h1>Chaayos Bazaar</h1>
      <nav>Make your own chai Instant Tea Best Sellers New Arrivals Cafe Locator</nav>
      <p>Shop chai time snacks, gifting, herbal tea, natural chai spices, and pyramid whole leaf tea.</p>
    </main>
    <script id="form-persister">
      const c = ['recaptcha-v3-token', 'g-recaptcha-response', 'h-captcha-response'];
    </script>
  </body>
</html>`;

    const snapshot = await fetchWebsiteBrandSnapshot('chaayos.example', {
      now: NOW,
      fetchFn: async () => new Response(shopifyHtml, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    });

    expect(snapshot.fetchFallbackReason).toBeUndefined();
    expect(snapshot.browserFallbackRequired).toBe(false);
    expect(snapshot.html).toContain('Chaayos Bazaar');
  });

  it('does not treat security vendor brand names as browser challenges without challenge copy', async () => {
    const vendorHtml = `
<!doctype html>
<html>
  <head><title>Cloudflare: Build for the agent era</title></head>
  <body>
    <main>
      <h1>Cloudflare helps teams build, secure, and accelerate applications</h1>
      <p>${'Cloudflare products include CDN, security, developer platform, zero trust, and network services for enterprises. '.repeat(10)}</p>
    </main>
  </body>
</html>`;

    const snapshot = await fetchWebsiteBrandSnapshot('cloudflare.example', {
      now: NOW,
      fetchFn: async () => new Response(vendorHtml, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    });

    expect(snapshot.fetchFallbackReason).toBeUndefined();
    expect(snapshot.browserFallbackRequired).toBe(false);
    expect(snapshot.html).toContain('Cloudflare helps teams');
  });

  it('does not mark rich visible pages as JavaScript shells because scripts mention JavaScript requirements', async () => {
    const richHtml = `
<!doctype html>
<html>
  <head>
    <title>World Leader in Artificial Intelligence Computing</title>
    <script>window.help = 'Please enable JavaScript for the full app experience.';</script>
  </head>
  <body>
    <main>
      <h1>World leader in accelerated computing</h1>
      <p>${'AI computing platforms, developer tools, data center systems, robotics, simulation, and enterprise software. '.repeat(12)}</p>
    </main>
  </body>
</html>`;

    const snapshot = await fetchWebsiteBrandSnapshot('nvidiaish.example', {
      now: NOW,
      fetchFn: async () => new Response(richHtml, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    });

    expect(snapshot.fetchFallbackReason).toBeUndefined();
    expect(snapshot.browserFallbackRequired).toBe(false);
    expect(snapshot.html).toContain('accelerated computing');
  });

  it('uses explicit browser-rendered fallback evidence for JavaScript-only shells', async () => {
    const snapshot = await fetchWebsiteBrandSnapshot('blocked.example', {
      now: NOW,
      disableBrowserLikeRetry: true,
      fetchFn: async () => new Response('<html><body>Please enable JavaScript to continue.</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
      browserFallbackFetchFn: async (input) => ({
        normalizedUrl: input.normalizedUrl,
        html: HTML,
        contentType: 'text/html',
        fetchWarnings: [`browser fallback reason=${input.reason}`],
      }),
    });

    expect(snapshot.html).toContain('Northstar Analytics');
    expect(snapshot.fetchWarnings).toEqual(expect.arrayContaining([
      expect.stringMatching(/browser-rendered fallback evidence/i),
      'browser fallback reason=javascript_shell',
    ]));
    expect(snapshot.browserFallbackRequired).toBe(false);
  });

  it('rejects browser fallback output that is still a security checkpoint', async () => {
    await expect(
      fetchWebsiteBrandSnapshot('blocked.example', {
        now: NOW,
        disableBrowserLikeRetry: true,
        fetchFn: async () => new Response('<html><title>Access Denied</title><body>Access Denied</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
        browserFallbackFetchFn: async () => ({
          normalizedUrl: 'https://blocked.example/',
          html: '<html><title>Vercel Security Checkpoint</title><body>We are verifying your browser. Website owner? Click here to fix.</body></html>',
          contentType: 'text/html',
        }),
      }),
    ).rejects.toThrow(/blocked or challenge HTML/);
  });

  it('records a warning when configured browser fallback returns no usable HTML', async () => {
    const snapshot = await fetchWebsiteBrandSnapshot('blocked.example', {
      now: NOW,
      disableBrowserLikeRetry: true,
      fetchFn: async () => new Response('<html><body>Please enable JavaScript to continue.</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
      browserFallbackFetchFn: async () => undefined,
    });

    expect(snapshot.fetchFallbackReason).toBe('javascript_shell');
    expect(snapshot.browserFallbackRequired).toBe(true);
    expect(snapshot.fetchWarnings).toEqual(expect.arrayContaining([
      expect.stringMatching(/attempted browser-rendered fallback evidence/i),
      expect.stringMatching(/renderer returned no usable HTML/i),
      expect.stringMatching(/required JavaScript/i),
    ]));
  });
  it('classifies hydration-only app shells by visible body text, not raw HTML size', async () => {
    const shellHtml = `
<!doctype html>
<html>
  <head>
    <title>Vaultline</title>
    <script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { copy: 'x'.repeat(600) } } })}</script>
    <script>${'window.__bundle = true;'.repeat(200)}</script>
  </head>
  <body><div id="__next"></div></body>
</html>`;
    const snapshot = await fetchWebsiteBrandSnapshot('vaultline.example', {
      now: NOW,
      disableBrowserLikeRetry: true,
      fetchFn: async () => new Response(shellHtml, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    });

    expect(snapshot.fetchFallbackReason).toBe('javascript_shell');
    expect(snapshot.browserFallbackRequired).toBe(true);
    expect(snapshot.fetchWarnings?.join(' ')).toMatch(/required JavaScript/i);
  });

  it('extracts useful Next.js data payload copy before declaring a shell empty', async () => {
    const nextData = {
      props: {
        pageProps: {
          hero: {
            headline: 'Launch faster campaigns with proof-led product stories',
            description: 'Built for marketing teams and ecommerce operators who need reliable product storytelling.',
          },
          products: [
            {
              title: 'Revenue Story Engine',
              description: 'Trusted by 1200 ecommerce brands to turn product launches into measurable growth.',
            },
          ],
        },
      },
    };
    const shellHtml = `
<!doctype html>
<html>
  <head>
    <title>Storyline OS</title>
    <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>
  </head>
  <body><div id="__next"></div></body>
</html>`;
    const snapshot = await fetchWebsiteBrandSnapshot('storyline.example', {
      now: NOW,
      disableBrowserLikeRetry: true,
      fetchFn: async () => new Response(shellHtml, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    });
    const result = createWebsiteBrandSignalProfile({
      websiteUrl: snapshot.normalizedUrl,
      html: snapshot.html,
      brandId: 'brand_storyline',
      userId: 'user_1',
      fetchedAt: snapshot.fetchedAt,
      jobId: 'job_next_data',
    });

    expect(snapshot.fetchFallbackReason).toBeUndefined();
    expect(snapshot.browserFallbackRequired).toBe(false);
    expect(result.profile.identity.audience.value).toEqual(expect.arrayContaining(['marketing teams and ecommerce operators', 'ecommerce brands']));
    expect(result.profile.voice.recurringPhrases.value).toContain('Launch faster campaigns with proof-led product stories');
    expect(result.profile.identity.proofStyle.value).toBe('testimonial');
    expect(result.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceField: 'nextData.pageProps',
        signalPath: 'identity.audience',
        sourceType: 'website_metadata',
        confidence: 0.54,
      }),
      expect.objectContaining({
        sourceField: 'nextData.pageProps',
        signalPath: 'voice.recurringPhrases',
        sourceType: 'website_metadata',
        confidence: 0.56,
      }),
      expect.objectContaining({
        sourceField: 'nextData.pageProps',
        signalPath: 'identity.proofStyle',
        sourceType: 'website_metadata',
        confidence: 0.56,
      }),
    ]));
  });

  it('fetches Shopify product and collection JSON as free supplemental evidence', async () => {
    const calls: string[] = [];
    const shopifyHtml = `
<!doctype html>
<html>
  <head>
    <title>Glowbar</title>
    <script>window.Shopify = { theme: { name: 'Dawn' } };</script>
  </head>
  <body>
    <h1>Glowbar skincare</h1>
    <img class="product-card" alt="Daily Barrier Serum product" src="/cdn/shop/products/daily-serum.png">
    <img alt="Glowbar logo" src="/assets/logo.svg">
    <script src="https://cdn.shopify.com/s/files/theme.js"></script>
  </body>
</html>`;
    const snapshot = await fetchWebsiteBrandSnapshot('glowbar.example', {
      now: NOW,
      fetchLinkedStylesheets: false,
      fetchFn: async (url) => {
        calls.push(url);
        if (url.endsWith('/products.json')) {
          return new Response(JSON.stringify({
            products: [
              {
                title: 'Daily Barrier Serum',
                body_html: '<p>Dermatologist-tested skincare for sensitive Indian skin, trusted by 20000 customers.</p>',
                vendor: 'Glowbar',
                product_type: 'Serum',
              },
            ],
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (url.endsWith('/collections.json')) {
          return new Response(JSON.stringify({
            collections: [
              {
                title: 'Daily skincare essentials',
                body_html: '<p>Simple routines for busy skincare customers.</p>',
              },
            ],
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return new Response(shopifyHtml, { status: 200, headers: { 'content-type': 'text/html' } });
      },
    });
    const result = createWebsiteBrandSignalProfile({
      websiteUrl: snapshot.normalizedUrl,
      html: snapshot.html,
      supplementalText: snapshot.supplementalText,
      brandId: 'brand_glowbar',
      userId: 'user_1',
      fetchedAt: snapshot.fetchedAt,
      jobId: 'job_shopify_json',
    });

    expect(calls).toEqual(expect.arrayContaining([
      'https://glowbar.example/products.json',
      'https://glowbar.example/collections.json',
    ]));
    expect(snapshot.supplementalText?.map((item) => item.sourceField)).toEqual(expect.arrayContaining(['shopify.products', 'shopify.collections']));
    expect(result.profile.identity.category.value).toBe('beauty/personal care');
    expect(result.profile.identity.productServices?.value).toEqual(expect.arrayContaining(['Daily Barrier Serum', 'Daily skincare essentials']));
    expect(result.profile.assets?.productImages.value).toEqual(['https://glowbar.example/cdn/shop/products/daily-serum.png']);
    expect(result.profile.voice.recurringPhrases.value).toContain('Daily Barrier Serum');
    expect(result.profile.identity.proofStyle.value).toBe('testimonial');
    expect(result.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceField: 'website.productImages',
        signalPath: 'assets.productImages',
        normalizedValue: ['https://glowbar.example/cdn/shop/products/daily-serum.png'],
        sourceType: 'website',
      }),
      expect.objectContaining({
        sourceField: 'website.productImage',
        signalPath: 'assets.productImages',
        normalizedValue: expect.objectContaining({
          url: 'https://glowbar.example/cdn/shop/products/daily-serum.png',
        }),
        sourceType: 'website_metadata',
      }),
      expect.objectContaining({
        sourceField: 'shopify.products',
        signalPath: 'identity.productServices',
        sourceType: 'website',
        confidence: 0.58,
      }),
      expect.objectContaining({
        sourceField: 'shopify.products',
        signalPath: 'identity.proofStyle',
        sourceType: 'website',
        confidence: 0.58,
      }),
      expect.objectContaining({
        sourceField: 'shopify.products',
        signalPath: 'voice.recurringPhrases',
        sourceType: 'website',
        confidence: 0.58,
      }),
    ]));
  });

  it('warns but continues when Shopify JSON endpoints are unavailable', async () => {
    const snapshot = await fetchWebsiteBrandSnapshot('glowbar.example', {
      now: NOW,
      fetchLinkedStylesheets: false,
      fetchFn: async (url) => {
        if (url.endsWith('/products.json')) {
          return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } });
        }
        if (url.endsWith('/collections.json')) {
          return new Response('<html>blocked</html>', { status: 200, headers: { 'content-type': 'text/html' } });
        }
        return new Response('<html><body><script>Shopify.theme = {}</script><h1>Glowbar skincare</h1></body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      },
    });

    expect(snapshot.supplementalText).toEqual([]);
    expect(snapshot.fetchWarnings).toEqual(expect.arrayContaining([
      'Brand Vault skipped shopify.products: HTTP 404.',
      'Brand Vault skipped shopify.collections: non-JSON response (text/html).',
    ]));
  });
});
