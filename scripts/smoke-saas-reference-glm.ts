import {
  DEFAULT_GLM_ANALYSIS_MODEL,
  DEFAULT_GLM_GATE_MODEL,
  MAX_REFERENCE_EVALUATION_SECONDS,
  REQUIRED_GATE_FRAME_COUNT,
  analyzeSaasReferenceVideo,
  buildReferenceVideoCacheKey,
  validateSaasReferenceVideo,
} from '../lib/editron/reference-video/saas-reference-video-analyzer';
import sharp from 'sharp';

interface SmokeOptions {
  dryRun: boolean;
  fullAnalysis: boolean;
  requireAllFrames: boolean;
  videoUrl: string;
  frameImageUrls: string[];
  sourceLabel: string;
  durationSec: number;
  script?: string;
  brandContext?: string;
  gateModel: string;
  analysisModel: string;
}

const DEFAULT_VIDEO_URL = 'https://example.com/editron-glm-saas-reference-smoke.mp4';
const DEFAULT_DURATION_SEC = 60;
const DEFAULT_SOURCE_LABEL = 'Editron GLM SaaS reference smoke';

const DEFAULT_FRAME_SPECS = [
  { title: 'Revenue Overview', metric: '$84.2k MRR', accent: '#38bdf8', chart: 'M 40 180 L 150 130 L 260 150 L 370 82 L 480 104 L 590 52' },
  { title: 'Automation Workflow', metric: '42 live tasks', accent: '#34d399', chart: 'M 40 145 L 150 150 L 260 88 L 370 110 L 480 70 L 590 92' },
  { title: 'Customer Segments', metric: '18 cohorts', accent: '#f59e0b', chart: 'M 40 160 L 150 118 L 260 122 L 370 92 L 480 96 L 590 64' },
  { title: 'Team Timeline', metric: '9 launches', accent: '#a78bfa', chart: 'M 40 132 L 150 116 L 260 126 L 370 72 L 480 78 L 590 44' },
  { title: 'Settings Console', metric: '99.9% uptime', accent: '#f472b6', chart: 'M 40 172 L 150 142 L 260 146 L 370 88 L 480 92 L 590 56' },
];

function parseArgs(args: string[]): SmokeOptions {
  const frameImageUrls: string[] = [];
  let videoUrl = DEFAULT_VIDEO_URL;
  let durationSec = DEFAULT_DURATION_SEC;
  let sourceLabel = DEFAULT_SOURCE_LABEL;
  let script: string | undefined;
  let brandContext: string | undefined;
  let gateModel = DEFAULT_GLM_GATE_MODEL;
  let analysisModel = DEFAULT_GLM_ANALYSIS_MODEL;
  let dryRun = false;
  let fullAnalysis = false;
  let requireAllFrames = true;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--full' || arg === '--analysis') {
      fullAnalysis = true;
    } else if (arg === '--allow-one-frame-miss') {
      requireAllFrames = false;
    } else if (arg === '--video-url') {
      videoUrl = requireValue(args, index += 1, arg);
    } else if (arg.startsWith('--video-url=')) {
      videoUrl = readInlineValue(arg, '--video-url=');
    } else if (arg === '--frame-url') {
      frameImageUrls.push(requireValue(args, index += 1, arg));
    } else if (arg.startsWith('--frame-url=')) {
      frameImageUrls.push(readInlineValue(arg, '--frame-url='));
    } else if (arg === '--duration-sec') {
      durationSec = readPositiveNumber(requireValue(args, index += 1, arg), arg);
    } else if (arg.startsWith('--duration-sec=')) {
      durationSec = readPositiveNumber(readInlineValue(arg, '--duration-sec='), '--duration-sec');
    } else if (arg === '--source-label') {
      sourceLabel = requireValue(args, index += 1, arg);
    } else if (arg.startsWith('--source-label=')) {
      sourceLabel = readInlineValue(arg, '--source-label=');
    } else if (arg === '--script') {
      script = requireValue(args, index += 1, arg);
    } else if (arg.startsWith('--script=')) {
      script = readInlineValue(arg, '--script=');
    } else if (arg === '--brand-context') {
      brandContext = requireValue(args, index += 1, arg);
    } else if (arg.startsWith('--brand-context=')) {
      brandContext = readInlineValue(arg, '--brand-context=');
    } else if (arg === '--gate-model') {
      gateModel = requireValue(args, index += 1, arg);
    } else if (arg.startsWith('--gate-model=')) {
      gateModel = readInlineValue(arg, '--gate-model=');
    } else if (arg === '--analysis-model') {
      analysisModel = requireValue(args, index += 1, arg);
    } else if (arg.startsWith('--analysis-model=')) {
      analysisModel = readInlineValue(arg, '--analysis-model=');
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return {
    dryRun,
    fullAnalysis,
    requireAllFrames,
    videoUrl,
    frameImageUrls,
    sourceLabel,
    durationSec,
    script,
    brandContext,
    gateModel,
    analysisModel,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.frameImageUrls.length === 0) {
    options.frameImageUrls = await buildDefaultFrameImageUrls();
  }
  assertSmokeOptions(options);

  const gateCacheKey = buildReferenceVideoCacheKey(options, 'gate', options.gateModel);
  const analysisCacheKey = buildReferenceVideoCacheKey(options, 'analysis', options.analysisModel);
  const input = {
    videoUrl: options.videoUrl,
    frameImageUrls: options.frameImageUrls,
    durationSec: options.durationSec,
    sourceLabel: options.sourceLabel,
    script: options.script,
    brandContext: options.brandContext,
    gateModel: options.gateModel,
    analysisModel: options.analysisModel,
    requireAllFrames: options.requireAllFrames,
  };

  if (options.dryRun) {
    printJson({
      ok: true,
      dryRun: true,
      mode: options.fullAnalysis ? 'analysis' : 'gate',
      gateModel: options.gateModel,
      analysisModel: options.analysisModel,
      frameCount: options.frameImageUrls.length,
      evaluationWindowSec: Math.min(Math.ceil(options.durationSec), MAX_REFERENCE_EVALUATION_SECONDS),
      gateCacheKey,
      analysisCacheKey,
      videoUrl: options.videoUrl,
      sourceLabel: options.sourceLabel,
    });
    return;
  }

  if (options.fullAnalysis) {
    const result = await analyzeSaasReferenceVideo(input);
    printJson(summarizeAnalysisResult(result, gateCacheKey, analysisCacheKey));
    if (!result.ok) process.exitCode = 1;
    return;
  }

  const result = await validateSaasReferenceVideo(input);
  printJson(summarizeGateResult(result, gateCacheKey));
  if (!result.ok || !result.decision.accepted) process.exitCode = 1;
}

