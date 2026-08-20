import { load } from 'cheerio';
import type { BrandPaletteHarmony, BrandProofStyle, BrandSignalProfile } from './brand-signal-profile';
import { sanitizeEvidenceExcerpt } from './brand-signal-profile';
import type {
  BrandEvidenceCandidate,
  BrandEvidenceCandidateSourceType,
  BrandWebsiteLogoCandidate,
  BrandWebsiteLogoCandidateRole,
  BrandWebsiteProductImageCandidate,
  BrandWebsiteDraftInput,
  BrandWebsiteFontFace,
  ParsedWebsiteEvidence,
  SignalSource,
} from './brand-website-refinery-types';

export const DARK_SURFACE = '#0b0b0f';
export const LIGHT_SURFACE = '#ffffff';

const CTA_PATTERN = /\b(start|get|book|join|try|buy|shop|contact|talk|demo|learn|download|subscribe|apply|schedule|request)\b/i;
const GENERIC_AUDIENCE_PATTERN = /^(?:teams?|businesses|companies|people|users|customers|clients|leaders|operators|creators|agents?|ai era|modern era)$/i;
const SPECIFIC_AUDIENCE_MODIFIER_PATTERN = /\b(?:agenc(?:y|ies)|creative|revenue|sales|marketing|product|engineering|developer|design|ops|operations|saas|b2b|enterprises?|startups?|clients?|customers?|support|security|finance|founders?|operators?|creators?|creator houses?|in-house|studios?|filmmakers?|editorial|content|production|video|social|brands?|businesses?|women|men|kids?|children|babies|parents?|mothers?|moms?|families|students?|professionals?|customers?|shoppers?|enthusiasts?|collectors?|travel(?:ers|lers)|runners?|climbers?|athletes?|gamers?|pet parents?|homeowners?|skin|hair|beard|coffee lovers?)\b/i;
const AUDIENCE_FRAGMENT_PREFIX_PATTERN = /^(?:and|or|but|by|with|without|from|into|through|via|that|this|these|those|it|its|their|while|when|where|which|building|creating|shipping|scaling|accepting|optimizing|optimising|enabling|embedding|monetizing|monetising)\b/i;
const AUDIENCE_NON_ENTITY_PATTERN = /\b(?:editing stage|production workflow connected|brand drift|handoffs?|path can be|can be informal|floor running|production floor|production-grade tools?|guided recommendations?|first three months|life today|local content|better experience|exclusive features|open your .*app|online store members?|nearest .*store|latest .*cpus?|newest .*polling|working of basic functionalities|current product information|tailored new arrivals?|updates? on new arrivals?|selection shop now|today\s*[|/]\s*shop now|all your [a-z\s-]+ cravings?|any queries? or issues?|queries? or issues?|customer care|help center|store locator|nvidia|vera rubin|intel core|keyboard for gameplay|climate goals?|emissions goals?|sustainability goals?|\d{2,3}-year goal)\b/i;
const AUDIENCE_STANDALONE_DOMAIN_PATTERN = /^(?:video|content|production|social|creative|marketing|sales|revenue|product|engineering|design|finance|support|ops|operations|payments?|billing|skin|hair|beard|body)$/i;
const AUDIENCE_PROMO_NOISE_PATTERN = /\b(?:shop now|add to cart|buy now|wishlist|no reviews?|customer reviews?|review attempts?|mrp|price|sale|discount|coupon|free shipping|cash on delivery|cod|checkout|cart|sku|variant|select size|select colour|select color|new arrivals?|best sellers?|view all|quick view|sold out|login|sign in|track order|order status|return policy|refunds?|download app|franchise|country\/region|newsletter|subscribe|cookie|privacy policy|terms of service|please use a different browser|please visit the site|enable javascript|gpay|pay online|payment app|product card|product-grid|productgrid)\b/i;
const AUDIENCE_PRODUCT_UNIT_PATTERN = /\b(?:b\d+p\d+|pack\s+of\s+\d+|\d+(?:\.\d+)?\s?(?:ml|g|gm|kg|oz|fl\s?oz|pcs?|pieces|capsules?|tablets?)|spf\s?\d+)\b/i;
const AUDIENCE_PRODUCT_BENEFIT_PATTERN = /(?:\b(?:gift hampers?|hampers?|combos?|bundles?)\b|^(?:[a-z]+\s+)*(?:clear|bright|glowing|radiant|hydrated|smooth|dark)\s*(?:&|and)\s*(?:clear|bright|glowing|radiant|hydrated|smooth|pigmentation)\s+(?:skin|hair|body)$|\b(?:body|beard|hair|skin)\s+trimming\b|\b(?:control|reduce|remove|fight|prevent|repair|nourish|trim|trimming)\b.*\b(?:oil|skin|hair|beard|body|pigmentation|frizz)\b|\b(?:no\s+sls|parabens?|sulphates?|sulfates?)\b)/i;
const AUDIENCE_PRODUCT_FEATURE_PATTERN = /\b(?:charging|attachments?|nose\s*&\s*ears?|easy cleaning|cleaning under water|under water|waterproof|washable|u-shape|precision)\b/i;
const AUDIENCE_CODE_OR_MARKUP_PATTERN = /(?:<\/?[a-z][^>]*>|["']>\s*|raw\s*=|await\s+resp|queryselector|document\.|window\.|function\s*\(|=>|{{|}}|@media|--[a-z0-9-]+:|[{};])/i;
const AUDIENCE_ENTITY_PHRASE_PATTERN = /\b((?:(?:enterprise|b2b|saas|small business|mid-market|ecommerce|retail|marketing|sales|security|it|data|engineering|developer|design|creative|product|finance|support|operations|ops|agency|brand|content|video|social)\s+){1,3}(?:teams?|leaders|operators|managers?|professionals?|users?|customers?|brands?|businesses|companies|creators?|developers?|marketers?))\b/gi;
const AUDIENCE_POSSESSIVE_VERTICAL_PATTERN = /\b(women|men|kids|children|babies|parents|mothers|moms|families|students|professionals|runners|athletes|gamers|pet parents|homeowners|coffee lovers|travel(?:ers|lers)|creators|developers|designers|founders|freelancers)'?s?\s+(?:fashion|apparel|skincare|skin care|haircare|beauty|grooming|footwear|shoes|bags|luggage|travel|nutrition|wellness|home|electronics|software|tools?)\b/gi;
const BODY_NOISE_SELECTOR = 'script,style,noscript,svg,template,iframe,nav,header,footer,aside,form';
const BODY_NOISE_ATTRIBUTE_PATTERN = /(?:^|[\s_-])(?:cart|wishlist|checkout|currency|country|newsletter|cookie|announcement|toast|modal|drawer|menu|breadcrumb|pagination|product-card|productcard|product-grid|productgrid|price|review|recommendation|recommendations|upsell|cross-sell|recently-viewed|recentlyviewed|search|login|signin|sign-in)(?:$|[\s_-])/i;
const BODY_APP_CHROME_ATTRIBUTE_PATTERN = /(?:^|[\s_-])(?:app-preview|browser-frame|canvas-preview|control-room|demo-panel|demo-preview|editor-preview|export-panel|filmstrip|film-strip|interface-preview|layer-panel|layers-panel|media-panel|mockup|pipeline-preview|product-demo|product-mockup|studio-preview|timeline-preview|workspace-preview)(?:$|[\s_-])/i;
const BODY_APP_CHROME_TEXT_PATTERN = /^(?:export|layers?|script|media|captions?|music|graphics?|thumbnails?|pipeline|input|edit|analy[sz]e|publish|film\s*strip|exposing|scene|take|frame|frm\s*\d+|render|rendering|upload|assets?|timeline|track\s*\d+|layer\s*\d+|draft ready|packaging|super)$/i;
const BODY_COUNTER_OR_CONTROL_TEXT_PATTERN = /^(?:[\d:. /-]+|[x\u00d7]|[+_-]|[a-z]\d{1,3})$/i;
const IMAGE_ASSET_EXTENSIONS = new Set(['.avif', '.gif', '.ico', '.jpeg', '.jpg', '.png', '.svg', '.webp']);
const SOCIAL_PREVIEW_ASSET_PATTERN = /(?:^|[-_/])(og|open-graph|opengraph|twitter|social|share|card)(?:[-_.]|$)/i;
const PRODUCT_IMAGE_CONTEXT_PATTERN = /\b(?:product|products|collection|catalog|item|sku|merch|shopify|pdp|plp|packshot|hero-product)\b/i;
const PRODUCT_SERVICE_NOISE_PATTERN = /\b(?:shop now|add to cart|buy now|wishlist|no reviews?|customer reviews?|mrp|price|sale|discount|coupon|free shipping|cash on delivery|cod|checkout|cart|sku|variant|select size|select colour|select color|view all|quick view|sold out|login|sign in|privacy policy|terms of service)\b/i;
const PRODUCT_SERVICE_NOUN_PATTERN = /\b(?:software|platform|app|application|suite|studio|system|tooling?|tools?|workflow|workflows|engine|automation|service|services|consulting|program|course|serum|cream|cleanser|skincare|skin care|moisturi[sz]er|sunscreen|shampoo|conditioner|shoes?|sneakers?|bags?|watch(?:es)?|jewellery|jewelry|collection|essentials|coffee|electronics|hardware|devices?)\b/i;
const PRODUCT_SERVICE_FRAGMENT_PATTERN = /^(?:already\b|for\b|how\b|not\b|old\b|our\b|same\b|the old\b|two\b|what\b|why\b|your\b|one\s+platform\b)/i;
const PRODUCT_SERVICE_PROPOSITION_PATTERN = /\b(?:is|are|offers?|provides?|builds?|creates?|delivers?)\s+(?:an?\s+|the\s+|one\s+)?([^.!?]{4,120}?\b(?:software|platform|app|application|suite|studio|system|tooling?|tools?|workflow|workflows|engine|automation|service|services|consulting|program|course)\b)(?:\s+(?:for|to|that|with|without|across|from|by|in)\b.*)?$/i;
const FONT_FAMILY_DECLARATION_PATTERN = /(?:^|[;{]\s*)font-family\s*:\s*([^;}]+)/gi;
const MAX_EXTRACTED_WEBSITE_COLORS = 32;
const COLOR_CONTEXT_RADIUS = 96;
const STRONG_BRAND_COLOR_CONTEXT =
  /\b(?:brand|primary|secondary|accent|highlight|cta|button|link|hero|gradient|logo|mark|selected|active|focus|theme|enterprise|contact|sales|product)\b|--[a-z0-9-]*(?:brand|primary|secondary|accent|highlight|cta|gradient|logo|theme|product)[a-z0-9-]*/i;
const COLOR_PROPERTY_CONTEXT = /\b(?:color|background|border|fill|stroke|shadow|ring|outline|decoration)\b|#[a-z0-9_-]+/i;
const NEUTRAL_COLOR_CONTEXT = /\b(?:neutral|gray|grey|slate|zinc|stone|surface|paper|white|black|muted|subtle|border|shadow)\b/i;
const COMPILED_UTILITY_COLOR_CONTEXT = /\b(?:--tw-|tailwind|radix|shiki|hljs|prism|swiper|toastify|skeleton|placeholder|syntax|recharts|apexcharts|chart-\d|ring-offset|backdrop)\b/i;
const DEFAULT_UTILITY_COLOR_TOKEN_CONTEXT =
  /(?:--(?:color-)?(?:slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b|--(?:background|foreground|card|popover|muted|border|input|ring|destructive|chart-\d)\b|\b(?:text|bg|border|ring|from|via|to)-(?:slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b)/i;
const NON_LOGO_ASSET_CONTEXT_PATTERN = /\b(?:product|products|collection|catalog|hero|banner|cover|thumbnail|thumb|preview|share|social|og-image|avatar|team|photo|gallery|sprite|payment|badge)\b/i;
const STRONG_LOGO_CONTEXT_PATTERN = /\b(?:logo|logomark|wordmark|brandmark|brand logo|site logo|navbar-brand)\b/i;
const GENERIC_CATEGORY_LABELS = new Set(['analytics', 'commerce', 'creative services', 'health', 'software']);

const CATEGORY_RULES: Array<{
  label: string;
  signals: Array<[RegExp, number]>;
}> = [
  {
    label: 'semiconductors',
    signals: [
      [/\b(?:semiconductors?|microchips?|silicon|processors?|accelerators?|gpus?|cpus?|foundry|wafer|fabs?|analog devices?|mixed-signal|power management|embedded controllers?)\b/g, 2],
      [/\b(?:semiconductor materials?|wafer fabrication|process control|etch|deposition|lithography|advanced nodes?|accelerated computing|data centers?|ai infrastructure)\b/g, 1.5],
      [/\bchips?\b/g, 0.5],
    ],
  },
  {
    label: 'hardware/electronics',
    signals: [
      [/\b(?:technology hardware|computer hardware|consumer electronics|electronic components?|electronic equipment|electronic instruments?|hardware platforms?|data storage|storage systems?|peripherals?|servers?|workstations?|printers?|pcs?|personal computers?|industrial technolog(?:y|ies)|engineered products?|diversified technology)\b/g, 2],
      [/\b(?:memory|drives?|ssd|hdd|connectors?|sensors?|test and measurement|industrial instruments?|instrumentation|manufacturing services|electronics manufacturing|imaging systems?|aerospace and defense|industrial growth markets?|phones?|smartphones?|laptops?|notebooks?|tablets?|wearables?|earbuds?|headphones?|monitors?|device fleets?)\b/g, 1.75],
      [/\b(?:hardware|devices?|hardware components?|device components?)\b/g, 1],
    ],
  },
  {
    label: 'networking/communications equipment',
    signals: [
      [/\b(?:networking|routers?|switches|ethernet|wireless infrastructure|broadband|telecom equipment|optical networking)\b/g, 2],
      [/\b(?:network security|connectivity|communications equipment)\b/g, 1.5],
    ],
  },
  {
    label: 'IT services',
    signals: [
      [/\b(?:it services|managed services|systems integration|digital transformation|technology consulting|implementation partners?|outsourcing)\b/g, 2],
      [/\b(?:consulting|modernization|modernisation|enterprise transformation)\b/g, 1],
    ],
  },
  {
    label: 'cybersecurity',
    signals: [
      [/\b(?:cybersecurity|cyber security|endpoint security|identity security|threat detection|zero trust|security operations)\b/g, 2],
      [/\b(?:secure access|risk management|vulnerability|firewall)\b/g, 1],
    ],
  },
  {
    label: 'cloud/data infrastructure',
    signals: [
      [/\b(?:cloud infrastructure|data infrastructure|data warehouse|data cloud|compute infrastructure|observability|database platform)\b/g, 2],
      [/\b(?:cloud platform|storage platform|developer infrastructure)\b/g, 1.25],
    ],
  },
  {
    label: 'beauty/personal care',
    signals: [
      [/\b(?:skincare|skin care|haircare|hair care|personal care|beauty|cosmetics?|makeup|grooming|fragrance|ayurvedic|dermatologist|derma|bodycare|body care|bath and body|botanical care)\b/g, 2],
      [/\b(?:sunscreen|serum|cleanser|face wash|moisturi[sz]er|shampoo|conditioner|spf|de-?tan|acne|pigmentation|beard|razor|hair fall|anti-?aging|skin brightening|body wash)\b/g, 1.5],
    ],
  },
  {
    label: 'fashion/apparel',
    signals: [
      [/\b(?:fashion|apparel|clothing|womenswear|menswear|ethnic wear|western wear|innerwear|lingerie|activewear|streetwear|women'?s fashion|men'?s fashion)\b/g, 2],
      [/\b(?:kurtas?|sarees?|saris?|lehengas?|denim|shirts?|t-?shirts?|tees?|dresses|bottomwear|wardrobe|outdoor clothing|co-ords?|jumpsuits?|tops?|bottoms?)\b/g, 1.5],
      [/\b(?:wear|gear)\b/g, 0.75],
    ],
  },
  {
    label: 'footwear',
    signals: [
      [/\b(?:footwear|shoes?|sneakers?|sandals?|slippers?|loafers?|soles?)\b/g, 2],
    ],
  },
  {
    label: 'jewelry/accessories',
    signals: [
      [/\b(?:jewellery|jewelry|silver|gold|diamond|necklaces?|earrings?|rings?|bracelets?|watches?|handbags?|bags?)\b/g, 1.75],
      [/\baccessories\b/g, 1.25],
    ],
  },
  {
    label: 'food/beverage',
    signals: [
      [/\b(?:food|beverages?|coffee|roaster|cafe|espresso|beans|brew|drinks?|snacks?|nutrition bars?|meat|seafood|dairy|grocery|juice|tonic|sauce|tea|chocolate|protein|superfoods?|nuts|seeds|berries)\b/g, 1.75],
      [/\b(?:organic food|cold brew|ready to drink|ready-to-drink|traditional indian drinks?|fruit drinks?)\b/g, 2],
    ],
  },
  {
    label: 'home/living',
    signals: [
      [/\b(?:home decor|furniture|mattress|bedding|sleep|sofas?|tableware|kitchenware|furnishings?)\b/g, 2],
      [/\b(?:living room|bedroom|dining|interiors?)\b/g, 1.25],
    ],
  },
  {
    label: 'electronics/appliances',
    signals: [
      [/\b(?:electronics|appliances?|electricals?|audio|earbuds?|headphones?|speakers?|smartwatch(?:es)?|wearables?|chargers?|cables?|fans?|lighting|pumps?|air coolers?)\b/g, 1.75],
      [/\b(?:consumer tech|home automation|smart devices?|consumer goods like fans|home appliances)\b/g, 2],
    ],
  },
  {
    label: 'eyewear',
    signals: [
      [/\b(?:eyewear|glasses|sunglasses|frames|lenses|contact lenses)\b/g, 2],
    ],
  },
  {
    label: 'baby/kids',
    signals: [
      [/\b(?:baby care|kidswear|children'?s products?|babies|toddlers|parenting|maternity|diapers?)\b/g, 2],
    ],
  },
  {
    label: 'luggage/travel',
    signals: [
      [/\b(?:luggage|suitcases?|backpacks?|travel gear|duffel|trolley bags?)\b/g, 2],
    ],
  },
  {
    label: 'pet care',
    signals: [
      [/\b(?:pet care|pet food|dog food|cat food|pets?|pet parents?)\b/g, 2],
    ],
  },
  {
    label: 'analytics',
    signals: [
      [/\banalytics?\b/g, 2],
      [/\bdashboards?\b/g, 1.5],
      [/\bdata\b/g, 1],
      [/\b(?:reporting|bi|metrics?|insights?|forecast)\b/g, 1],
    ],
  },
  {
    label: 'creative services',
    signals: [
      [/\b(?:agency|studio|creative|production|campaign|content)\b/g, 1.5],
      [/\b(?:video|editorial|brand film|social creative)\b/g, 1],
    ],
  },
  {
    label: 'finance',
    signals: [
      [/\b(?:finance|wealth|bank|investment|portfolio|financial infrastructure|payment processing|payments platform)\b/g, 1.5],
      [/\b(?:revenue|pipeline)\b/g, 0.75],
    ],
  },
  {
    label: 'health',
    signals: [
      [/\b(?:healthcare|clinic|clinical|patient|medical|wellness|therapy|hospital)\b/g, 2],
      [/\bcare\b/g, 0.5],
    ],
  },
  {
    label: 'commerce',
    signals: [
      [/\b(?:shop|commerce|retail|store|checkout|merchandising|catalog)\b/g, 1.5],
    ],
  },
  {
    label: 'software',
    signals: [
      [/\b(?:software|platform|automation|workflow|saas|workspace|tooling|infrastructure)\b/g, 1.5],
      [/\b(?:roadmaps?|issues?|sprints?|backlog|project management|product development|product teams?)\b/g, 1.5],
      [/\b(?:planning and building products?|building products?|shipping products?)\b/g, 2],
      [/\b(?:creative software|design software|editing software|pdf software|creative apps?|design apps?|desktop apps?|cloud apps?|app suite|software suite|3d design|cad|computer-aided design|architecture engineering construction|manufacturing software|media encoder|document cloud|creative cloud|javascript librar(?:y|ies)|typescript librar(?:y|ies)|ui librar(?:y|ies)|react frameworks?|full-stack frameworks?|javascript frameworks?|web frameworks?|native frameworks?|component frameworks?|app frameworks?|web applications?|react components?|web and native user interfaces|developer tools?)\b/g, 2],
      [/\b(?:api|developer|engineering|agents?|ai)\b/g, 0.75],
    ],
  },
];

export function normalizeBrandWebsiteUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Website URL is required.');
  if (/^[a-z][a-z\d+\-.]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    throw new Error(`Unsupported website URL protocol: ${trimmed.split(':')[0]}:`);
  }
  const withProtocol = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Unsupported website URL protocol: ${url.protocol}`);
  }
  url.hash = '';
  url.username = '';
  url.password = '';
  return url.toString();
}

export function parseWebsiteHtml(input: BrandWebsiteDraftInput): ParsedWebsiteEvidence {
  const normalizedUrl = normalizeBrandWebsiteUrl(input.websiteUrl);
  const host = new URL(normalizedUrl).hostname.replace(/^www\./, '');
  const $ = load(input.html);
  const stylesheetCss = input.stylesheets?.map((stylesheet) => stylesheet.css) ?? [];
  const jsonLd = extractJsonLd($('script[type="application/ld+json"]').map((_, el) => $(el).text()).get());
  const schema = chooseSchemaObject(jsonLd, normalizedUrl);
  const title = cleanText($('title').first().text());
  const metaDescription = meta($, ['description', 'og:description', 'twitter:description']) ?? readString(schema, 'description');
  const siteName = meta($, ['og:site_name', 'application-name']);
  const schemaName = readString(schema, 'name');
  const schemaDescription = readString(schema, 'description');
  const schemaTypes = readTypes(schema);
  const colors = extractColors($, stylesheetCss);
  const fonts = extractFonts($, stylesheetCss);
  const fontFaces = extractFontFaces($, stylesheetCss, new URL(normalizedUrl));
  const logoCandidates = extractLogoCandidates($, schema, normalizedUrl);
  const productImageCandidates = extractProductImages($, normalizedUrl);
  const productImages = productImageCandidates.map((image) => image.url);
  const socialPreviewImages = extractSocialPreviewImages($, normalizedUrl);
  const nextDataText = extractNextDataTextEvidence($);
  const supplementalText = input.supplementalText ?? [];
  const supplementalTextValues = supplementalText.map((item) => item.text);

  removeNonBrandBodyNoise($);
  const headings = uniqueText([
    ...$('h1,h2,h3').map((_, el) => cleanText($(el).text())).get(),
    ...nextDataText.filter(isNextDataHeadingCandidate),
    ...supplementalTextValues.filter(isNextDataHeadingCandidate),
  ]).slice(0, 16);
  const ctas = uniqueText($('a,button').map((_, el) => cleanText($(el).text())).get())
    .filter((text) => text.length <= 80 && CTA_PATTERN.test(text))
    .slice(0, 12);
  const proofSnippets = uniqueText([
    ...$('[class*="testimonial"],[class*="case"],[class*="customer"],[class*="proof"],blockquote')
      .map((_, el) => cleanText($(el).text()))
      .get(),
    ...nextDataText.filter(isNextDataProofSnippet),
    ...supplementalTextValues.filter(isNextDataProofSnippet),
  ])
    .filter((text) => text.length >= 12)
    .slice(0, 8);
  const productServices = inferProductServices([
    schemaName,
    schemaDescription,
    metaDescription,
    ...headings,
    ...nextDataText,
    ...supplementalTextValues,
  ]);
  const bodyText = sanitizeEvidenceExcerpt(uniqueText([readBodyText($), ...nextDataText, ...supplementalTextValues]).join('. '), 1200);
  return {
    normalizedUrl,
    host,
    title,
    metaDescription,
    siteName,
    schemaName,
    schemaDescription,
    schemaTypes,
    colors,
    fonts,
    fontFaces,
    headings,
    ctas,
    proofSnippets,
    productServices,
    logoCandidates,
    productImages,
    productImageCandidates,
    socialPreviewImages,
    bodyText,
    nextDataText,
    supplementalText,
  };
}

export function extractNextDataTextEvidenceFromHtml(html: string): string[] {
  return extractNextDataTextEvidence(load(html));
}

function extractNextDataTextEvidence($: ReturnType<typeof load>): string[] {
  const raw = $('script#__NEXT_DATA__').first().text();
  if (!raw.trim()) return [];
  try {
    const values: string[] = [];
    collectNextDataText(JSON.parse(raw) as unknown, [], values);
    return uniqueText(values.map(cleanText))
      .filter((value) => isUsefulNextDataText(value))
      .slice(0, 24);
  } catch {
    return [];
  }
}

function collectNextDataText(value: unknown, path: string[], output: string[]): void {
  if (output.length >= 80) return;
  if (typeof value === 'string') {
    if (isNextDataContentPath(path)) output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectNextDataText(item, path, output);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    collectNextDataText(child, [...path, key], output);
    if (output.length >= 80) return;
  }
}

function isNextDataContentPath(path: string[]): boolean {
  const joined = path.join('.').toLowerCase();
  if (/\b(?:url|href|src|image|icon|asset|slug|id|key|class|style|color|font|route|path|locale)\b/.test(joined)) return false;
  return /\b(?:pageprops|props|product|products|collection|collections|vendor|product_type|title|heading|headline|description|subtitle|tagline|body|copy|content|summary|excerpt|audience|benefit|proof|testimonial|case)\b/.test(joined);
}

function isUsefulNextDataText(value: string): boolean {
  const text = value.trim();
  if (text.length < 12 || text.length > 240) return false;
  if (/^https?:\/\//i.test(text) || /^\/[\w-]+(?:\/[\w-]+)*\/?$/i.test(text)) return false;
  if (/[{}<>]|(?:function|const|var|=>|\.__)/.test(text)) return false;
  if (!/[a-z]/i.test(text) || text.split(/\s+/).length < 3) return false;
  return true;
}

function isNextDataHeadingCandidate(value: string): boolean {
  const text = value.trim();
  return text.length >= 14 && text.length <= 140 && !/[.!?]\s+[A-Z]/.test(text);
}

function isNextDataProofSnippet(value: string): boolean {
  return /\b(?:trusted by|customers?|clients?|teams?|case stud|results?|roi|growth|revenue|\d+[%x+]|\d+\s*(?:k|m|b)?\+?)\b/i.test(value);
}

function removeNonBrandBodyNoise($: ReturnType<typeof load>): void {
  $(BODY_NOISE_SELECTOR).remove();
  $('body').find('*').each((_, el) => {
    const node = $(el);
    const marker = [
      node.attr('class'),
      node.attr('id'),
      node.attr('role'),
      node.attr('aria-label'),
      node.attr('data-testid'),
      node.attr('data-test'),
    ].filter(Boolean).join(' ');
    if (BODY_NOISE_ATTRIBUTE_PATTERN.test(marker) || BODY_APP_CHROME_ATTRIBUTE_PATTERN.test(marker)) node.remove();
  });
}

function readBodyText($: ReturnType<typeof load>): string | undefined {
  const chunks = $('body')
    .find('*')
    .map((_, el) => {
      const clone = $(el).clone();
      clone.children().remove();
      return cleanText(clone.text());
    })
    .get()
    .filter((text): text is string => Boolean(text && !isNonBrandBodyTextChunk(text)));

  return cleanText(chunks.length ? chunks.join('. ') : $('body').text());
}

function isNonBrandBodyTextChunk(value: string): boolean {
  const text = cleanText(value);
  if (!text) return true;
  if (text.length <= 28 && BODY_COUNTER_OR_CONTROL_TEXT_PATTERN.test(text)) return true;
  if (text.length <= 48 && BODY_APP_CHROME_TEXT_PATTERN.test(text)) return true;
  if (isDenseAppChromeCluster(text)) return true;
  return false;
}

function isDenseAppChromeCluster(value: string): boolean {
  const normalized = cleanText(value);
  if (!normalized) return false;
  const tokens = normalized
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]/gi, '').toLowerCase())
    .filter((token): token is string => Boolean(token));
  if (tokens.length < 5) return false;
  const chromeTokens = tokens.filter((token) => /^(?:export|layers?|script|media|captions?|music|graphics?|thumbnails?|pipeline|input|edit|analy[sz]e|publish|filmstrip|exposing|scene|take|frame|render|upload|assets?|timeline|track|layer)$/.test(token));
  return chromeTokens.length >= 4 && chromeTokens.length / tokens.length >= 0.55;
}

function extractLogoCandidates(
  $: ReturnType<typeof load>,
  schema: Record<string, unknown> | undefined,
  normalizedUrl: string,
): BrandWebsiteLogoCandidate[] {
  const baseUrl = new URL(normalizedUrl);
  const candidates = new Map<string, BrandWebsiteLogoCandidate & { score: number }>();

  const add = (
    rawValue: string | undefined,
    sourceField: string,
    role: BrandWebsiteLogoCandidateRole,
    baseScore: number,
    context = '',
  ): void => {
    const clean = cleanText(rawValue);
    const url = clean ? resolveWebsiteAssetUrl(clean, baseUrl) : undefined;
    const fullContext = `${clean} ${context}`;
    if (!clean || !url || !isLogoAssetCandidate(url, fullContext)) return;
    const score = scoreLogoCandidate(url, fullContext, role, baseScore);
    const existing = candidates.get(url);
    if (!existing || score > existing.score) {
      candidates.set(url, {
        url,
        rawValue: clean,
        sourceField,
        role,
        confidence: confidenceFromLogoScore(score, role),
        score,
      });
    }
  };

  add(readLogo(schema), 'jsonLd.logo', 'logo', 82);
  $('link[rel*="icon" i],link[rel*="mask-icon" i]').each((_, el) => {
    add($(el).attr('href'), 'metadata.icon', 'icon', 76, [
      $(el).attr('rel'),
      $(el).attr('type'),
      $(el).attr('sizes'),
    ].filter(Boolean).join(' '));
  });
  $('meta[property="og:logo"],meta[name="msapplication-TileImage"]').each((_, el) => {
    add($(el).attr('content'), 'metadata.logoImage', 'logo', 80, $(el).attr('property') ?? $(el).attr('name') ?? '');
  });
  $('img[alt*="logo" i],img[src*="logo" i],img[src*="mark" i],img[srcset*="logo" i],img[srcset*="mark" i],[data-logo-src]').each((_, el) => {
    const node = $(el);
    const context = [
      node.attr('alt'),
      node.attr('class'),
      node.attr('id'),
      node.attr('aria-label'),
    ].filter(Boolean).join(' ');
    for (const sourceValue of imageSourceCandidates(node)) {
      add(sourceValue, 'website.logoImage', 'logo', 90, context);
    }
  });

  $('a[href] img,header img,nav img,[class*="logo" i] img,[id*="logo" i] img,[class*="brand" i] img,[aria-label*="logo" i] img').each((_, el) => {
    const node = $(el);
    const link = node.closest('a');
    const wrapper = node.closest('a,[class*="logo" i],[id*="logo" i],[class*="brand" i],[aria-label*="logo" i],header,nav');
    const context = [
      node.attr('alt'),
      node.attr('class'),
      node.attr('id'),
      node.attr('aria-label'),
      link.attr('href'),
      link.attr('aria-label'),
      link.attr('title'),
      wrapper.attr('class'),
      wrapper.attr('id'),
      wrapper.attr('aria-label'),
    ].filter(Boolean).join(' ');
    if (!isLikelyLogoWrapperContext(context)) return;
    for (const sourceValue of imageSourceCandidates(node)) {
      add(sourceValue, 'website.logoWrapperImage', 'logo', 74, context);
    }
  });

  return [...candidates.values()]
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url))
    .slice(0, 12)
    .map(({ score: _score, ...candidate }) => candidate);
}

function extractSocialPreviewImages($: ReturnType<typeof load>, normalizedUrl: string): string[] {
  const baseUrl = new URL(normalizedUrl);
  return uniqueText([meta($, ['og:image']), meta($, ['twitter:image'])]
    .map((value) => (value ? resolveWebsiteAssetUrl(value, baseUrl) : undefined)))
    .slice(0, 4);
}

function extractProductImages($: ReturnType<typeof load>, normalizedUrl: string): BrandWebsiteProductImageCandidate[] {
  const baseUrl = new URL(normalizedUrl);
  const images = new Map<string, BrandWebsiteProductImageCandidate>();

  $('img,source').each((_, el) => {
    const node = $(el);
    const altText = cleanText(node.attr('alt') ?? node.attr('aria-label') ?? node.attr('title'));
    const nearbyText = cleanText(node.closest('figure,article,section,div').find('figcaption,h1,h2,h3,p').first().text());
    const context = [
      altText,
      nearbyText,
      node.attr('class'),
      node.attr('id'),
      node.attr('data-testid'),
      node.attr('data-test'),
      node.attr('src'),
      node.attr('srcset'),
    ].filter(Boolean).join(' ');
    if (!PRODUCT_IMAGE_CONTEXT_PATTERN.test(context)) return;
    for (const sourceValue of imageSourceCandidates(node)) {
      const url = resolveWebsiteAssetUrl(sourceValue, baseUrl);
      if (!url || !isProductImageCandidate(url, context)) continue;
      const candidate: BrandWebsiteProductImageCandidate = {
        url,
        rawValue: sourceValue,
        sourceField: 'website.productImage',
        altText,
        context: sanitizeEvidenceExcerpt(uniqueText([altText, nearbyText, node.attr('class'), node.attr('id')]).join(' '), 220),
        confidence: confidenceForProductImage(url, context, altText),
      };
      const existing = images.get(url);
      if (!existing || candidate.confidence > existing.confidence) images.set(url, candidate);
    }
  });

  return [...images.values()]
    .sort((left, right) => right.confidence - left.confidence || left.url.localeCompare(right.url))
    .slice(0, 16);
}

// Third-party review / social-proof / badge hosts. Their embed images carry "product" in the alt or host
// (e.g. a Product Hunt badge alt="Product Hunt") but are NEVER the brand's own product — including them
// pollutes assets.productImages (fed to Clickatron's product-mockup reference + the storyboard evidence gate).
const THIRD_PARTY_BADGE_HOST_PATTERN =
  /(?:^|\.)(?:producthunt\.com|g2(?:crowd)?\.com|capterra\.com|trustpilot\.com|getapp\.com|softwareadvice\.com|sourceforge\.net|slashdot\.org|clutch\.co|gartner\.com|trustradius\.com|shields\.io|badgen\.net)$/i;
// Badge / widget path or subdomain segments on any host (word-boundaried so it won't hit e.g. /embedded-x).
const THIRD_PARTY_BADGE_SEGMENT_PATTERN = /(?:^|[./-])(?:badge|badges|widget|widgets)(?:[./-]|$)/i;

function isProductImageCandidate(url: string, context: string): boolean {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();
  if (THIRD_PARTY_BADGE_HOST_PATTERN.test(host)) return false;
  if (THIRD_PARTY_BADGE_SEGMENT_PATTERN.test(host) || THIRD_PARTY_BADGE_SEGMENT_PATTERN.test(path)) return false;
  if (!IMAGE_ASSET_EXTENSIONS.has(pathExtension(path))) return false;
  if (SOCIAL_PREVIEW_ASSET_PATTERN.test(path) || STRONG_LOGO_CONTEXT_PATTERN.test(context) || isLogoAssetCandidate(url, context)) return false;
  return PRODUCT_IMAGE_CONTEXT_PATTERN.test(`${path} ${context}`);
}

// Own-profile social hosts. A website scan should discover the brand's socials from the page itself
// (footer icons, rel=me, twitter:site) instead of forcing the user to type them.
const SOCIAL_PROFILE_HOST_PATTERN =
  /(?:^|\.)(?:instagram\.com|linkedin\.com|facebook\.com|fb\.com|twitter\.com|x\.com|youtube\.com|youtu\.be|tiktok\.com|pinterest\.com|threads\.net)$/i;

/**
 * Harvest the brand's OWN social profile URLs from the page HTML — footer/nav links, `<link rel="me">`,
 * and the `twitter:site` meta handle. Skips share/intent links and bare domains (not profiles). Deduped by
 * origin+path and capped. Enables social evidence on a plain website scan (see brand-vault-social-evidence).
 */
export function extractSocialProfileLinks(html: string, baseUrl: string, max = 10): string[] {
  let base: URL | undefined;
  try {
    base = new URL(baseUrl);
  } catch {
    base = undefined;
  }
  const $ = load(html);
  const found = new Set<string>();

  const consider = (raw: string | null | undefined): void => {
    if (!raw || found.size >= max) return;
    let url: URL;
    try {
      url = new URL(raw, base);
    } catch {
      return;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
    if (!SOCIAL_PROFILE_HOST_PATTERN.test(url.hostname.toLowerCase())) return;
    const path = url.pathname.replace(/\/+$/, '');
    // Must point at a profile (a path), not a bare domain or a share/intent/sharer/dialog endpoint.
    if (!path || /\/(?:share|sharer|intent|dialog|home|login|signup)\b/i.test(path)) return;
    found.add(`${url.origin}${path}`);
  };

  $('a[href]').each((_, el) => consider($(el).attr('href')));
  $('link[rel="me"]').each((_, el) => consider($(el).attr('href')));
  const twitterSite = $('meta[name="twitter:site"]').attr('content')?.trim();
  if (twitterSite) {
    const handle = twitterSite.replace(/^@/, '');
    if (/^[a-z0-9_]{1,15}$/i.test(handle)) consider(`https://x.com/${handle}`);
  }
  return Array.from(found).slice(0, max);
}

function confidenceForProductImage(url: string, context: string, altText: string | undefined): number {
  const parsed = new URL(url);
  const haystack = `${parsed.pathname} ${context}`.toLowerCase();
  let value = 0.46;
  if (altText) value += 0.08;
  if (/\b(?:product|dashboard|platform|app|demo|mockup|studio|workflow|packshot|hero-product)\b/.test(haystack)) value += 0.1;
  if (/\b(?:collection|catalog|pdp|plp|shopify|sku|item)\b/.test(haystack)) value += 0.05;
  if (/\b(?:hero|above[-_\s]?fold|feature|showcase)\b/.test(haystack)) value += 0.04;
  if (/\b(?:thumb|thumbnail|icon|avatar|sprite|badge|payment)\b/.test(haystack)) value -= 0.08;
  return Math.min(0.78, Math.max(0.42, value));
}

function pathExtension(pathname: string): string {
  const dotIndex = pathname.lastIndexOf('.');
  return dotIndex >= 0 ? pathname.slice(dotIndex) : '';
}

export function inferProductServices(values: Array<string | undefined>): string[] {
  const candidates: string[] = [];
  for (const value of values) {
    const cleaned = cleanText(value);
    if (!cleaned) continue;
    for (const segment of cleaned.split(/(?:[.!?]\s+|\n+|[|•·]\s*)/)) {
      const candidate = cleanProductServicePhrase(segment);
      if (candidate) candidates.push(candidate);
    }
  }
  return uniqueText(candidates).slice(0, 14);
}

function cleanProductServicePhrase(value: string): string | undefined {
  let phrase = cleanText(value)
    ?.replace(/\s+-\s+.*$/, '')
    .replace(/\s+(?:\|\s*)?(?:shop now|buy now|learn more|add to cart)\b.*$/i, '')
    .replace(/^[\s,.;:|-]+|[\s,.;:|-]+$/g, '')
    .trim();
  if (!phrase) return undefined;
  const proposition = phrase.match(PRODUCT_SERVICE_PROPOSITION_PATTERN)?.[1];
  if (proposition) {
    phrase = proposition
      .replace(/^[\s,.;:|-]+|[\s,.;:|-]+$/g, '')
      .trim();
  }
  if (phrase.length < 4 || phrase.length > 96) return undefined;
  if (/^https?:\/\//i.test(phrase) || /[{}<>]|(?:function|const|var|=>|\.__|document\.|window\.)/.test(phrase)) return undefined;
  if (PRODUCT_SERVICE_NOISE_PATTERN.test(phrase)) return undefined;
  if (/^(?:products?|services?|solutions?|features?|collections?|new arrivals?|best sellers?|home|about|contact)$/i.test(phrase)) return undefined;
  if (/[?]/.test(phrase) || PRODUCT_SERVICE_FRAGMENT_PATTERN.test(phrase)) return undefined;
  if (/^\d+(?:[,.]\d+)*\+?$/.test(phrase)) return undefined;
  const words = phrase.split(/\s+/).filter(Boolean);
  if (words.length > 10) return undefined;
  if (!PRODUCT_SERVICE_NOUN_PATTERN.test(phrase)) return undefined;
  return phrase;
}

export function extractLinkedStylesheetUrls(html: string, normalizedUrl: string, limit = 8): string[] {
  const $ = load(html);
  const baseUrl = new URL(normalizedUrl);
  const trustedCrossOriginStylesheetHosts = new Set(['cdn.shopify.com', 'fonts.googleapis.com', 'fonts.gstatic.com']);
  const urls: string[] = [];
  const add = (rawValue: string | undefined): void => {
    const clean = cleanText(rawValue);
    const url = clean ? resolveWebsiteAssetUrl(clean, baseUrl) : undefined;
    if (!url) return;
    const parsed = new URL(url);
    if (parsed.origin !== baseUrl.origin && !trustedCrossOriginStylesheetHosts.has(parsed.hostname)) return;
    urls.push(url);
  };

  $('link[href]').each((_, el) => {
    const rel = $(el).attr('rel') ?? '';
    const as = ($(el).attr('as') ?? '').toLowerCase();
    if (/\bstylesheet\b/i.test(rel) || (/\bpreload\b/i.test(rel) && as === 'style')) {
      add($(el).attr('href'));
    }
  });

  return uniqueText(urls).slice(0, limit);
}

function resolveWebsiteAssetUrl(value: string, baseUrl: URL): string | undefined {
  try {
    const url = new URL(value, baseUrl);
    url.hash = '';
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

function isLogoAssetCandidate(url: string, context = ''): boolean {
  const parsed = new URL(url);
  const path = parsed.pathname.toLowerCase();
  if (SOCIAL_PREVIEW_ASSET_PATTERN.test(path)) return false;
  const fullContext = `${path} ${context}`;
  if (NON_LOGO_ASSET_CONTEXT_PATTERN.test(fullContext) && !STRONG_LOGO_CONTEXT_PATTERN.test(fullContext)) return false;
  const extension = assetExtension(path);
  if (extension && IMAGE_ASSET_EXTENSIONS.has(extension)) return true;
  return /\b(?:logo|logomark|wordmark|brandmark|brand|mark|icon)\b/i.test(path);
}

function isLikelyLogoWrapperContext(context: string): boolean {
  const normalized = cleanText(context) ?? '';
  if (STRONG_LOGO_CONTEXT_PATTERN.test(normalized)) return true;
  if (/\b(?:brand|brandmark|wordmark|navbar-brand|site-logo|site-title|home|homepage|main navigation)\b/i.test(normalized)) return true;
  return /(?:^|\s)\/(?:\s|$)/.test(normalized) && !NON_LOGO_ASSET_CONTEXT_PATTERN.test(normalized);
}

function imageSourceCandidates(node: { attr(name: string): string | undefined }): string[] {
  return uniqueText([
    node.attr('src'),
    node.attr('data-src'),
    node.attr('data-lazy-src'),
    node.attr('data-original'),
    node.attr('data-logo-src'),
    ...parseSrcset(node.attr('srcset')),
    ...parseSrcset(node.attr('data-srcset')),
  ]);
}

function parseSrcset(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim().split(/\s+/)[0])
    .filter((item): item is string => Boolean(item));
}

function scoreLogoCandidate(url: string, context: string, role: BrandWebsiteLogoCandidateRole, baseScore: number): number {
  const parsed = new URL(url);
  const path = parsed.pathname.toLowerCase();
  let score = baseScore;
  if (path.endsWith('.svg')) score += 18;
  if (/\b(?:logo|logomark|wordmark|brandmark)\b/i.test(`${path} ${context}`)) score += 12;
  if (/\b(?:mark|icon)\b/i.test(`${path} ${context}`)) score += 4;
  if (/\b(?:apple-touch-icon|android-chrome)\b/i.test(path)) score += 8;
  if (/\bfavicon\b/i.test(path)) score -= 18;
  const size = largestAssetSize(`${path} ${context}`);
  if (size >= 512) score += 10;
  else if (size >= 180) score += 6;
  else if (size >= 64) score += 3;
  if (role === 'logo') score += 4;
  return score;
}

function confidenceFromLogoScore(score: number, role: BrandWebsiteLogoCandidateRole): number {
  const ceiling = role === 'logo' ? 0.86 : 0.78;
  const floor = role === 'logo' ? 0.48 : 0.42;
  return Math.min(ceiling, Math.max(floor, clamp01((role === 'logo' ? 0.44 : 0.34) + score / 220)));
}

function largestAssetSize(value: string): number {
  let largest = 0;
  for (const match of value.matchAll(/\b(\d{2,4})x(\d{2,4})\b/gi)) {
    largest = Math.max(largest, Number(match[1]), Number(match[2]));
  }
  return largest;
}

function assetExtension(path: string): string | undefined {
  const match = path.match(/\.[a-z0-9]+$/i);
  return match?.[0];
}

export function source(
  candidateSourceType: BrandEvidenceCandidateSourceType,
  sourceField: string,
  rawValue: unknown,
  normalizedValue: unknown,
  confidence: number,
  authorityClass: SignalSource['authorityClass'],
): SignalSource {
  return { candidateSourceType, sourceField, rawValue, normalizedValue, confidence, authorityClass };
}

export function fallbackSource(reason: string): SignalSource {
  return {
    candidateSourceType: 'website',
    sourceField: 'fallback',
    rawValue: reason,
    normalizedValue: reason,
    excerpt: reason,
    confidence: 0.15,
    authorityClass: 'inferred_hint',
    trustLevel: 'fallback_default',
  };
}

export function candidateOnly(
  signalPath: string,
  value: string,
  sourceType: BrandEvidenceCandidateSourceType,
  sourceField: string,
  sourceUrl: string,
  observedAt: string,
  extractorId: string,
  input: BrandWebsiteDraftInput,
): BrandEvidenceCandidate {
  return {
    id: `candidate_${sourceField.replace(/[^a-z0-9]+/gi, '_')}_${Math.abs(hash(value))}`,
    brandId: input.brandId,
    jobId: input.jobId,
    sourceType,
    sourceUrl,
    sourceField,
    signalPath,
    rawValue: value,
    normalizedValue: value,
    excerpt: sanitizeEvidenceExcerpt(value),
    confidence: 0.62,
    authorityClass: 'owned',
    observedAt,
    extractorId,
  };
}

export function inferCategory(text: string): string {
  const lower = text.toLowerCase();
  if (/\b(?:creative software|design software|editing software|creative apps?|design apps?|document cloud|creative cloud|pdf software|3d design|cad|computer-aided design|architecture engineering construction|manufacturing software|javascript librar(?:y|ies)|typescript librar(?:y|ies)|ui librar(?:y|ies)|react frameworks?|full-stack frameworks?|javascript frameworks?|web frameworks?|native frameworks?|component frameworks?|app frameworks?|web applications?|react components?|web and native user interfaces|developer tools?)\b/.test(lower)) return 'software';
  const ranked = CATEGORY_RULES
    .map(({ label, signals }) => ({
      label,
      score: signals.reduce((sum, [pattern, weight]) => sum + countMatches(lower, pattern) * weight, 0),
    }))
    .sort((a, b) => b.score - a.score || categorySpecificityRank(b.label) - categorySpecificityRank(a.label));
  const best = ranked[0];
  if (!best || best.score < 1.5) return 'unknown';
  const specific = ranked.find((item) => !GENERIC_CATEGORY_LABELS.has(item.label) && item.score >= 1.5);
  if (specific && GENERIC_CATEGORY_LABELS.has(best.label) && best.score - specific.score <= genericCategoryDominanceMargin(best.label)) {
    return specific.label;
  }
  return best.label;
}

function categorySpecificityRank(label: string): number {
  return GENERIC_CATEGORY_LABELS.has(label) ? 0 : 1;
}

function genericCategoryDominanceMargin(label: string): number {
  if (label === 'commerce') return 4;
  if (label === 'software' || label === 'creative services') return 3;
  return 2;
}

export function inferIndustry(text: string, schemaTypes: string[] = []): string | undefined {
  const lower = text.toLowerCase();
  if (/\b(?:automated\s+)?content production\b/.test(lower) && /\b(?:platform|software|automation|workflow|ai)\b/.test(lower)) {
    return 'content production software';
  }
  if (/\b(?:revenue intelligence|pipeline data|forecast accuracy|b2b analytics)\b/.test(lower)) return 'B2B analytics';
  if (/\b(?:issue tracking|project management|roadmaps?|cycles|product development)\b/.test(lower)) {
    return 'product management software';
  }
  if (/\b(?:javascript librar(?:y|ies)|typescript librar(?:y|ies)|ui librar(?:y|ies)|react frameworks?|full-stack frameworks?|javascript frameworks?|web frameworks?|native frameworks?|component frameworks?|app frameworks?|web applications?|react components?|web and native user interfaces|developer tools?)\b/.test(lower)) return 'software';
  if (/\b(?:creative software|design software|editing software|creative apps?|design apps?|document cloud|creative cloud|pdf software)\b/.test(lower)) return 'creative software';
  if (/\b(?:3d design|cad|computer-aided design|architecture engineering construction|manufacturing software)\b/.test(lower)) return 'design software';
  if (isSpecialtyCoffeeBrand(lower)) return 'specialty coffee';

  const category = inferCategory(text);
  if (category !== 'unknown') return category;

  const specificSchemaType = schemaTypes.find((type) => !isGenericSchemaIndustryType(type));
  return specificSchemaType ? titleCaseSchemaType(specificSchemaType) : undefined;
}

function isSpecialtyCoffeeBrand(lower: string): boolean {
  if (/\bspecialty coffee\b/.test(lower)) return true;
  return /\bcoffee\b/.test(lower) && /\b(?:roaster|cafe|espresso|beans|brew|cold brew|barista)\b/.test(lower);
}

export function inferAudience(text: string): string[] {
  const explicitMatches = [
    ...text.matchAll(/\bfor\s+([^.!?\n;:]{4,180})/gi),
    ...text.matchAll(/\b(?:built|made|designed|created|engineered)\s+for\s+([^.!?\n;:]{4,180})/gi),
    ...text.matchAll(/\bhelps?\s+([^.!?\n;:]{4,180})/gi),
    ...text.matchAll(/\bused by\s+([^.!?\n;:]{4,180})/gi),
    ...text.matchAll(/\btrusted by\s+(?:[\d,.]+\+?\s+)?([^.!?\n;:]{4,180})/gi),
    ...text.matchAll(/\b\d[\d,.]*\+?\s+((?:[a-z0-9&-]+\s+){0,4}(?:teams?|agencies|operators|creators|studios|houses|filmmakers|leaders|businesses|companies|clients|customers))\b/gi),
  ]
    .flatMap((match) => expandAudiencePhrases(match[1]))
    .filter((value): value is string => Boolean(value));

  return rankAudiencePhrases([...explicitMatches, ...extractAudienceEntityPhrases(text)]).slice(0, 6);
}

function extractAudienceEntityPhrases(text: string): string[] {
  const matches = [
    ...text.matchAll(AUDIENCE_ENTITY_PHRASE_PATTERN),
    ...text.matchAll(AUDIENCE_POSSESSIVE_VERTICAL_PATTERN),
  ]
    .flatMap((match) => expandAudiencePhrases(match[1]))
    .filter((value): value is string => Boolean(value));
  return uniqueText(matches);
}

function expandAudiencePhrases(value: string | undefined): string[] {
  const phrase = cleanText(value);
  if (!phrase) return [];
  return phrase
    .replace(/\s*,\s*(?:and|&)\s+/gi, ', ')
    .split(/\s*,\s*/)
    .map(cleanAudiencePhrase)
    .filter((item): item is string => Boolean(item));
}

function cleanAudiencePhrase(value: string | undefined): string | undefined {
  let phrase = cleanText(value);
  if (!phrase) return undefined;

  phrase = phrase.replace(/^(?:the|a|an|our|your)\s+/i, '');
  phrase = phrase.replace(/^[\d,.]+\+?\s+/, '');
  phrase = phrase.split(/\b(?:shop now|add to cart|buy now|wishlist|no reviews?|customer reviews?|mrp|price|sale|discount|free shipping|cash on delivery|cod|checkout|cart|sku|variant|select size|select colour|select color|new arrivals?|best sellers?|view all|quick view|sold out|login|sign in|track order|country\/region|newsletter|subscribe)\b/i)[0] ?? phrase;
  phrase = phrase.split(/\s+(?:to|who|that|with|without|using|through|via|into|by|from|in|across|during|while)\s+/i)[0] ?? phrase;
  phrase = splitAudienceActionPhrase(phrase);
  phrase = phrase.replace(/\b(?:fast|faster|trusted|simple|easy|better)\s*$/i, '');
  phrase = cleanText(phrase);
  if (!phrase || phrase.length < 4 || phrase.length > 64) return undefined;
  if (/\b(?:and|or|to|for|with|without|by|from|into|through|via)$/i.test(phrase)) return undefined;
  if (/\b(book|start|get|try|request|schedule|download|subscribe)\b/i.test(phrase)) return undefined;
  if (/\b(?:planning and building|building|shipping)\s+products?\b/i.test(phrase)) return 'product teams';
  if (/\bteams?\b/i.test(phrase) && /\bproducts?\b/i.test(phrase)) return 'product teams';
  if (isNonAudiencePhrase(phrase)) return undefined;
  if (isGenericAudiencePhrase(phrase)) return undefined;

  return phrase;
}

function splitAudienceActionPhrase(phrase: string): string {
  return phrase.split(/\s+(?:turn|build|launch|run|improve|ship|create|grow|manage|make|cut|drive|unlock|accept|optimise|optimize|enable|embed|monetise|monetize|shop|browse|compare|choose|discover)\b/i)[0] ?? phrase;
}

function rankAudiencePhrases(values: string[]): string[] {
  return uniqueText(values)
    .filter((value) => !isNonAudiencePhrase(value))
    .filter((value) => !isGenericAudiencePhrase(value))
    .sort((a, b) => audienceSpecificityScore(b) - audienceSpecificityScore(a) || a.localeCompare(b));
}

function audienceSpecificityScore(value: string): number {
  const words = value.split(/\s+/).length;
  return Math.min(words, 5) + (SPECIFIC_AUDIENCE_MODIFIER_PATTERN.test(value) ? 4 : 0) + (/[A-Z]{2,}/.test(value) ? 2 : 0);
}

function isGenericAudiencePhrase(value: string): boolean {
  const normalized = value.trim();
  if (GENERIC_AUDIENCE_PATTERN.test(normalized) && !SPECIFIC_AUDIENCE_MODIFIER_PATTERN.test(normalized)) return true;
  if (/^(?:teams?\s+and\s+agents?|agents?\s+and\s+teams?)$/i.test(normalized)) return true;
  if (AUDIENCE_STANDALONE_DOMAIN_PATTERN.test(normalized)) return true;
  const words = normalized.split(/\s+/);
  return words.length <= 2 && !SPECIFIC_AUDIENCE_MODIFIER_PATTERN.test(normalized);
}

function isNonAudiencePhrase(value: string): boolean {
  const normalized = value.trim();
  if (AUDIENCE_FRAGMENT_PREFIX_PATTERN.test(normalized)) return true;
  if (AUDIENCE_NON_ENTITY_PATTERN.test(normalized)) return true;
  if (AUDIENCE_PROMO_NOISE_PATTERN.test(normalized)) return true;
  if (AUDIENCE_PRODUCT_UNIT_PATTERN.test(normalized)) return true;
  if (AUDIENCE_PRODUCT_BENEFIT_PATTERN.test(normalized)) return true;
  if (AUDIENCE_PRODUCT_FEATURE_PATTERN.test(normalized)) return true;
  if (/\|/.test(normalized)) return true;
  if (AUDIENCE_CODE_OR_MARKUP_PATTERN.test(normalized)) return true;
  if (/[\u20b9\u20ac\u00a3$]\s?\d|\b(?:rs\.?|inr|usd|eur|gbp)\s?\d/i.test(normalized)) return true;
  if (/^multiple clients\b/i.test(normalized)) return true;
  if (/^(?:us|we|our|ours|me|my)\b/i.test(normalized)) return true;
  if (/\b(?:floor|running and accessible|accessible|tools?|tooling|standard)\b/i.test(normalized)) return true;
  if (/\bbrand$/i.test(normalized) && !/\b(?:brands|brand\s+(?:teams?|leaders?|managers?|owners?|marketers?|builders?|operators?))\b/i.test(normalized)) {
    return true;
  }
  return false;
}

function isGenericSchemaIndustryType(value: string): boolean {
  return /^(?:Organization|Corporation|LocalBusiness|WebSite|WebPage|Brand|Product|Thing)$/i.test(value.trim());
}

function titleCaseSchemaType(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function inferProofStyle(text: string): BrandProofStyle {
  const lower = text.toLowerCase();
  if (/(roi|metric|percent|analytics|report|data)/.test(lower)) return 'metrics';
  if (/(testimonial|customer|case study|trusted by)/.test(lower)) return 'testimonial';
  if (/(certified|expert|authority|compliance|secure)/.test(lower)) return 'authority';
  if (/(community|members|creators)/.test(lower)) return 'community';
  if (/(demo|tour|tutorial|watch)/.test(lower)) return 'demo';
  if (/(editorial|newsletter|journal)/.test(lower)) return 'editorial';
  return 'unknown';
}

export function inferHookArchetypes(headings: string[]): string[] {
  const joined = headings.join(' ').toLowerCase();
  const hooks: string[] = [];
  if (/\d+%|\d+x|\broi\b/.test(joined)) hooks.push('metric-led hook');
  if (/\bwithout\b|\bstop\b|\bnever\b/.test(joined)) hooks.push('pain-removal hook');
  if (/\bhow\b|\bguide\b|\blearn\b/.test(joined)) hooks.push('education hook');
  if (/\btrusted\b|\bcustomer\b|\bcase\b/.test(joined)) hooks.push('proof-led hook');
  return hooks;
}

export function inferRecurringPhrases(headings: string[], ctas: string[]): string[] {
  return uniqueText([...headings, ...ctas].map(normalizeRecurringPhrase))
    .filter(isMeaningfulBrandPhrase)
    .slice(0, 8);
}

function normalizeRecurringPhrase(value: string | undefined): string | undefined {
  return cleanText(value?.replace(/([.!?])(?=\S)/g, '$1 ').replace(/([a-z])([A-Z]{2,}\b)/g, '$1 $2'));
}

function isMeaningfulBrandPhrase(value: string): boolean {
  const phrase = cleanText(value);
  if (!phrase) return false;
  if (isPureCtaPhrase(phrase)) return false;
  if (isGenericRecurringPhrase(phrase)) return false;
  if (phrase.length > 120) return false;
  const words = phrase.split(/\s+/).length;
  if (words > 9) return false;
  return phrase.length >= 10 && (words >= 3 || /\d/.test(phrase));
}

function isGenericRecurringPhrase(value: string): boolean {
  if (/^(?:choose your access level|stay in the loop|sponsor a room|build with us|back the mission|write for us|how can we help\??|frequently asked questions|learn the floor)$/i.test(value)) {
    return true;
  }
  if (/^for\s+(?:agenc(?:y|ies)|in-house teams?|businesses?|enterprises?|creator houses?|filmmakers?|teams?)$/i.test(value)) {
    return true;
  }
  if (/^(?:store|site|app|page|platform|tools?)\s+they\b/i.test(value)) return true;
  if (/^(?:shop now|add to cart|buy now|new arrivals?|best sellers?|view all|quick view|sold out|select size|select colour|select color|track order|sign in|login|country\/region|no reviews?|customer reviews?)$/i.test(value)) {
    return true;
  }
  return false;
}

function isPureCtaPhrase(value: string): boolean {
  const phrase = value.trim();
  if (/^(?:learn more about|learn more|get a demo|get started|get started free|start free|try free|book a demo|request demo|contact sales)\b/i.test(phrase)) {
    return true;
  }
  if (/^(?:contact|contact us|contact sales|get started|start free|download|download brand assets|learn more|book a demo|request demo|try free)$/i.test(phrase)) {
    return true;
  }
  return CTA_PATTERN.test(phrase) && phrase.split(/\s+/).length <= 4;
}

export function inferTypographyCategory(text: string): BrandSignalProfile['typography']['category']['value'] {
  const primaryCategory = inferTypographyCategoryFromText(primaryFontFamily(text) ?? '');
  if (primaryCategory !== 'unknown') return primaryCategory;
  return inferTypographyCategoryFromText(text);
}

function primaryFontFamily(text: string): string | undefined {
  return text
    .split(',')
    .map((part) => cleanText(part.trim().replace(/^['"]|['"]$/g, '')))
    .find((part): part is string => {
      if (!part) return false;
      return !/^inherit$/i.test(part);
    });
}

function inferTypographyCategoryFromText(text: string): BrandSignalProfile['typography']['category']['value'] {
  const lower = text.toLowerCase();
  if (!lower) return 'unknown';
  if (/mono|code|console/.test(lower)) return 'mono';
  if (/slab/.test(lower)) return 'slab';
  if (/display|headline/.test(lower)) return 'display';
  if (/serif/.test(lower) && !/sans/.test(lower)) return 'serif';
  if (/sans|inter|arial|helvetica|system/.test(lower)) return 'sans';
  return 'mixed';
}

export function inferCasingBias(headings: string[]): BrandSignalProfile['typography']['casingBias']['value'] {
  const meaningful = headings.filter((heading) => heading.length > 3);
  if (!meaningful.length) return 'unknown';
  const uppercase = meaningful.filter((heading) => heading === heading.toUpperCase()).length;
  const lowercase = meaningful.filter((heading) => heading === heading.toLowerCase()).length;
  if (uppercase / meaningful.length > 0.5) return 'uppercase';
  if (lowercase / meaningful.length > 0.5) return 'lowercase';
  return 'mixed';
}

export function score(text: string, positive: string[], negative: string[]): number {
  const lower = text.toLowerCase();
  const pos = positive.filter((word) => lower.includes(word)).length;
  const neg = negative.filter((word) => lower.includes(word)).length;
  return clamp01(0.5 + pos * 0.15 - neg * 0.15);
}

export function titleBrand(title?: string): string | undefined {
  return cleanText(title?.split(/\s[|\-]\s/)[0]);
}

export function domainBrand(host: string): string {
  return host.split('.')[0].split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

export function cleanText(value: string | null | undefined): string | undefined {
  const cleaned = value?.replace(/\s+/g, ' ').trim();
  return cleaned || undefined;
}

export function firstDefined<T>(...values: Array<T | undefined>): T {
  const value = values.find((item) => item !== undefined);
  if (value === undefined) throw new Error('Expected at least one value.');
  return value;
}

export function uniqueText(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => cleanText(value)).filter((value): value is string => Boolean(value)))];
}

export function stringifyExcerpt(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join(', ');
  if (value === undefined || value === null) return undefined;
  return String(value);
}

export function chooseAccent(colors: string[], primary?: string): string | undefined {
  return colors
    .filter((color) => color !== primary && contrastRatio(color, DARK_SURFACE) >= 3)
    .sort((a, b) => saturation(b) - saturation(a))[0] ?? colors.find((color) => color !== primary);
}

export function inferContrastBias(colors: string[]): number {
  if (!colors.length) return 0.5;
  const avg = colors.reduce((sum, color) => sum + Math.max(contrastRatio(color, DARK_SURFACE), contrastRatio(color, LIGHT_SURFACE)), 0) / colors.length;
  return clamp01((avg - 1) / 10);
}

export function inferHarmony(primary?: string, accent?: string): BrandPaletteHarmony {
  if (!primary || !accent || primary === accent) return 'unknown';
  const diff = hueDiff(hue(primary), hue(accent));
  if (diff < 25) return 'monochromatic';
  if (diff < 70) return 'analogous';
  if (diff > 150 && diff < 210) return 'complementary';
  if (diff > 130 && diff <= 150) return 'split-complementary';
  if (diff > 100 && diff < 130) return 'triadic';
  return 'unknown';
}

export function contrastRatio(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const light = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (light + 0.05) / (dark + 0.05);
}

export function saturation(hex: string): number {
  return hsl(hex)[1];
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function nextEvidenceId(count: number, path: string): string {
  return `website_e${count + 1}_${path.replace(/[^a-z0-9]+/gi, '_')}`;
}

function meta($: ReturnType<typeof load>, keys: string[]): string | undefined {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  let value: string | undefined;
  $('meta').each((_, el) => {
    if (value) return;
    const node = $(el);
    const key = (node.attr('name') ?? node.attr('property') ?? '').toLowerCase();
    if (wanted.has(key)) value = cleanText(node.attr('content'));
  });
  return value;
}

function extractJsonLd(blocks: string[]): Record<string, unknown>[] {
  const objects: Record<string, unknown>[] = [];
  for (const block of blocks) {
    try {
      collectJsonObjects(JSON.parse(block) as unknown, objects);
    } catch {
      continue;
    }
  }
  return objects;
}

function collectJsonObjects(value: unknown, output: Record<string, unknown>[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectJsonObjects(item, output);
    return;
  }
  if (!isRecord(value)) return;
  output.push(value);
  if ('@graph' in value) collectJsonObjects(value['@graph'], output);
}

function chooseSchemaObject(
  objects: Record<string, unknown>[],
  normalizedUrl: string,
): Record<string, unknown> | undefined {
  const rootUrl = new URL(normalizedUrl);
  const rootWebsite = objects.find((object) =>
    hasSchemaType(object, 'website') && schemaObjectMatchesHost(object, rootUrl),
  );

  if (rootWebsite) {
    const publisher = resolveSchemaPublisher(rootWebsite, objects, rootUrl);
    if (publisher && isBrandIdentitySchemaObject(publisher) && schemaObjectMatchesHost(publisher, rootUrl)) {
      return publisher;
    }
    if (readString(rootWebsite, 'name')) return rootWebsite;
    if (publisher && isBrandIdentitySchemaObject(publisher) && !schemaObjectHasExplicitDifferentHost(publisher, rootUrl)) {
      return publisher;
    }
  }

  const hostBoundIdentity = objects.find((object) =>
    isBrandIdentitySchemaObject(object) && schemaObjectMatchesHost(object, rootUrl),
  );
  if (hostBoundIdentity) return hostBoundIdentity;

  // Legacy JSON-LD often omits both url and @id. Preserve the old ranking only when the
  // document cannot establish which entity owns the scanned host.
  return objects.find(isBrandIdentitySchemaObject) ?? objects[0];
}

function hasSchemaType(object: Record<string, unknown>, type: string): boolean {
  return readTypes(object).some((candidate) => candidate.toLowerCase() === type);
}

function isBrandIdentitySchemaObject(object: Record<string, unknown>): boolean {
  return readTypes(object).some((type) => /organization|localbusiness|corporation|product|brand|person/i.test(type));
}

function resolveSchemaPublisher(
  website: Record<string, unknown>,
  objects: Record<string, unknown>[],
  rootUrl: URL,
): Record<string, unknown> | undefined {
  const reference = website.publisher ?? website.creator ?? website.author;
  const referenceIds = schemaReferenceIds(reference, rootUrl);
  if (referenceIds.length > 0) {
    const referenced = objects.find((object) =>
      schemaReferenceIds(object['@id'], rootUrl).some((id) => referenceIds.includes(id)),
    );
    if (referenced) return referenced;
  }
  return isRecord(reference) ? reference : undefined;
}

function schemaReferenceIds(value: unknown, rootUrl: URL): string[] {
  const rawIds = Array.isArray(value)
    ? value.flatMap((item) => schemaReferenceIds(item, rootUrl))
    : typeof value === 'string'
      ? [value]
      : isRecord(value)
        ? [readString(value, '@id')]
        : [];
  return rawIds.flatMap((rawId) => {
    if (!rawId) return [];
    try {
      return [new URL(rawId, rootUrl).toString()];
    } catch {
      return [rawId];
    }
  });
}

function schemaObjectMatchesHost(object: Record<string, unknown>, rootUrl: URL): boolean {
  return schemaObjectHosts(object, rootUrl).includes(normalizedSchemaHost(rootUrl));
}

function schemaObjectHasExplicitDifferentHost(object: Record<string, unknown>, rootUrl: URL): boolean {
  const hosts = schemaObjectHosts(object, rootUrl);
  return hosts.length > 0 && !hosts.includes(normalizedSchemaHost(rootUrl));
}

function schemaObjectHosts(object: Record<string, unknown>, rootUrl: URL): string[] {
  return [readString(object, 'url'), readString(object, '@id')]
    .flatMap((value) => {
      if (!value) return [];
      try {
        return [normalizedSchemaHost(new URL(value, rootUrl))];
      } catch {
        return [];
      }
    });
}

function normalizedSchemaHost(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, '');
}

function extractColors($: ReturnType<typeof load>, stylesheetCss: string[] = []): string[] {
  const scores = new Map<string, { score: number; order: number }>();
  let order = 0;
  const add = (value: string | undefined, weight: number): void => {
    if (!value) return;
    for (const occurrence of colorOccurrencesFromText(value)) {
      const existing = scores.get(occurrence.color);
      const score = weight + occurrence.contextWeight + saturation(occurrence.color) * 2;
      scores.set(occurrence.color, {
        score: (existing?.score ?? 0) + score,
        order: existing?.order ?? order,
      });
      order += 1;
    }
  };

  $('meta[name="theme-color"],meta[property="theme-color"]').each((_, el) => add($(el).attr('content'), 12));
  $('style').each((_, el) => add($(el).text(), 2));
  for (const css of stylesheetCss) add(css, 2);
  $('[style]').each((_, el) => add($(el).attr('style'), 3));

  return [...scores.entries()]
    .filter(([, item]) => item.score > 0)
    .sort((a, b) => b[1].score - a[1].score || saturation(b[0]) - saturation(a[0]) || a[1].order - b[1].order)
    .map(([color]) => color)
    .slice(0, MAX_EXTRACTED_WEBSITE_COLORS);
}

function extractFonts($: ReturnType<typeof load>, stylesheetCss: string[] = []): string[] {
  const chunks = [
    ...$('style').map((_, el) => $(el).text()).get(),
    ...stylesheetCss,
    ...$('[style]').map((_, el) => $(el).attr('style') ?? '').get(),
  ];
  const fonts: string[] = [];
  for (const chunk of chunks) {
    for (const match of chunk.matchAll(FONT_FAMILY_DECLARATION_PATTERN)) {
      const family = firstUsableFontFamily(match[1] ?? '');
      if (family) fonts.push(family);
    }
  }
  return uniqueText(fonts).slice(0, 8);
}

const FONT_FACE_BLOCK_PATTERN = /@font-face\s*\{([^}]*)\}/gi;
const CSS_URL_PATTERN = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
const FONT_FILE_EXTENSION_PATTERN = /\.(?:woff2?|ttf|otf|eot)(?:[?#]|$)/i;

// Beyond the CSS font-family NAMES that extractFonts returns, this resolves the
// actual font FILES: @font-face src URLs (woff2/ttf/otf) and the weights declared
// for them, plus weights parsed from Google Fonts <link> URLs. Files only resolve
// when the font CSS was fetched into stylesheetCss (self-hosted, or the gstatic
// CSS behind a Google Fonts link); Google Fonts links still yield weights for free.
export function extractFontFaces(
  $: ReturnType<typeof load>,
  stylesheetCss: string[],
  baseUrl: URL,
): BrandWebsiteFontFace[] {
  const byFamily = new Map<string, { family: string; files: Set<string>; weights: Set<number> }>();
  const upsert = (rawFamily: string): { files: Set<string>; weights: Set<number> } | undefined => {
    const family = cleanFontFamily(rawFamily);
    if (!family) return undefined;
    const key = family.toLowerCase();
    const existing = byFamily.get(key);
    if (existing) return existing;
    const created = { family, files: new Set<string>(), weights: new Set<number>() };
    byFamily.set(key, created);
    return created;
  };

  const cssChunks = [...$('style').map((_, el) => $(el).text()).get(), ...stylesheetCss];
  for (const css of cssChunks) {
    for (const block of css.matchAll(FONT_FACE_BLOCK_PATTERN)) {
      const body = block[1] ?? '';
      const familyMatch = /font-family\s*:\s*([^;}]+)/i.exec(body);
      const entry = familyMatch ? upsert(familyMatch[1] ?? '') : undefined;
      if (!entry) continue;
      for (const urlMatch of body.matchAll(CSS_URL_PATTERN)) {
        const resolved = resolveWebsiteAssetUrl(urlMatch[2] ?? '', baseUrl);
        if (resolved && FONT_FILE_EXTENSION_PATTERN.test(resolved)) entry.files.add(resolved);
      }
      const weightMatch = /font-weight\s*:\s*([^;}]+)/i.exec(body);
      if (weightMatch) for (const weight of parseCssFontWeights(weightMatch[1] ?? '')) entry.weights.add(weight);
    }
  }

  $('link[href*="fonts.googleapis.com" i]').each((_, el) => {
    ingestGoogleFontsLink($(el).attr('href') ?? '', upsert);
  });

  return [...byFamily.values()]
    .map((entry) => ({
      family: entry.family,
      files: [...entry.files].slice(0, 6),
      weights: [...entry.weights].sort((a, b) => a - b),
    }))
    .filter((entry) => entry.files.length > 0 || entry.weights.length > 0)
    .slice(0, 8);
}

function parseCssFontWeights(value: string): number[] {
  const weights: number[] = [];
  for (const token of value.split(/[\s,]+/)) {
    const clean = token.trim().toLowerCase();
    if (/^\d{2,3}$/.test(clean)) weights.push(Number(clean));
    else if (clean === 'normal') weights.push(400);
    else if (clean === 'bold') weights.push(700);
  }
  return weights;
}

// Google Fonts URLs encode the family + weights: css2 "Family:wght@400;600;800"
// (or "ital,wght@0,400;1,700"), css v1 "Family:400,700". Files live in the gstatic
// CSS the link points to, not the link itself, so this only contributes weights.
function ingestGoogleFontsLink(
  href: string,
  upsert: (family: string) => { files: Set<string>; weights: Set<number> } | undefined,
): void {
  let url: URL;
  try {
    url = new URL(href, 'https://fonts.googleapis.com');
  } catch {
    return;
  }
  for (const spec of url.searchParams.getAll('family')) {
    const [namePart, ...axisParts] = spec.split(':');
    const entry = upsert((namePart ?? '').replace(/\+/g, ' '));
    if (!entry) continue;
    for (const weight of parseGoogleFontWeights(axisParts.join(':'))) entry.weights.add(weight);
  }
}

function parseGoogleFontWeights(axis: string): number[] {
  const weights: number[] = [];
  if (axis.includes('@')) {
    const [axesPart, valuesPart] = axis.split('@');
    const wghtIndex = (axesPart ?? '').split(',').indexOf('wght');
    for (const tuple of (valuesPart ?? '').split(';')) {
      const parts = tuple.split(',');
      const weight = wghtIndex >= 0 ? parts[wghtIndex] : parts[0];
      if (weight && /^\d{2,3}$/.test(weight.trim())) weights.push(Number(weight.trim()));
    }
  } else if (axis) {
    for (const token of axis.split(',')) {
      const match = /^(\d{2,3})/.exec(token.trim());
      if (match) weights.push(Number(match[1]));
    }
  }
  return weights;
}

function firstUsableFontFamily(value: string): string | undefined {
  return splitCssList(value)
    .map(cleanFontFamily)
    .find((family): family is string => Boolean(family));
}

function splitCssList(value: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  for (const char of value) {
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

function cleanFontFamily(value: string | undefined): string | undefined {
  const family = cleanText(value?.trim().replace(/^['"]|['"]$/g, ''));
  if (!family || isIgnoredFontFamily(family)) return undefined;
  return family;
}

function isIgnoredFontFamily(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    /^var\(/.test(lower) ||
    lower.startsWith('--') ||
    /\\|:/.test(value) ||
    /\bicons?\b/i.test(value) ||
    /\bfallback$/i.test(value) ||
    /^(?:system-ui|sans-serif|serif|monospace|cursive|fantasy|emoji|math|fangsong|inherit|initial|unset|revert|revert-layer)$/i.test(value)
  );
}

function colorsFromText(text: string): string[] {
  return uniqueText(colorOccurrencesFromText(text).map((occurrence) => occurrence.color));
}

function colorOccurrencesFromText(text: string): Array<{ color: string; contextWeight: number }> {
  const colors: Array<{ color: string; contextWeight: number }> = [];
  const add = (color: string | undefined, index: number): void => {
    if (!color) return;
    colors.push({ color, contextWeight: colorContextWeight(text, index) });
  };

  for (const match of text.matchAll(/#[0-9a-f]{3,8}\b/gi)) {
    add(normalizeHex(match[0]), match.index ?? 0);
  }
  for (const match of text.matchAll(/rgba?\(\s*([^)]+)\)/gi)) {
    add(parseRgbFunction(match[1] ?? ''), match.index ?? 0);
  }
  for (const match of text.matchAll(/hsla?\(\s*([^)]+)\)/gi)) {
    add(parseHslFunction(match[1] ?? ''), match.index ?? 0);
  }
  return colors;
}

function colorContextWeight(text: string, index: number): number {
  const context = text.slice(Math.max(0, index - COLOR_CONTEXT_RADIUS), index + COLOR_CONTEXT_RADIUS);
  const immediateContext = text.slice(Math.max(0, index - 48), index + 24);
  let weight = 0;
  if (STRONG_BRAND_COLOR_CONTEXT.test(context)) weight += 10;
  if (COLOR_PROPERTY_CONTEXT.test(context)) weight += 3;
  if (NEUTRAL_COLOR_CONTEXT.test(context)) weight -= 2;
  if (DEFAULT_UTILITY_COLOR_TOKEN_CONTEXT.test(immediateContext)) weight -= 24;
  if (COMPILED_UTILITY_COLOR_CONTEXT.test(context)) weight -= 12;
  return weight;
}

function readString(obj: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!obj) return undefined;
  const value = obj[key];
  if (typeof value === 'string') return cleanText(value);
  if (isRecord(value) && typeof value['@value'] === 'string') return cleanText(value['@value']);
  return undefined;
}

function readLogo(obj: Record<string, unknown> | undefined): string | undefined {
  if (!obj) return undefined;
  const logo = obj.logo;
  if (typeof logo === 'string') return cleanText(logo);
  if (Array.isArray(logo)) {
    return logo
      .map((item) => typeof item === 'string' ? cleanText(item) : isRecord(item) ? readString(item, 'url') ?? readString(item, 'contentUrl') : undefined)
      .find((item): item is string => Boolean(item));
  }
  if (isRecord(logo)) return readString(logo, 'url') ?? readString(logo, 'contentUrl');
  return undefined;
}

function readTypes(obj: Record<string, unknown> | undefined): string[] {
  if (!obj) return [];
  const value = obj['@type'];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return [];
}

function normalizeHex(value: string): string | undefined {
  const hex = value.trim().toLowerCase();
  if (/^#[0-9a-f]{8}$/.test(hex)) return parseInt(hex.slice(7, 9), 16) <= 16 ? undefined : hex.slice(0, 7);
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
  if (/^#[0-9a-f]{3}$/.test(hex)) return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  return undefined;
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0')).join('')}`;
}

function parseRgbFunction(value: string): string | undefined {
  if (hasTransparentRgbAlpha(value)) return undefined;
  const channels = value
    .split('/')[0]
    ?.trim()
    .split(value.includes(',') ? /\s*,\s*/ : /\s+/)
    .filter(Boolean)
    .slice(0, 3);
  if (!channels || channels.length < 3) return undefined;
  const parsed = channels.map(parseRgbChannel);
  if (parsed.some((channel) => channel === undefined)) return undefined;
  return rgbToHex(parsed[0]!, parsed[1]!, parsed[2]!);
}

function hasTransparentRgbAlpha(value: string): boolean {
  const slashAlpha = value.split('/')[1]?.trim();
  if (slashAlpha) return parseAlphaChannel(slashAlpha) <= 0.05;
  const commaParts = value.split(/\s*,\s*/);
  if (commaParts.length >= 4) return parseAlphaChannel(commaParts[3] ?? '1') <= 0.05;
  return false;
}

function parseAlphaChannel(value: string): number {
  const clean = value.trim();
  if (clean.endsWith('%')) {
    const percent = Number(clean.slice(0, -1));
    return Number.isFinite(percent) ? percent / 100 : 1;
  }
  const alpha = Number(clean);
  return Number.isFinite(alpha) ? alpha : 1;
}

function parseRgbChannel(value: string): number | undefined {
  if (value.endsWith('%')) {
    const percent = Number(value.slice(0, -1));
    return Number.isFinite(percent) ? Math.round((Math.max(0, Math.min(100, percent)) / 100) * 255) : undefined;
  }
  const channel = Number(value);
  return Number.isFinite(channel) ? Math.round(channel) : undefined;
}

function parseHslFunction(value: string): string | undefined {
  const channels = value
    .split('/')[0]
    ?.trim()
    .split(value.includes(',') ? /\s*,\s*/ : /\s+/)
    .filter(Boolean)
    .slice(0, 3);
  if (!channels || channels.length < 3) return undefined;
  const hueValue = parseHueChannel(channels[0]!);
  const saturationValue = parsePercentChannel(channels[1]!);
  const lightnessValue = parsePercentChannel(channels[2]!);
  if (hueValue === undefined || saturationValue === undefined || lightnessValue === undefined) return undefined;
  return hslToHex(hueValue, saturationValue, lightnessValue);
}

function parseHueChannel(value: string): number | undefined {
  const trimmed = value.trim().toLowerCase();
  const number = Number(trimmed.replace(/deg$/, ''));
  return Number.isFinite(number) ? ((number % 360) + 360) % 360 : undefined;
}

function parsePercentChannel(value: string): number | undefined {
  if (!value.endsWith('%')) return undefined;
  const percent = Number(value.slice(0, -1));
  return Number.isFinite(percent) ? clamp01(percent / 100) : undefined;
}

function hslToHex(hueValue: number, saturationValue: number, lightnessValue: number): string {
  const chroma = (1 - Math.abs(2 * lightnessValue - 1)) * saturationValue;
  const x = chroma * (1 - Math.abs(((hueValue / 60) % 2) - 1));
  const match = lightnessValue - chroma / 2;
  const [r, g, b] =
    hueValue < 60 ? [chroma, x, 0] :
      hueValue < 120 ? [x, chroma, 0] :
        hueValue < 180 ? [0, chroma, x] :
          hueValue < 240 ? [0, x, chroma] :
            hueValue < 300 ? [x, 0, chroma] :
              [chroma, 0, x];
  return rgbToHex(Math.round((r + match) * 255), Math.round((g + match) * 255), Math.round((b + match) * 255));
}

function hue(hex: string): number {
  return hsl(hex)[0];
}

function hueDiff(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hsl(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

function hash(value: string): number {
  return value.split('').reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0);
}