function summarizeGateResult(
  result: Awaited<ReturnType<typeof validateSaasReferenceVideo>>,
  expectedCacheKey: string,
): Record<string, unknown> {
  if (!result.ok) {
    return {
      ok: false,
      mode: 'gate',
      reason: result.reason,
      diagnostics: result.diagnostics,
      cacheKey: result.cacheKey ?? expectedCacheKey,
    };
  }

  return {
    ok: result.decision.accepted,
    mode: 'gate',
    model: result.model,
    cacheKey: result.cacheKey,
    category: result.gate.category,
    confidence: result.gate.confidence,
    passedFrameCount: result.decision.passedFrameCount,
    totalFrameCount: result.decision.totalFrameCount,
    rejectionReason: result.decision.reason,
    evidence: result.gate.evidence,
    usage: result.usage,
  };
}

function summarizeAnalysisResult(
  result: Awaited<ReturnType<typeof analyzeSaasReferenceVideo>>,
  expectedGateCacheKey: string,
  expectedAnalysisCacheKey: string,
): Record<string, unknown> {
  if (!result.ok) {
    return {
      ok: false,
      mode: 'analysis',
      reason: result.reason,
      diagnostics: result.diagnostics,
      gateCacheKey: result.cacheKey ?? expectedGateCacheKey,
      analysisCacheKey: expectedAnalysisCacheKey,
      gateDecision: result.gateDecision,
    };
  }

  return {
    ok: true,
    mode: 'analysis',
    model: result.model,
    cacheKey: result.cacheKey,
    evaluationWindowSec: result.evaluationWindowSec,
    category: result.gate.category,
    confidence: result.gate.confidence,
    summary: result.analysis.summary,
    decisionInputs: result.analysis.decisionInputs,
    visualLanguage: result.analysis.styleSignals.visualLanguage,
    risks: result.analysis.risks,
    usage: result.usage,
  };
}

function assertSmokeOptions(options: SmokeOptions): void {
  if (!options.videoUrl.trim()) throw new Error('video URL is required.');
  if (options.frameImageUrls.length !== REQUIRED_GATE_FRAME_COUNT) {
    throw new Error(`Exactly ${REQUIRED_GATE_FRAME_COUNT} --frame-url values are required.`);
  }
  options.frameImageUrls.forEach((url, index) => {
    if (!url.trim()) throw new Error(`frame ${index} URL is empty.`);
  });
  if (options.fullAnalysis && options.videoUrl === DEFAULT_VIDEO_URL) {
    throw new Error('--full requires --video-url pointing at a real MP4/WebM/MOV reference.');
  }
}

async function buildDefaultFrameImageUrls(): Promise<string[]> {
  return Promise.all(DEFAULT_FRAME_SPECS.map(async (spec, index) => {
    const svg = buildDashboardFrameSvg(spec, index);
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  }));
}

function buildDashboardFrameSvg(
  spec: (typeof DEFAULT_FRAME_SPECS)[number],
  index: number,
): string {
  const navItems = ['Overview', 'Pipeline', 'Users', 'Reports'];
  const rows = ['Acme AI', 'Northstar', 'SignalOps', 'Launchly'];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#0f172a"/>
  <rect x="56" y="52" width="1168" height="616" rx="28" fill="#f8fafc"/>
  <rect x="56" y="52" width="1168" height="72" rx="28" fill="#111827"/>
  <circle cx="96" cy="88" r="9" fill="#ef4444"/>
  <circle cx="126" cy="88" r="9" fill="#f59e0b"/>
  <circle cx="156" cy="88" r="9" fill="#22c55e"/>
  <text x="204" y="94" fill="#e5e7eb" font-size="24" font-family="Inter, Arial">Insturix SaaS Console</text>
  <rect x="88" y="154" width="218" height="474" rx="20" fill="#e2e8f0"/>
  ${navItems.map((item, navIndex) => `
    <rect x="112" y="${184 + navIndex * 72}" width="170" height="44" rx="14" fill="${navIndex === index % navItems.length ? spec.accent : '#f8fafc'}"/>
    <text x="132" y="${213 + navIndex * 72}" fill="${navIndex === index % navItems.length ? '#082f49' : '#334155'}" font-size="22" font-family="Inter, Arial">${item}</text>
  `).join('')}
  <text x="342" y="190" fill="#0f172a" font-size="42" font-weight="700" font-family="Inter, Arial">${spec.title}</text>
  <text x="344" y="228" fill="#64748b" font-size="22" font-family="Inter, Arial">Live product demo frame ${index + 1}</text>
  <rect x="342" y="262" width="250" height="118" rx="22" fill="#ffffff" stroke="#cbd5e1"/>
  <text x="374" y="314" fill="#475569" font-size="24" font-family="Inter, Arial">Primary metric</text>
  <text x="374" y="354" fill="#0f172a" font-size="34" font-weight="700" font-family="Inter, Arial">${spec.metric}</text>
  <rect x="620" y="262" width="552" height="266" rx="24" fill="#ffffff" stroke="#cbd5e1"/>
  <text x="652" y="314" fill="#334155" font-size="26" font-weight="700" font-family="Inter, Arial">Product analytics</text>
  <path d="${spec.chart}" transform="translate(652 284)" fill="none" stroke="${spec.accent}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="652" y="444" width="460" height="18" rx="9" fill="#e2e8f0"/>
  <rect x="652" y="444" width="${300 + index * 28}" height="18" rx="9" fill="${spec.accent}"/>
  <rect x="342" y="408" width="250" height="120" rx="22" fill="#ffffff" stroke="#cbd5e1"/>
  <text x="374" y="460" fill="#475569" font-size="23" font-family="Inter, Arial">Conversion lift</text>
  <text x="374" y="500" fill="#0f172a" font-size="34" font-weight="700" font-family="Inter, Arial">+${18 + index * 7}%</text>
  <rect x="342" y="556" width="830" height="72" rx="22" fill="#ffffff" stroke="#cbd5e1"/>
  ${rows.map((row, rowIndex) => `
    <circle cx="${382 + rowIndex * 194}" cy="592" r="12" fill="${spec.accent}"/>
    <text x="${404 + rowIndex * 194}" y="600" fill="#334155" font-size="22" font-family="Inter, Arial">${row}</text>
  `).join('')}
</svg>`;
}

function readPositiveNumber(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${flag} must be a positive number.`);
  return parsed;
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return value;
}

function readInlineValue(arg: string, prefix: string): string {
  const value = arg.slice(prefix.length);
  if (!value) throw new Error(`${prefix.slice(0, -1)} requires a value.`);
  return value;
}

function printJson(payload: Record<string, unknown>): void {
  console.log(JSON.stringify(payload, null, 2));
}

function printUsage(): void {
  console.log(`Usage:
  npx tsx scripts/smoke-saas-reference-glm.ts [--dry-run]
  npx tsx scripts/smoke-saas-reference-glm.ts --full --video-url <public-mp4-url> --frame-url <jpg> ...x5

Options:
  --dry-run                Validate CLI wiring without calling GLM.
  --full, --analysis       Run full video_url analysis after the 5-frame gate.
  --video-url <url>        Candidate reference video URL.
  --frame-url <url>        Sample frame image URL. Repeat exactly 5 times.
  --allow-one-frame-miss   Let the gate pass with 4/5 SaaS-positive frames.
  --duration-sec <n>       Duration metadata; evaluation is capped at 120 seconds.
  --script <text>          Optional user script context.
  --brand-context <text>   Optional Brand Vault context.
  --gate-model <model>     Override gate model.
  --analysis-model <model> Override full-analysis model.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
