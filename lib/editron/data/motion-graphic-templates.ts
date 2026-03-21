/**
 * Motion Graphic Templates — 30 Production-Ready HTML/CSS Animation Templates
 *
 * Each template uses {{slot}} variables for AI slot-fill.
 * All animations are self-contained CSS keyframes with no external dependencies.
 */

export interface MotionGraphicTemplate {
  templateId: string;
  name: string;
  category:
    | 'lower_third'
    | 'callout'
    | 'title_card'
    | 'data_viz'
    | 'transition'
    | 'subscribe'
    | 'social_proof'
    | 'stat_counter'
    | 'quote'
    | 'list_reveal'
    | 'comparison'
    | 'progress_bar'
    | 'countdown'
    | 'badge'
    | 'notification';
  tags: string[];
  semanticDescription: string;
  htmlTemplate: string;
  slots: {
    name: string;
    type: 'text' | 'number' | 'color' | 'url';
    default: string;
    description: string;
  }[];
  previewUrl?: string;
  dimensions: { width: number; height: number };
  defaultDuration: number;
  style: 'minimal' | 'bold' | 'elegant' | 'playful' | 'corporate' | 'cinematic';
}

// ═══════════════════════════════════════════════════════════════
// LOWER THIRDS (5)
// ═══════════════════════════════════════════════════════════════

const lowerThirdCleanMinimal: MotionGraphicTemplate = {
  templateId: 'lt-clean-minimal-001',
  name: 'Clean Minimal Lower Third',
  category: 'lower_third',
  tags: ['lower third', 'name', 'title', 'minimal', 'clean', 'simple', 'speaker', 'interview'],
  semanticDescription: 'A clean minimal lower third with name and title that slides in from the left with a subtle line accent. Perfect for interviews, speaker intros, and professional presentations.',
  htmlTemplate: `<div style="position:absolute;inset:0;width:100%;height:100%;overflow:hidden;font-family:system-ui,-apple-system,sans-serif;">
  <div style="position:absolute;bottom:80px;left:60px;display:flex;flex-direction:column;gap:4px;">
    <div style="display:flex;align-items:center;gap:12px;">
      <div style="width:3px;height:48px;background:{{accentColor}};animation:slideDown 0.5s ease-out both;"></div>
      <div>
        <div style="font-size:28px;font-weight:700;color:{{nameColor}};letter-spacing:-0.02em;animation:fadeSlideRight 0.6s ease-out 0.1s both;opacity:0;">{{name}}</div>
        <div style="font-size:16px;font-weight:400;color:{{titleColor}};letter-spacing:0.03em;text-transform:uppercase;animation:fadeSlideRight 0.6s ease-out 0.25s both;opacity:0;">{{title}}</div>
      </div>
    </div>
  </div>
  <style>
    @keyframes slideDown { from { transform:scaleY(0);transform-origin:top; } to { transform:scaleY(1);transform-origin:top; } }
    @keyframes fadeSlideRight { from { opacity:0;transform:translateX(-20px); } to { opacity:1;transform:translateX(0); } }
  </style>
</div>`,
  slots: [
    { name: 'name', type: 'text', default: 'John Smith', description: 'Person name' },
    { name: 'title', type: 'text', default: 'Creative Director', description: 'Job title or role' },
    { name: 'accentColor', type: 'color', default: '#4F8EF7', description: 'Accent line color' },
    { name: 'nameColor', type: 'color', default: '#FFFFFF', description: 'Name text color' },
    { name: 'titleColor', type: 'color', default: '#AABBCC', description: 'Title text color' },
  ],
  dimensions: { width: 1920, height: 1080 },
  defaultDuration: 150,
  style: 'minimal',
};

const lowerThirdBoldAccent: MotionGraphicTemplate = {
  templateId: 'lt-bold-accent-002',
  name: 'Bold Accent Bar Lower Third',
  category: 'lower_third',
  tags: ['lower third', 'bold', 'accent bar', 'name', 'title', 'modern', 'youtube'],
  semanticDescription: 'A bold lower third with a colored accent bar background that expands from left. Features a thick underline, large name, and subtitle. Great for YouTube intros and modern content.',
  htmlTemplate: `<div style="position:absolute;inset:0;width:100%;height:100%;overflow:hidden;font-family:system-ui,-apple-system,sans-serif;">
  <div style="position:absolute;bottom:60px;left:0;display:flex;flex-direction:column;">
    <div style="background:{{barColor}};padding:14px 48px 14px 60px;animation:expandRight 0.5s cubic-bezier(0.22,1,0.36,1) both;transform-origin:left;">
      <div style="font-size:32px;font-weight:800;color:{{nameColor}};letter-spacing:-0.01em;animation:fadeIn 0.4s ease 0.3s both;opacity:0;">{{name}}</div>
    </div>
    <div style="background:{{subtitleBg}};padding:8px 36px 8px 60px;animation:expandRight 0.5s cubic-bezier(0.22,1,0.36,1) 0.15s both;transform-origin:left;">
      <div style="font-size:15px;font-weight:500;color:{{subtitleColor}};text-transform:uppercase;letter-spacing:0.08em;animation:fadeIn 0.4s ease 0.45s both;opacity:0;">{{title}}</div>
    </div>
  </div>
  <style>
    @keyframes expandRight { from { transform:scaleX(0); } to { transform:scaleX(1); } }
    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
  </style>
</div>`,
  slots: [
    { name: 'name', type: 'text', default: 'Sarah Johnson', description: 'Person name' },
    { name: 'title', type: 'text', default: 'CEO & Founder', description: 'Job title' },
    { name: 'barColor', type: 'color', default: '#E63946', description: 'Main bar background' },
    { name: 'nameColor', type: 'color', default: '#FFFFFF', description: 'Name text color' },
    { name: 'subtitleBg', type: 'color', default: 'rgba(0,0,0,0.85)', description: 'Subtitle bar background' },
    { name: 'subtitleColor', type: 'color', default: '#E8E8E8', description: 'Subtitle text color' },
  ],
  dimensions: { width: 1920, height: 1080 },
  defaultDuration: 150,
  style: 'bold',
};

const lowerThirdAnimatedSlideIn: MotionGraphicTemplate = {
  templateId: 'lt-animated-slide-003',
  name: 'Animated Slide-In with Icon',
  category: 'lower_third',
  tags: ['lower third', 'slide', 'icon', 'animated', 'professional', 'speaker', 'podcast'],
  semanticDescription: 'An animated lower third that slides in from the left with a circular icon placeholder, name and role text. Features a smooth slide and fade combination with a pill-shaped container.',
  htmlTemplate: `<div style="position:absolute;inset:0;width:100%;height:100%;overflow:hidden;font-family:system-ui,-apple-system,sans-serif;">
  <div style="position:absolute;bottom:70px;left:50px;display:flex;align-items:center;gap:16px;animation:slideInLeft 0.6s cubic-bezier(0.22,1,0.36,1) both;">
    <div style="width:56px;height:56px;border-radius:50%;background:{{iconBg}};display:flex;align-items:center;justify-content:center;font-size:24px;color:{{iconColor}};font-weight:700;flex-shrink:0;box-shadow:0 4px 12px rgba(0,0,0,0.3);">{{icon}}</div>
    <div style="background:{{pillBg}};backdrop-filter:blur(12px);border-radius:12px;padding:12px 28px;border:1px solid rgba(255,255,255,0.1);">
      <div style="font-size:22px;font-weight:700;color:{{nameColor}};line-height:1.2;">{{name}}</div>
      <div style="font-size:13px;font-weight:400;color:{{roleColor}};letter-spacing:0.04em;margin-top:2px;">{{role}}</div>
    </div>
  </div>
  <style>
    @keyframes slideInLeft { from { opacity:0;transform:translateX(-100px); } to { opacity:1;transform:translateX(0); } }
  </style>
</div>`,
  slots: [
    { name: 'name', type: 'text', default: 'Alex Rivera', description: 'Person name' },
    { name: 'role', type: 'text', default: 'Lead Designer @ Figma', description: 'Role or context' },
    { name: 'icon', type: 'text', default: 'AR', description: 'Icon initials or emoji' },
    { name: 'iconBg', type: 'color', default: '#6C5CE7', description: 'Icon circle background' },
    { name: 'iconColor', type: 'color', default: '#FFFFFF', description: 'Icon text color' },
    { name: 'pillBg', type: 'color', default: 'rgba(0,0,0,0.7)', description: 'Pill background' },
    { name: 'nameColor', type: 'color', default: '#FFFFFF', description: 'Name color' },
    { name: 'roleColor', type: 'color', default: '#B0B0B0', description: 'Role text color' },
  ],
  dimensions: { width: 1920, height: 1080 },
  defaultDuration: 150,
  style: 'minimal',
};

const lowerThirdGradientFade: MotionGraphicTemplate = {
  templateId: 'lt-gradient-fade-004',
  name: 'Gradient Fade Lower Third',
  category: 'lower_third',
  tags: ['lower third', 'gradient', 'fade', 'subtitle', 'elegant', 'cinematic', 'film'],
  semanticDescription: 'An elegant lower third with a gradient fade background from transparent to dark. Features a thin top border accent line and vertically stacked name and subtitle with staggered fade-in animation.',
  htmlTemplate: `<div style="position:absolute;inset:0;width:100%;height:100%;overflow:hidden;font-family:system-ui,-apple-system,sans-serif;">
  <div style="position:absolute;bottom:0;left:0;right:0;height:180px;background:linear-gradient(transparent,rgba(0,0,0,0.85));display:flex;flex-direction:column;justify-content:flex-end;padding:0 80px 40px;">
    <div style="width:60px;height:2px;background:{{accentColor}};margin-bottom:12px;animation:widthExpand 0.8s ease-out 0.2s both;"></div>
    <div style="font-size:26px;font-weight:600;color:{{nameColor}};animation:fadeUp 0.6s ease-out 0.4s both;opacity:0;">{{name}}</div>
    <div style="font-size:15px;font-weight:300;color:{{subtitleColor}};margin-top:4px;letter-spacing:0.05em;animation:fadeUp 0.6s ease-out 0.55s both;opacity:0;">{{subtitle}}</div>
  </div>
  <style>
    @keyframes widthExpand { from { width:0; } to { width:60px; } }
    @keyframes fadeUp { from { opacity:0;transform:translateY(12px); } to { opacity:1;transform:translateY(0); } }
  </style>
</div>`,
  slots: [
    { name: 'name', type: 'text', default: 'Emma Chen', description: 'Name' },
    { name: 'subtitle', type: 'text', default: 'Documentary Filmmaker', description: 'Subtitle text' },
    { name: 'accentColor', type: 'color', default: '#F4A261', description: 'Accent line color' },
    { name: 'nameColor', type: 'color', default: '#FFFFFF', description: 'Name color' },
    { name: 'subtitleColor', type: 'color', default: '#CCCCCC', description: 'Subtitle color' },
  ],
  dimensions: { width: 1920, height: 1080 },
  defaultDuration: 150,
  style: 'cinematic',
};

const lowerThirdNewsStyle: MotionGraphicTemplate = {
  templateId: 'lt-news-style-005',
  name: 'News-Style Lower Third with Location',
  category: 'lower_third',
  tags: ['lower third', 'news', 'location', 'breaking', 'broadcast', 'reporter', 'tag'],
  semanticDescription: 'A news broadcast style lower third with a colored top label for location or category, a main name bar, and an animated ticker-style bottom line. Features a sharp, professional broadcast look.',
  htmlTemplate: `<div style="position:absolute;inset:0;width:100%;height:100%;overflow:hidden;font-family:system-ui,-apple-system,sans-serif;">
  <div style="position:absolute;bottom:50px;left:40px;animation:slideUp 0.5s cubic-bezier(0.22,1,0.36,1) both;">
    <div style="display:inline-block;background:{{labelBg}};padding:4px 16px;font-size:11px;font-weight:700;color:{{labelColor}};text-transform:uppercase;letter-spacing:0.12em;">{{location}}</div>
    <div style="background:{{mainBg}};padding:12px 32px;display:flex;align-items:center;gap:20px;min-width:360px;">
      <div>
        <div style="font-size:24px;font-weight:700;color:{{nameColor}};">{{name}}</div>
        <div style="font-size:13px;font-weight:400;color:{{titleColor}};margin-top:1px;">{{title}}</div>
      </div>
    </div>
    <div style="height:3px;background:{{labelBg}};animation:scaleXIn 0.6s ease-out 0.3s both;transform-origin:left;"></div>
  </div>
  <style>
    @keyframes slideUp { from { opacity:0;transform:translateY(30px); } to { opacity:1;transform:translateY(0); } }
    @keyframes scaleXIn { from { transform:scaleX(0); } to { transform:scaleX(1); } }
  </style>
</div>`,
  slots: [
    { name: 'name', type: 'text', default: 'Rachel Torres', description: 'Reporter/person name' },
    { name: 'title', type: 'text', default: 'Senior Correspondent', description: 'Title' },
    { name: 'location', type: 'text', default: 'LIVE — NEW YORK', description: 'Location tag or label' },
    { name: 'labelBg', type: 'color', default: '#C0392B', description: 'Label background' },
    { name: 'labelColor', type: 'color', default: '#FFFFFF', description: 'Label text color' },
    { name: 'mainBg', type: 'color', default: '#1A1A2E', description: 'Main bar background' },
    { name: 'nameColor', type: 'color', default: '#FFFFFF', description: 'Name color' },
    { name: 'titleColor', type: 'color', default: '#A0A0B0', description: 'Title color' },
  ],
  dimensions: { width: 1920, height: 1080 },
  defaultDuration: 180,
  style: 'corporate',
};

// ═══════════════════════════════════════════════════════════════
// CALLOUT BOXES (5)
// ═══════════════════════════════════════════════════════════════

const calloutStatCounter: MotionGraphicTemplate = {
  templateId: 'co-stat-counter-001',
  name: 'Stat Callout with Counter Animation',
  category: 'stat_counter',
  tags: ['stat', 'counter', 'number', 'revenue', 'money', 'metric', 'KPI', 'animation', 'count up'],
  semanticDescription: 'An animated stat callout that displays a large number with a counting-up CSS animation effect and a descriptive label below. Perfect for showing revenue, users, downloads, or any impressive metric.',
  htmlTemplate: `<div style="position:absolute;inset:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;">
  <div style="text-align:center;animation:popIn 0.5s cubic-bezier(0.175,0.885,0.32,1.275) both;">
    <div style="font-size:72px;font-weight:800;color:{{numberColor}};line-height:1;letter-spacing:-0.03em;animation:fadeIn 0.4s ease 0.2s both;opacity:0;">
      <span style="display:inline-block;animation:countPulse 0.8s ease-out 0.3s both;">{{prefix}}</span><span style="display:inline-block;animation:countPulse 0.8s ease-out 0.4s both;">{{value}}</span><span style="display:inline-block;animation:countPulse 0.8s ease-out 0.5s both;">{{suffix}}</span>
    </div>
    <div style="font-size:16px;font-weight:500;color:{{labelColor}};text-transform:uppercase;letter-spacing:0.15em;margin-top:12px;animation:fadeIn 0.5s ease 0.6s both;opacity:0;">{{label}}</div>
    <div style="width:40px;height:3px;background:{{accentColor}};margin:14px auto 0;animation:widthGrow 0.6s ease 0.7s both;"></div>
  </div>
  <style>
    @keyframes popIn { from { transform:scale(0.8);opacity:0; } to { transform:scale(1);opacity:1; } }
    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
    @keyframes countPulse { from { transform:translateY(20px);opacity:0; } to { transform:translateY(0);opacity:1; } }
    @keyframes widthGrow { from { width:0; } to { width:40px; } }
  </style>
</div>`,
  slots: [
    { name: 'prefix', type: 'text', default: '$', description: 'Prefix (e.g. $, #)' },
    { name: 'value', type: 'text', default: '10,000', description: 'The main number/value' },
    { name: 'suffix', type: 'text', default: '', description: 'Suffix (e.g. +, K, %)' },
    { name: 'label', type: 'text', default: 'Revenue in 30 Days', description: 'Descriptive label' },
    { name: 'numberColor', type: 'color', default: '#FFFFFF', description: 'Number color' },
    { name: 'labelColor', type: 'color', default: '#8899AA', description: 'Label color' },
    { name: 'accentColor', type: 'color', default: '#00D4AA', description: 'Accent underline color' },
  ],
  dimensions: { width: 1920, height: 1080 },
  defaultDuration: 120,
  style: 'bold',
};

const calloutTipInfo: MotionGraphicTemplate = {
  templateId: 'co-tip-info-002',
  name: 'Tip/Info Box with Icon',
  category: 'callout',
  tags: ['tip', 'info', 'information', 'hint', 'callout', 'box', 'icon', 'helpful', 'did you know'],
  semanticDescription: 'An informational callout box with a lightbulb or info icon, a title and body text. Slides in with a frosted glass background. Perfect for tips, fun facts, or educational content.',
  htmlTemplate: `<div style="position:absolute;inset:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;">
  <div style="background:{{bgColor}};backdrop-filter:blur(16px);border-radius:16px;padding:28px 36px;max-width:520px;border:1px solid rgba(255,255,255,0.1);box-shadow:0 8px 32px rgba(0,0,0,0.3);animation:slideInScale 0.5s cubic-bezier(0.22,1,0.36,1) both;">
    <div style="display:flex;align-items:flex-start;gap:16px;">
      <div style="font-size:28px;flex-shrink:0;animation:bounceIn 0.5s ease 0.2s both;opacity:0;">{{icon}}</div>
      <div>
        <div style="font-size:18px;font-weight:700;color:{{titleColor}};animation:fadeIn 0.4s ease 0.3s both;opacity:0;">{{title}}</div>
        <div style="font-size:14px;font-weight:400;color:{{bodyColor}};line-height:1.5;margin-top:6px;animation:fadeIn 0.4s ease 0.45s both;opacity:0;">{{body}}</div>
      </div>
    </div>
  </div>
  <style>
    @keyframes slideInScale { from { transform:scale(0.9) translateY(20px);opacity:0; } to { transform:scale(1) translateY(0);opacity:1; } }
    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
    @keyframes bounceIn { from { opacity:0;transform:scale(0.5); } 60% { transform:scale(1.1); } to { opacity:1;transform:scale(1); } }
  </style>
</div>`,
  slots: [
    { name: 'icon', type: 'text', default: '💡', description: 'Icon emoji' },
    { name: 'title', type: 'text', default: 'Pro Tip', description: 'Callout title' },
    { name: 'body', type: 'text', default: 'Use keyboard shortcuts to speed up your workflow by 3x.', description: 'Body text' },
    { name: 'bgColor', type: 'color', default: 'rgba(20,20,40,0.85)', description: 'Background color' },
    { name: 'titleColor', type: 'color', default: '#FFD93D', description: 'Title color' },
    { name: 'bodyColor', type: 'color', default: '#D0D0E0', description: 'Body text color' },
  ],
  dimensions: { width: 1920, height: 1080 },
  defaultDuration: 150,
  style: 'minimal',
};

const calloutWarningAlert: MotionGraphicTemplate = {
  templateId: 'co-warning-alert-003',
  name: 'Warning/Alert Callout',
  category: 'callout',
  tags: ['warning', 'alert', 'danger', 'caution', 'important', 'callout', 'attention'],
  semanticDescription: 'A warning or alert callout with a red/orange accent, warning icon, and bold messaging. Features a pulsing border animation to draw attention. Good for emphasizing important information or warnings.',
  htmlTemplate: `<div style="position:absolute;inset:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;">
  <div style="background:{{bgColor}};border-radius:12px;padding:24px 32px;max-width:500px;border-left:4px solid {{borderColor}};box-shadow:0 4px 24px rgba(0,0,0,0.4);animation:shakeIn 0.6s cubic-bezier(0.22,1,0.36,1) both;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
      <div style="font-size:22px;animation:pulse 2s ease-in-out infinite;">{{icon}}</div>
      <div style="font-size:18px;font-weight:700;color:{{titleColor}};text-transform:uppercase;letter-spacing:0.05em;">{{title}}</div>
    </div>
    <div style="font-size:14px;color:{{bodyColor}};line-height:1.5;padding-left:34px;">{{message}}</div>
  </div>
  <style>
    @keyframes shakeIn { 0% { transform:translateX(-30px);opacity:0; } 60% { transform:translateX(5px); } 100% { transform:translateX(0);opacity:1; } }
    @keyframes pulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.15); } }
  </style>
</div>`,
  slots: [
    { name: 'icon', type: 'text', default: '⚠️', description: 'Warning icon' },
    { name: 'title', type: 'text', default: 'Warning', description: 'Alert title' },
    { name: 'message', type: 'text', default: 'This action cannot be undone. Please review carefully before proceeding.', description: 'Warning message' },
    { name: 'bgColor', type: 'color', default: 'rgba(30,15,15,0.9)', description: 'Background' },
    { name: 'borderColor', type: 'color', default: '#E63946', description: 'Border accent color' },
    { name: 'titleColor', type: 'color', default: '#FF6B6B', description: 'Title color' },
    { name: 'bodyColor', type: 'color', default: '#CCBBBB', description: 'Body text color' },
  ],
  dimensions: { width: 1920, height: 1080 },
  defaultDuration: 150,
  style: 'bold',
};

const calloutFeatureHighlight: MotionGraphicTemplate = {
  templateId: 'co-feature-highlight-004',
  name: 'Feature Highlight with Checkmark',
  category: 'callout',
  tags: ['feature', 'highlight', 'checkmark', 'benefit', 'selling point', 'product', 'check'],
  semanticDescription: 'A feature highlight callout with an animated green checkmark, feature name, and description. The checkmark draws itself with a stroke animation. Great for product demos and feature showcases.',
  htmlTemplate: `<div style="position:absolute;inset:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;">
  <div style="display:flex;align-items:center;gap:20px;animation:fadeSlideUp 0.5s ease-out both;">
    <div style="width:48px;height:48px;border-radius:50%;background:{{checkBg}};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="animation:drawCheck 0.5s ease-out 0.3s both;opacity:0;">
        <path d="M5 13l4 4L19 7" stroke="{{checkColor}}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="stroke-dasharray:30;stroke-dashoffset:30;animation:dash 0.6s ease-out 0.4s forwards;"/>
      </svg>
    </div>
    <div>
      <div style="font-size:22px;font-weight:700;color:{{featureColor}};animation:fadeIn 0.4s ease 0.3s both;opacity:0;">{{feature}}</div>
      <div style="font-size:14px;color:{{descColor}};margin-top:4px;animation:fadeIn 0.4s ease 0.5s both;opacity:0;">{{description}}</div>
    </div>
  </div>
  <style>
    @keyframes fadeSlideUp { from { opacity:0;transform:translateY(15px); } to { opacity:1;transform:translateY(0); } }
    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
    @keyframes drawCheck { to { opacity:1; } }
    @keyframes dash { to { stroke-dashoffset:0; } }
  </style>
</div>`,
  slots: [
    { name: 'feature', type: 'text', default: 'Real-Time Collaboration', description: 'Feature name' },
    { name: 'description', type: 'text', default: 'Work together with your team in real-time, no conflicts.', description: 'Feature description' },
    { name: 'checkBg', type: 'color', default: 'rgba(0,200,120,0.2)', description: 'Checkmark circle background' },
    { name: 'checkColor', type: 'color', default: '#00C878', description: 'Checkmark stroke color' },
    { name: 'featureColor', type: 'color', default: '#FFFFFF', description: 'Feature name color' },
    { name: 'descColor', type: 'color', default: '#99AABB', description: 'Description color' },
  ],
  dimensions: { width: 1920, height: 1080 },
  defaultDuration: 120,
  style: 'minimal',
};

const calloutQuote: MotionGraphicTemplate = {
  templateId: 'co-quote-005',
  name: 'Quote Callout with Quotation Marks',
  category: 'quote',
  tags: ['quote', 'quotation', 'testimonial', 'saying', 'wisdom', 'callout', 'blockquote'],
  semanticDescription: 'An elegant quote callout with large decorative quotation marks, the quote text, and an attribution line. Features a vertical accent line and fade-in animation. Perfect for testimonials and inspirational quotes.',
  htmlTemplate: `<div style="position:absolute;inset:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:600px;padding:40px;position:relative;animation:fadeIn 0.8s ease both;">
    <div style="position:absolute;top:0;left:20px;font-size:80px;color:{{quoteMarkColor}};line-height:1;font-family:Georgia,serif;animation:fadeIn 0.5s ease 0.2s both;opacity:0;">&ldquo;</div>
    <div style="border-left:3px solid {{accentColor}};padding:20px 30px 20px 30px;margin-left:20px;margin-top:30px;">
      <div style="font-size:22px;font-weight:400;color:{{quoteColor}};line-height:1.6;font-style:italic;animation:fadeIn 0.6s ease 0.3s both;opacity:0;">{{quote}}</div>
      <div style="font-size:14px;font-weight:600;color:{{authorColor}};margin-top:16px;font-style:normal;font-family:system-ui,sans-serif;animation:fadeIn 0.5s ease 0.6s both;opacity:0;">— {{author}}</div>
    </div>
  </div>
  <style>
    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
  </style>
</div>`,
  slots: [
    { name: 'quote', type: 'text', default: 'The only way to do great work is to love what you do.', description: 'Quote text' },
    { name: 'author', type: 'text', default: 'Steve Jobs', description: 'Attribution' },
    { name: 'quoteMarkColor', type: 'color', default: 'rgba(255,255,255,0.15)', description: 'Quotation mark color' },
    { name: 'accentColor', type: 'color', default: '#6C5CE7', description: 'Accent line color' },
    { name: 'quoteColor', type: 'color', default: '#E8E8F0', description: 'Quote text color' },
    { name: 'authorColor', type: 'color', default: '#8899AA', description: 'Author text color' },
  ],
  dimensions: { width: 1920, height: 1080 },
  defaultDuration: 180,
  style: 'elegant',
};

// ═══════════════════════════════════════════════════════════════
// TITLE CARDS (5)
// ═══════════════════════════════════════════════════════════════

const titleCinematicCentered: MotionGraphicTemplate = {
  templateId: 'tc-cinematic-centered-001',
  name: 'Cinematic Centered Title',
  category: 'title_card',
  tags: ['title', 'cinematic', 'centered', 'fade', 'intro', 'movie', 'film', 'epic', 'opening'],
  semanticDescription: 'A cinematic centered title card with a large main title, thin separator line, and subtitle. Features a slow elegant fade-in with slight scale animation. Perfect for film intros, chapter cards, and dramatic openings.',
  htmlTemplate: `<div style="position:absolute;inset:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;background:{{bgColor}};">
  <div style="text-align:center;">
    <div style="font-size:56px;font-weight:200;color:{{titleColor}};letter-spacing:0.15em;text-transform:uppercase;animation:cinematicFade 1.2s ease both;">{{title}}</div>
    <div style="width:80px;height:1px;background:{{lineColor}};margin:20px auto;animation:lineExpand 0.8s ease 0.6s both;"></div>
    <div style="font-size:18px;font-weight:300;color:{{subtitleColor}};letter-spacing:0.3em;text-transform:uppercase;animation:cinematicFade 1s ease 0.8s both;opacity:0;">{{subtitle}}</div>
  </div>
  <style>
    @keyframes cinematicFade { from { opacity:0;transform:scale(1.05);filter:blur(4px); } to { opacity:1;transform:scale(1);filter:blur(0); } }
    @keyframes lineExpand { from { width:0; } to { width:80px; } }
  </style>
</div>`,
  slots: [
    { name: 'title', type: 'text', default: 'Chapter One', description: 'Main title text' },
    { name: 'subtitle', type: 'text', default: 'The Beginning', description: 'Subtitle text' },
    { name: 'bgColor', type: 'color', default: 'rgba(0,0,0,0.85)', description: 'Background color' },
    { name: 'titleColor', type: 'color', default: '#FFFFFF', description: 'Title color' },
    { name: 'subtitleColor', type: 'color', default: '#888888', description: 'Subtitle color' },
    { name: 'lineColor', type: 'color', default: 'rgba(255,255,255,0.3)', description: 'Separator line color' },
  ],
  dimensions: { width: 1920, height: 1080 },
  defaultDuration: 150,
  style: 'cinematic',
};

const titleSplitScreen: MotionGraphicTemplate = {
  templateId: 'tc-split-screen-002',
  name: 'Split-Screen Title Reveal',
  category: 'title_card',
  tags: ['title', 'split', 'reveal', 'modern', 'dynamic', 'intro', 'two-tone'],
  semanticDescription: 'A dynamic split-screen title reveal where two colored halves slide apart to reveal the title text in the center. Features a bold modern aesthetic with contrasting colors.',
  htmlTemplate: `<div style="position:absolute;inset:0;width:100%;height:100%;overflow:hidden;font-family:system-ui,-apple-system,sans-serif;">
  <div style="position:absolute;top:0;left:0;width:50%;height:100%;background:{{leftColor}};animation:slideLeft 0.7s cubic-bezier(0.22,1,0.36,1) 0.8s both;"></div>
  <div style="position:absolute;top:0;right:0;width:50%;height:100%;background:{{rightColor}};animation:slideRight 0.7s cubic-bezier(0.22,1,0.36,1) 0.8s both;"></div>
  <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:10;">
    <div style="font-size:64px;font-weight:800;color:{{titleColor}};letter-spacing:-0.02em;animation:fadeIn 0.6s ease 1.2s both;opacity:0;">{{title}}</div>
    <div style="font-size:18px;font-weight:400;color:{{subtitleColor}};margin-top:12px;letter-spacing:0.1em;animation:fadeIn 0.5s ease 1.4s both;opacity:0;">{{subtitle}}</div>
  </div>
  <style>
    @keyframes slideLeft { to { transform:translateX(-100%); } }
    @keyframes slideRight { to { transform:translateX(100%); } }
    @keyframes fadeIn { from { opacity:0;transform:translateY(10px); } to { opacity:1;transform:translateY(0); } }
  </style>
</div>`,
  slots: [
    { name: 'title', type: 'text', default: 'BOLD TITLE', description: 'Main title' },
    { name: 'subtitle', type: 'text', default: 'Your subtitle goes here', description: 'Subtitle' },
    { name: 'leftColor', type: 'color', default: '#2D3436', description: 'Left panel color' },
    { name: 'rightColor', type: 'color', default: '#E17055', description: 'Right panel color' },
    { name: 'titleColor', type: 'color', default: '#FFFFFF', description: 'Title color' },
    { name: 'subtitleColor', type: 'color', default: '#BBBBBB', description: 'Subtitle color' },
  ],
  dimensions: { width: 1920, height: 1080 },
  defaultDuration: 150,
  style: 'bold',
};

const titleGlitchEffect: MotionGraphicTemplate = {
  templateId: 'tc-glitch-effect-003',
  name: 'Glitch Text Effect Title',
  category: 'title_card',
  tags: ['title', 'glitch', 'effect', 'cyber', 'tech', 'hacker', 'distortion', 'gaming'],
  semanticDescription: 'A cyberpunk glitch text title card with RGB split distortion animation. The title glitches with horizontal offset and color channel separation. Great for gaming, tech, and edgy content.',
  htmlTemplate: `<div style="position:absolute;inset:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:{{bgColor}};font-family:system-ui,-apple-system,sans-serif;">
  <div style="position:relative;text-align:center;">
    <div style="font-size:64px;font-weight:900;color:{{titleColor}};letter-spacing:0.05em;text-transform:uppercase;position:relative;animation:glitchBase 3s infinite;">
      {{title}}
      <span style="position:absolute;top:0;left:0;width:100%;height:100%;color:{{glitchColor1}};z-index:-1;animation:glitch1 3s infinite;">{{title}}</span>
      <span style="position:absolute;top:0;left:0;width:100%;height:100%;color:{{glitchColor2}};z-index:-2;animation:glitch2 3s infinite;">{{title}}</span>
    </div>
    <div style="font-size:16px;color:{{subtitleColor}};letter-spacing:0.2em;margin-top:16px;animation:fadeIn 0.5s ease 0.5s both;opacity:0;">{{subtitle}}</div>
  </div>
  <style>
    @keyframes glitchBase { 0%,2%,4%,100% { transform:none; } 1% { transform:skewX(-2deg); } 3% { transform:skewX(1deg); } }
    @keyframes glitch1 { 0%,100% { clip-path:inset(0);transform:translate(0); } 20% { clip-path:inset(20% 0 60% 0);transform:translate(-4px,-2px); } 40% { clip-path:inset(50% 0 10% 0);transform:translate(4px,2px); } 60% { clip-path:inset(10% 0 70% 0);transform:translate(-3px,1px); } 80% { clip-path:inset(70% 0 5% 0);transform:translate(3px,-1px); } }
    @keyframes glitch2 { 0%,100% { clip-path:inset(0);transform:translate(0); } 25% { clip-path:inset(60% 0 10% 0);transform:translate(4px,2px); } 50% { clip-path:inset(10% 0 60% 0);transform:translate(-4px,-2px); } 75% { clip-path:inset(40% 0 20% 0);transform:translate(3px,1px); } }
    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
  </style>
</div>`,
  slots: [
    { name: 'title', type: 'text', default: 'GLITCH', description: 'Title text' },
    { name: 'subtitle', type: 'text', default: 'SYSTEM OVERRIDE', description: 'Subtitle' },
    { name: 'bgColor', type: 'color', default: '#0A0A0A', description: 'Background' },
    { name: 'titleColor', type: 'color', default: '#FFFFFF', description: 'Title color' },
    { name: 'glitchColor1', type: 'color', default: '#FF0055', description: 'Glitch channel 1 (red)' },
    { name: 'glitchColor2', type: 'color', default: '#00FFAA', description: 'Glitch channel 2 (cyan)' },
    { name: 'subtitleColor', type: 'color', default: '#555555', description: 'Subtitle color' },
  ],
  dimensions: { width: 1920, height: 1080 },
  defaultDuration: 150,
  style: 'bold',
};

const titleTypewriter: MotionGraphicTemplate = {
  templateId: 'tc-typewriter-004',
  name: 'Typewriter Title',
  category: 'title_card',
  tags: ['title', 'typewriter', 'typing', 'cursor', 'retro', 'hacker', 'code', 'terminal'],
  semanticDescription: 'A typewriter-style title card where text appears character by character with a blinking cursor. Features a monospace font and classic terminal aesthetic. Perfect for tech, coding, and retro content.',
  htmlTemplate: `<div style="position:absolute;inset:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:{{bgColor}};font-family:'Courier New',monospace;">
  <div style="text-align:center;">
    <div style="display:inline-block;font-size:48px;font-weight:700;color:{{titleColor}};border-right:3px solid {{cursorColor}};padding-right:8px;white-space:nowrap;overflow:hidden;animation:typing 2s steps({{charCount}}) 0.3s both,blink 0.8s step-end infinite;width:0;">{{title}}</div>
    <div style="font-size:16px;color:{{subtitleColor}};margin-top:16px;animation:fadeIn 0.5s ease 2.5s both;opacity:0;">{{subtitle}}</div>
  </div>
  <style>
    @keyframes typing { from { width:0; } to { width:100%; } }
    @keyframes blink { 50% { border-color:transparent; } }
    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
  </style>
</div>`,
  slots: [
    { name: 'title', type: 'text', default: 'Hello, World.', description: 'Title text (typewriter effect)' },
    { name: 'subtitle', type: 'text', default: 'Press any key to continue...', description: 'Subtitle' },
    { name: 'charCount', type: 'number', default: '13', description: 'Number of characters in title (for step animation)' },
    { name: 'bgColor', type: 'color', default: '#0D1117', description: 'Background' },
    { name: 'titleColor', type: 'color', default: '#58A6FF', description: 'Title color' },
    { name: 'cursorColor', type: 'color', default: '#58A6FF', description: 'Cursor color' },
    { name: 'subtitleColor', type: 'color', default: '#484F58', description: 'Subtitle color' },
  ],
  dimensions: { width: 1920, height: 1080 },
  defaultDuration: 150,
  style: 'minimal',
};

const titleGradientText: MotionGraphicTemplate = {
  templateId: 'tc-gradient-text-005',
  name: 'Gradient Text Title',
  category: 'title_card',
  tags: ['title', 'gradient', 'colorful', 'modern', 'vibrant', 'intro', 'trendy', 'instagram'],
  semanticDescription: 'A vibrant gradient text title that uses animated gradient backgrounds clipped to text. The gradient slowly shifts and animates. Features a clean modern look popular on social media.',
  htmlTemplate: `<div style="position:absolute;inset:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:{{bgColor}};font-family:system-ui,-apple-system,sans-serif;">
  <div style="font-size:68px;font-weight:900;background:linear-gradient(135deg,{{gradientStart}},{{gradientMid}},{{gradientEnd}});background-size:200% 200%;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:gradientShift 4s ease infinite,scaleIn 0.8s cubic-bezier(0.22,1,0.36,1) both;letter-spacing:-0.02em;">{{title}}</div>
  <div style="font-size:18px;font-weight:400;color:{{subtitleColor}};margin-top:16px;letter-spacing:0.08em;animation:fadeIn 0.6s ease 0.5s both;opacity:0;">{{subtitle}}</div>
  <style>
    @keyframes gradientShift { 0% { background-position:0% 50%; } 50% { background-position:100% 50%; } 100% { background-position:0% 50%; } }
    @keyframes scaleIn { from { opacity:0;transform:scale(0.9); } to { opacity:1;transform:scale(1); } }
    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
  </style>
</div>`,
  slots: [
    { name: 'title', type: 'text', default: 'TRENDING', description: 'Title text' },
    { name: 'subtitle', type: 'text', default: 'Something amazing is coming', description: 'Subtitle' },
    { name: 'gradientStart', type: 'color', default: '#667EEA', description: 'Gradient start color' },
    { name: 'gradientMid', type: 'color', default: '#764BA2', description: 'Gradient middle color' },
    { name: 'gradientEnd', type: 'color', default: '#F093FB', description: 'Gradient end color' },
    { name: 'bgColor', type: 'color', default: '#0A0A12', description: 'Background' },
    { name: 'subtitleColor', type: 'color', default: '#777788', description: 'Subtitle color' },
  ],
  dimensions: { width: 1920, height: 1080 },
  defaultDuration: 150,
  style: 'bold',
};

// ═══════════════════════════════════════════════════════════════
// DATA VISUALIZATION (5)
// ═══════════════════════════════════════════════════════════════

const dataVizAnimatedCounter: MotionGraphicTemplate = {
  templateId: 'dv-animated-counter-001',
  name: 'Animated Number Reveal',
  category: 'data_viz',
  tags: ['counter', 'number', 'reveal', 'count up', 'metric', 'KPI', 'data', 'statistic'],
  semanticDescription: 'A large animated number reveal with a counting-up visual effect using CSS animations. Displays a big number with a label and optional unit. The number scales up and fades in dramatically.',
  htmlTemplate: `<div style="position:absolute;inset:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;">
  <div style="text-align:center;">
    <div style="font-size:14px;font-weight:600;color:{{labelColor}};text-transform:uppercase;letter-spacing:0.2em;animation:fadeIn 0.4s ease both;">{{topLabel}}</div>
    <div style="font-size:96px;font-weight:900;color:{{numberColor}};line-height:1;margin:8px 0;animation:numberReveal 1s cubic-bezier(0.22,1,0.36,1) 0.2s both;opacity:0;letter-spacing:-0.03em;">{{number}}</div>
    <div style="font-size:16px;font-weight:400;color:{{unitColor}};letter-spacing:0.1em;animation:fadeIn 0.5s ease 0.8s both;opacity:0;">{{bottomLabel}}</div>
  </div>
  <style>
    @keyframes numberReveal { from { opacity:0;transform:scale(0.5) translateY(30px);filter:blur(8px); } to { opacity:1;transform:scale(1) translateY(0);filter:blur(0); } }
    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
  </style>
</div>`,
  slots: [
    { name: 'topLabel', type: 'text', default: 'Total Users', description: 'Label above number' },
    { name: 'number', type: 'text', default: '2.5M', description: 'The main number' },
    { name: 'bottomLabel', type: 'text', default: 'and growing every day', description: 'Label below number' },
    { name: 'numberColor', type: 'color', default: '#FFFFFF', description: 'Number color' },
    { name: 'labelColor', type: 'color', default: '#6C7A8D', description: 'Top label color' },
    { name: 'unitColor', type: 'color', default: '#556677', description: 'Bottom label color' },
  ],
  dimensions: { width: 1920, height: 1080 },
  defaultDuration: 120,
  style: 'minimal',
};

const dataVizProgressBar: MotionGraphicTemplate = {
  templateId: 'dv-progress-bar-002',
  name: 'Progress Bar with Percentage',
  category: 'progress_bar',
  tags: ['progress', 'bar', 'percentage', 'loading', 'completion', 'goal', 'achievement', 'data'],
  semanticDescription: 'An animated progress bar that fills from left to right with a percentage label. Features a glowing animated fill with a gradient. Great for showing completion, goals, or loading states.',
  htmlTemplate: `<div style="position:absolute;inset:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;">
  <div style="width:500px;">
    <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
      <div style="font-size:16px;font-weight:600;color:{{labelColor}};animation:fadeIn 0.4s ease both;">{{label}}</div>
      <div style="font-size:16px;font-weight:700;color:{{percentColor}};animation:fadeIn 0.4s ease 0.2s both;opacity:0;">{{percentage}}%</div>
    </div>
    <div style="width:100%;height:12px;background:{{trackColor}};border-radius:6px;overflow:hidden;">
      <div style="width:{{percentage}}%;height:100%;background:linear-gradient(90deg,{{fillStart}},{{fillEnd}});border-radius:6px;animation:fillBar 1.2s cubic-bezier(0.22,1,0.36,1) 0.3s both;transform-origin:left;box-shadow:0 0 12px {{fillEnd}};"></div>
    </div>
  </div>
  <style>
    @keyframes fillBar { from { transform:scaleX(0); } to { transform:scaleX(1); } }
    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
  </style>
</div>`,
  slots: [
    { name: 'label', type: 'text', default: 'Project Completion', description: 'Progress label' },
    { name: 'percentage', type: 'number', default: '78', description: 'Percentage value (0-100)' },
    { name: 'trackColor', type: 'color', default: 'rgba(255,255,255,0.1)', description: 'Track background' },
    { name: 'fillStart', type: 'color', default: '#6C5CE7', description: 'Fill gradient start' },
    { name: 'fillEnd', type: 'color', default: '#A29BFE', description: 'Fill gradient end' },
    { name: 'labelColor', type: 'color', default: '#CCCCCC', description: 'Label color' },
    { name: 'percentColor', type: 'color', default: '#FFFFFF', description: 'Percentage text color' },
  ],
  dimensions: { width: 1920, height: 1080 },
  defaultDuration: 120,
  style: 'minimal',
};

const dataVizComparison: MotionGraphicTemplate = {
  templateId: 'dv-comparison-003',
  name: 'A vs B Comparison Layout',
  category: 'comparison',
  tags: ['comparison', 'versus', 'vs', 'A vs B', 'before after', 'side by side', 'data'],
  semanticDescription: 'A side-by-side A vs B comparison layout with two columns separated by a VS badge in the center. Each side has a title, value, and descriptive text. Great for comparing products, plans, or options.',
  htmlTemplate: `<div style="position:absolute;inset:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;">
  <div style="display:flex;align-items:center;gap:40px;">
    <div style="text-align:center;animation:slideInLeft 0.6s ease both;">
      <div style="font-size:14px;font-weight:600;color:{{labelColorA}};text-transform:uppercase;letter-spacing:0.1em;">{{labelA}}</div>
      <div style="font-size:56px;font-weight:800;color:{{valueColorA}};margin:8px 0;">{{valueA}}</div>
      <div style="font-size:14px;color:{{descColorA}};">{{descA}}</div>
    </div>
    <div style="width:56px;height:56px;border-radius:50%;background:{{vsBg}};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:{{vsColor}};animation:popIn 0.5s cubic-bezier(0.175,0.885,0.32,1.275) 0.3s both;opacity:0;flex-shrink:0;">VS</div>
    <div style="text-align:center;animation:slideInRight 0.6s ease 0.15s both;opacity:0;">
      <div style="font-size:14px;font-weight:600;color:{{labelColorB}};text-transform:uppercase;letter-spacing:0.1em;">{{labelB}}</div>
      <div style="font-size:56px;font-weight:800;color:{{valueColorB}};margin:8px 0;">{{valueB}}</div>
      <div style="font-size:14px;color:{{descColorB}};">{{descB}}</div>
    </div>
  </div>
  <style>
    @keyframes slideInLeft { from { opacity:0;transform:translateX(-40px); } to { opacity:1;transform:translateX(0); } }
    @keyframes slideInRight { from { opacity:0;transform:translateX(40px); } to { opacity:1;transform:translateX(0); } }
    @keyframes popIn { from { opacity:0;transform:scale(0); } to { opacity:1;transform:scale(1); } }
  </style>
</div>`,
  slots: [
    { name: 'labelA', type: 'text', default: 'Before', description: 'Left side label' },
    { name: 'valueA', type: 'text', default: '$99', description: 'Left side value' },
    { name: 'descA', type: 'text', default: 'Per month, basic plan', description: 'Left description' },
    { name: 'labelB', type: 'text', default: 'After', description: 'Right side label' },
    { name: 'valueB', type: 'text', default: '$49', description: 'Right side value' },
    { name: 'descB', type: 'text', default: 'Per month, with discount', description: 'Right description' },
    { name: 'vsBg', type: 'color', default: 'rgba(255,255,255,0.15)', description: 'VS badge background' },
    { name: 'vsColor', type: 'color', default: '#FFFFFF', description: 'VS text color' },
    { name: 'valueColorA', type: 'color', default: '#FF6B6B', description: 'Left value color' },
    { name: 'valueColorB', type: 'color', default: '#51CF66', description: 'Right value color' },
    { name: 'labelColorA', type: 'color', default: '#AAAAAA', description: 'Left label color' },
    { name: 'labelColorB', type: 'color', default: '#AAAAAA', description: 'Right label color' },
    { name: 'descColorA', type: 'color', default: '#888888', description: 'Left desc color' },
    { name: 'descColorB', type: 'color', default: '#888888', description: 'Right desc color' },
  ],
  dimensions: { width: 1920, height: 1080 },
  defaultDuration: 150,
  style: 'minimal',
};

const dataVizBarChart: MotionGraphicTemplate = {
  templateId: 'dv-bar-chart-004',
  name: 'Simple Bar Chart',
  category: 'data_viz',
  tags: ['bar chart', 'chart', 'graph', 'data', 'visualization', 'bars', 'statistics', 'metrics'],
  semanticDescription: 'A simple animated bar chart with 4 vertical bars that grow upward from the bottom with staggered timing. Each bar has a label and value. Great for comparing metrics or showing data.',
  htmlTemplate: `<div style="position:absolute;inset:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;">
  <div style="font-size:20px;font-weight:700;color:{{titleColor}};margin-bottom:32px;animation:fadeIn 0.4s ease both;">{{chartTitle}}</div>
  <div style="display:flex;align-items:flex-end;gap:32px;height:200px;">
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
      <div style="font-size:13px;font-weight:600;color:{{valueColor}};animation:fadeIn 0.3s ease 0.6s both;opacity:0;">{{val1}}</div>
      <div style="width:60px;height:{{h1}}px;background:linear-gradient(180deg,{{barColor1}},{{barColor1}}88);border-radius:6px 6px 0 0;animation:growUp 0.8s cubic-bezier(0.22,1,0.36,1) 0.1s both;transform-origin:bottom;"></div>
      <div style="font-size:12px;color:{{labelColor}};">{{label1}}</div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
      <div style="font-size:13px;font-weight:600;color:{{valueColor}};animation:fadeIn 0.3s ease 0.8s both;opacity:0;">{{val2}}</div>
      <div style="width:60px;height:{{h2}}px;background:linear-gradient(180deg,{{barColor2}},{{barColor2}}88);border-radius:6px 6px 0 0;animation:growUp 0.8s cubic-bezier(0.22,1,0.36,1) 0.25s both;transform-origin:bottom;"></div>
      <div style="font-size:12px;color:{{labelColor}};">{{label2}}</div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
      <div style="font-size:13px;font-weight:600;color:{{valueColor}};animation:fadeIn 0.3s ease 1.0s both;opacity:0;">{{val3}}</div>
      <div style="width:60px;height:{{h3}}px;background:linear-gradient(180deg,{{barColor3}},{{barColor3}}88);border-radius:6px 6px 0 0;animation:growUp 0.8s cubic-bezier(0.22,1,0.36,1) 0.4s both;transform-origin:bottom;"></div>
      <div style="font-size:12px;color:{{labelColor}};">{{label3}}</div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
      <div style="font-size:13px;font-weight:600;color:{{valueColor}};animation:fadeIn 0.3s ease 1.2s both;opacity:0;">{{val4}}</div>
      <div style="width:60px;height:{{h4}}px;background:linear-gradient(180deg,{{barColor4}},{{barColor4}}88);border-radius:6px 6px 0 0;animation:growUp 0.8s cubic-bezier(0.22,1,0.36,1) 0.55s both;transform-origin:bottom;"></div>
      <div style="font-size:12px;color:{{labelColor}};">{{label4}}</div>
    </div>
  </div>
  <style>
    @keyframes growUp { from { transform:scaleY(0); } to { transform:scaleY(1); } }
    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
  </style>
</div>`,
  slots: [
    { name: 'chartTitle', type: 'text', default: 'Quarterly Revenue', description: 'Chart title' },
    { name: 'label1', type: 'text', default: 'Q1', description: 'Bar 1 label' },
    { name: 'val1', type: 'text', default: '$12K', description: 'Bar 1 value' },
    { name: 'h1', type: 'number', default: '100', description: 'Bar 1 height in px' },
    { name: 'label2', type: 'text', default: 'Q2', description: 'Bar 2 label' },
    { name: 'val2', type: 'text', default: '$18K', description: 'Bar 2 value' },
    { name: 'h2', type: 'number', default: '150', description: 'Bar 2 height in px' },
    { name: 'label3', type: 'text', default: 'Q3', description: 'Bar 3 label' },
    { name: 'val3', type: 'text', default: '$24K', description: 'Bar 3 value' },
    { name: 'h3', type: 'number', default: '200', description: 'Bar 3 height in px' },
    { name: 'label4', type: 'text', default: 'Q4', description: 'Bar 4 label' },
    { name: 'val4', type: 'text', default: '$15K', description: 'Bar 4 value' },
    { name: 'h4', type: 'number', default: '125', description: 'Bar 4 height in px' },
    { name: 'barColor1', type: 'color', default: '#6C5CE7', description: 'Bar 1 color' },
    { name: 'barColor2', type: 'color', default: '#A29BFE', description: 'Bar 2 color' },
    { name: 'barColor3', type: 'color', default: '#6C5CE7', description: 'Bar 3 color' },
    { name: 'barColor4', type: 'color', default: '#A29BFE', description: 'Bar 4 color' },
    { name: 'titleColor', type: 'color', default: '#FFFFFF', description: 'Title color' },
    { name: 'valueColor', type: 'color', default: '#CCCCCC', description: 'Value label color' },
    { name: 'labelColor', type: 'color', default: '#888888', description: 'Bar label color' },
  ],
  dimensions: { width: 1920, height: 1080 },
  defaultDuration: 150,
  style: 'minimal',
};

const dataVizDonutSegment: MotionGraphicTemplate = {
  templateId: 'dv-donut-segment-005',
  name: 'Donut Chart Segment',
  category: 'data_viz',
  tags: ['donut', 'pie', 'chart', 'circle', 'percentage', 'data', 'visualization', 'ring'],
  semanticDescription: 'An animated donut/ring chart that fills a circular arc to show a percentage. Features a large centered percentage number and label text. The ring draws itself with a smooth stroke animation.',
  htmlTemplate: `<div style="position:absolute;inset:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;">
  <div style="position:relative;width:200px;height:200px;">
    <svg viewBox="0 0 200 200" style="width:200px;height:200px;transform:rotate(-90deg);">
      <circle cx="100" cy="100" r="85" fill="none" stroke="{{trackColor}}" stroke-width="14"/>
      <circle cx="100" cy="100" r="85" fill="none" stroke="{{fillColor}}" stroke-width="14" stroke-linecap="round" stroke-dasharray="534" stroke-dashoffset="534" style="animation:drawRing 1.5s cubic-bezier(0.22,1,0.36,1) 0.2s forwards;"/>
    </svg>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
      <div style="font-size:48px;font-weight:800;color:{{numberColor}};animation:fadeIn 0.5s ease 0.8s both;opacity:0;">{{percentage}}%</div>
    </div>
  </div>
  <div style="font-size:16px;font-weight:500;color:{{labelColor}};margin-top:16px;animation:fadeIn 0.5s ease 1s both;opacity:0;">{{label}}</div>
  <style>
    @keyframes drawRing { to { stroke-dashoffset:{{dashOffset}}; } }
    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
  </style>
</div>`,
  slots: [
    { name: 'percentage', type: 'number', default: '72', description: 'Percentage value' },
    { name: 'dashOffset', type: 'number', default: '149', description: 'SVG dash offset (534 - 534*(percentage/100)). For 72%: 534 - 384 = 150' },
    { name: 'label', type: 'text', default: 'Customer Satisfaction', description: 'Chart label' },
    { name: 'trackColor', type: 'color', default: 'rgba(255,255,255,0.1)', description: 'Track ring color' },
    { name: 'fillColor', type: 'color', default: '#00B894', description: 'Fill ring color' },
    { name: 'numberColor', type: 'color', default: '#FFFFFF', description: 'Number color' },
    { name: 'labelColor', type: 'color', default: '#8899AA', description: 'Label color' },
  ],
  dimensions: { width: 1920, height: 1080 },
  defaultDuration: 150,
  style: 'minimal',
};

// ═══════════════════════════════════════════════════════════════
// SOCIAL / ENGAGEMENT (5)
// ═══════════════════════════════════════════════════════════════

const socialSubscribeButton: MotionGraphicTemplate = {
  templateId: 'so-subscribe-btn-001',
  name: 'Subscribe Button Animation',
  category: 'subscribe',
  tags: ['subscribe', 'button', 'youtube', 'CTA', 'call to action', 'bell', 'channel'],
  semanticDescription: 'An animated subscribe button that pops in with a bell icon animation. Features the classic red YouTube-style subscribe look with a bouncing bell notification. Perfect for YouTube video outros and CTAs.',
  htmlTemplate: `<div style="position:absolute;inset:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;">
  <div style="display:flex;align-items:center;gap:16px;animation:slideUp 0.5s cubic-bezier(0.22,1,0.36,1) both;">
    <div style="background:{{btnColor}};padding:14px 32px;border-radius:{{borderRadius}}px;cursor:pointer;animation:pulseScale 2s ease-in-out 1s infinite;">
      <div style="font-size:16px;font-weight:700;color:{{btnTextColor}};text-transform:uppercase;letter-spacing:0.06em;">{{buttonText}}</div>
    </div>
    <div style="width:44px;height:44px;border-radius:50%;background:{{bellBg}};display:flex;align-items:center;justify-content:center;animation:bounceIn 0.6s cubic-bezier(0.175,0.885,0.32,1.275) 0.3s both;opacity:0;">
      <div style="font-size:20px;animation:ring 1s ease 1s both;">🔔</div>
    </div>
  </div>
  <style>
    @keyframes slideUp { from { opacity:0;transform:translateY(20px); } to { opacity:1;transform:translateY(0); } }
    @keyframes bounceIn { from { opacity:0;transform:scale(0); } 60% { transform:scale(1.15); } to { opacity:1;transform:scale(1); } }
    @keyframes pulseScale { 0%,100% { transform:scale(1); } 50% { transform:scale(1.03); } }
    @keyframes ring { 0% { transform:rotate(0); } 15% { transform:rotate(14deg); } 30% { transform:rotate(-12deg); } 45% { transform:rotate(8deg); } 60% { transform:rotate(-5deg); } 75% { transform:rotate(2deg); } 100% { transform:rotate(0); } }
  </style>
</div>`,
  slots: [
    { name: 'buttonText', type: 'text', default: 'Subscribe', description: 'Button text' },
    { name: 'btnColor', type: 'color', default: '#FF0000', description: 'Button background' },
    { name: 'btnTextColor', type: 'color', default: '#FFFFFF', description: 'Button text color' },
    { name: 'bellBg', type: 'color', default: 'rgba(255,255,255,0.1)', description: 'Bell circle background' },
    { name: 'borderRadius', type: 'number', default: '4', description: 'Button border radius' },
  ],
  dimensions: { width: 1920, height: 1080 },
  defaultDuration: 150,
  style: 'bold',
};

const socialLikeFollow: MotionGraphicTemplate = {
  templateId: 'so-like-follow-002',
  name: 'Like & Follow CTA',
  category: 'subscribe',
  tags: ['like', 'follow', 'CTA', 'heart', 'social media', 'engagement', 'thumbs up'],
  semanticDescription: 'A like and follow call-to-action with animated heart/thumbs-up icons and text prompts. Features a bouncing icon animation with a clean pill-shaped container. Great for social media engagement prompts.',
  htmlTemplate: `<div style="position:absolute;inset:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;">
  <div style="display:flex;gap:20px;animation:fadeIn 0.5s ease both;">
    <div style="display:flex;align-items:center;gap:10px;background:{{likeBg}};padding:12px 24px;border-radius:50px;animation:slideInLeft 0.5s ease 0.1s both;opacity:0;">
      <span style="font-size:24px;animation:heartBeat 1.5s ease-in-out 0.8s infinite;">{{likeIcon}}</span>
      <span style="font-size:15px;font-weight:600;color:{{likeTextColor}};">{{likeText}}</span>
    </div>
    <div style="display:flex;align-items:center;gap:10px;background:{{followBg}};padding:12px 24px;border-radius:50px;animation:slideInRight 0.5s ease 0.25s both;opacity:0;">
      <span style="font-size:24px;animation:heartBeat 1.5s ease-in-out 1s infinite;">{{followIcon}}</span>
      <span style="font-size:15px;font-weight:600;color:{{followTextColor}};">{{followText}}</span>
    </div>
  </div>
  <style>
    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
    @keyframes slideInLeft { from { opacity:0;transform:translateX(-20px); } to { opacity:1;transform:translateX(0); } }
    @keyframes slideInRight { from { opacity:0;transform:translateX(20px); } to { opacity:1;transform:translateX(0); } }
    @keyframes heartBeat { 0%,100% { transform:scale(1); } 15% { transform:scale(1.25); } 30% { transform:scale(1); } }
  </style>
</div>`,
  slots: [
    { name: 'likeIcon', type: 'text', default: '❤️', description: 'Like icon emoji' },
    { name: 'likeText', type: 'text', default: 'Like', description: 'Like button text' },
    { name: 'followIcon', type: 'text', default: '👤', description: 'Follow icon emoji' },
    { name: 'followText', type: 'text', default: 'Follow', description: 'Follow button text' },
    { name: 'likeBg', type: 'color', default: 'rgba(255,50,80,0.2)', description: 'Like pill background' },
    { name: 'followBg', type: 'color', default: 'rgba(60,120,255,0.2)', description: 'Follow pill background' },
    { name: 'likeTextColor', type: 'color', default: '#FF3250', description: 'Like text color' },
    { name: 'followTextColor', type: 'color', default: '#3C78FF', description: 'Follow text color' },
  ],
  dimensions: { width: 1920, height: 1080 },
  defaultDuration: 150,
  style: 'playful',
};

const socialSocialProof: MotionGraphicTemplate = {
  templateId: 'so-social-proof-003',
  name: 'Social Proof Counter',
  category: 'social_proof',
  tags: ['social proof', 'users', 'customers', 'trust', 'counter', '10K', 'community', 'milestone'],
  semanticDescription: 'A social proof counter showing a large user/customer count with a trust-building message. Features an animated number with a subtle glow and supporting text. Perfect for showing community size, downloads, or customer counts.',
  htmlTemplate: `<div style="position:absolute;inset:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;">
  <div style="text-align:center;animation:fadeIn 0.6s ease both;">
    <div style="font-size:14px;font-weight:500;color:{{topTextColor}};text-transform:uppercase;letter-spacing:0.15em;animation:fadeIn 0.4s ease 0.2s both;opacity:0;">{{topText}}</div>
    <div style="font-size:80px;font-weight:900;color:{{numberColor}};line-height:1;margin:8px 0;text-shadow:0 0 40px {{glowColor}};animation:scaleIn 0.8s cubic-bezier(0.22,1,0.36,1) 0.3s both;opacity:0;">{{count}}</div>
    <div style="font-size:18px;font-weight:400;color:{{bottomTextColor}};animation:fadeIn 0.5s ease 0.7s both;opacity:0;">{{bottomText}}</div>
    <div style="display:flex;justify-content:center;gap:4px;margin-top:16px;animation:fadeIn 0.5s ease 0.9s both;opacity:0;">
      <span style="font-size:20px;">⭐</span><span style="font-size:20px;">⭐</span><span style="font-size:20px;">⭐</span><span style="font-size:20px;">⭐</span><span style="font-size:20px;">⭐</span>
    </div>
  </div>
  <style>
    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
    @keyframes scaleIn { from { opacity:0;transform:scale(0.7); } to { opacity:1;transform:scale(1); } }
  </style>
</div>`,
  slots: [
    { name: 'topText', type: 'text', default: 'Trusted by', description: 'Text above number' },
    { name: 'count', type: 'text', default: '10K+', description: 'The count/number' },
    { name: 'bottomText', type: 'text', default: 'happy customers worldwide', description: 'Text below number' },
    { name: 'numberColor', type: 'color', default: '#FFFFFF', description: 'Number color' },
    { name: 'glowColor', type: 'color', default: 'rgba(108,92,231,0.4)', description: 'Number glow color' },
    { name: 'topTextColor', type: 'color', default: '#8899AA', description: 'Top text color' },
    { name: 'bottomTextColor', type: 'color', default: '#8899AA', description: 'Bottom text color' },
  ],
  dimensions: { width: 1920, height: 1080 },
  defaultDuration: 150,
  style: 'bold',
};

const socialNotificationPopup: MotionGraphicTemplate = {
  templateId: 'so-notification-popup-004',
  name: 'Notification Popup',
  category: 'notification',
  tags: ['notification', 'popup', 'alert', 'toast', 'message', 'new', 'badge', 'push notification'],
  semanticDescription: 'An animated notification popup/toast that slides in from the top-right with a badge icon, title, and message text. Features a smooth slide-down animation with a subtle shadow. Great for simulating app notifications.',
  htmlTemplate: `<div style="position:absolute;inset:0;width:100%;height:100%;overflow:hidden;font-family:system-ui,-apple-system,sans-serif;">
  <div style="position:absolute;top:30px;right:30px;background:{{bgColor}};backdrop-filter:blur(16px);border-radius:16px;padding:16px 20px;display:flex;align-items:center;gap:14px;box-shadow:0 8px 32px rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.08);max-width:360px;animation:slideDown 0.5s cubic-bezier(0.22,1,0.36,1) both;">
    <div style="width:40px;height:40px;border-radius:10px;background:{{iconBg}};display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">{{icon}}</div>
    <div style="flex:1;min-width:0;">
      <div style="font-size:14px;font-weight:700;color:{{titleColor}};">{{title}}</div>
      <div style="font-size:12px;color:{{messageColor}};margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{message}}</div>
    </div>
    <div style="font-size:11px;color:{{timeColor}};flex-shrink:0;">{{time}}</div>
  </div>
  <style>
    @keyframes slideDown { from { opacity:0;transform:translateY(-20px); } to { opacity:1;transform:translateY(0); } }
  </style>
</div>`,
  slots: [
    { name: 'icon', type: 'text', default: '📬', description: 'Notification icon' },
    { name: 'title', type: 'text', default: 'New Message', description: 'Notification title' },
    { name: 'message', type: 'text', default: 'You have a new message from your team', description: 'Notification body' },
    { name: 'time', type: 'text', default: 'now', description: 'Timestamp' },
    { name: 'bgColor', type: 'color', default: 'rgba(20,20,35,0.92)', description: 'Background' },
    { name: 'iconBg', type: 'color', default: '#3C78FF', description: 'Icon background' },
    { name: 'titleColor', type: 'color', default: '#FFFFFF', description: 'Title color' },
    { name: 'messageColor', type: 'color', default: '#999999', description: 'Message color' },
    { name: 'timeColor', type: 'color', default: '#666666', description: 'Time color' },
  ],
  dimensions: { width: 1920, height: 1080 },
  defaultDuration: 120,
  style: 'minimal',
};

const socialCommentReview: MotionGraphicTemplate = {
  templateId: 'so-comment-review-005',
  name: 'Comment/Review Card',
  category: 'social_proof',
  tags: ['comment', 'review', 'testimonial', 'card', 'user review', 'feedback', 'rating', 'stars'],
  semanticDescription: 'A user comment or review card with avatar initials, username, star rating, and review text. Features a glassmorphism card design with a smooth fade-in animation. Great for showing customer reviews and testimonials.',
  htmlTemplate: `<div style="position:absolute;inset:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;">
  <div style="background:{{cardBg}};backdrop-filter:blur(16px);border-radius:16px;padding:28px;max-width:420px;border:1px solid rgba(255,255,255,0.08);box-shadow:0 8px 32px rgba(0,0,0,0.3);animation:slideUp 0.5s ease both;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
      <div style="width:44px;height:44px;border-radius:50%;background:{{avatarBg}};display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:{{avatarColor}};flex-shrink:0;">{{initials}}</div>
      <div>
        <div style="font-size:15px;font-weight:600;color:{{nameColor}};">{{username}}</div>
        <div style="display:flex;gap:2px;margin-top:2px;">{{stars}}</div>
      </div>
    </div>
    <div style="font-size:14px;color:{{reviewColor}};line-height:1.6;animation:fadeIn 0.5s ease 0.3s both;opacity:0;">{{reviewText}}</div>
  </div>
  <style>
    @keyframes slideUp { from { opacity:0;transform:translateY(20px); } to { opacity:1;transform:translateY(0); } }
    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
  </style>
</div>`,
  slots: [
    { name: 'initials', type: 'text', default: 'JD', description: 'Avatar initials' },
    { name: 'username', type: 'text', default: 'Jane Doe', description: 'Username' },
    { name: 'stars', type: 'text', default: '<span style="color:#FFD93D;font-size:14px;">★★★★★</span>', description: 'Star rating HTML' },
    { name: 'reviewText', type: 'text', default: 'This product completely transformed my workflow. I cannot recommend it enough to anyone in the industry.', description: 'Review text' },
    { name: 'cardBg', type: 'color', default: 'rgba(20,20,35,0.85)', description: 'Card background' },
    { name: 'avatarBg', type: 'color', default: '#6C5CE7', description: 'Avatar background' },
    { name: 'avatarColor', type: 'color', default: '#FFFFFF', description: 'Avatar text color' },
    { name: 'nameColor', type: 'color', default: '#FFFFFF', description: 'Name color' },
    { name: 'reviewColor', type: 'color', default: '#BBBBCC', description: 'Review text color' },
  ],
  dimensions: { width: 1920, height: 1080 },
  defaultDuration: 180,
  style: 'elegant',
};

// ═══════════════════════════════════════════════════════════════
// LISTS / STEPS (5)
// ═══════════════════════════════════════════════════════════════

const listStepByStep: MotionGraphicTemplate = {
  templateId: 'ls-step-by-step-001',
  name: 'Step-by-Step Reveal',
  category: 'list_reveal',
  tags: ['steps', 'step by step', 'process', 'how to', 'tutorial', 'numbered', '1 2 3', 'instructions'],
  semanticDescription: 'A step-by-step numbered list that reveals each step with a staggered animation. Each step has a number circle, title, and optional description. Great for tutorials, how-to guides, and process explanations.',
  htmlTemplate: `<div style="position:absolute;inset:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;">
  <div style="display:flex;flex-direction:column;gap:24px;">
    <div style="display:flex;align-items:center;gap:16px;animation:slideRight 0.5s ease 0.1s both;opacity:0;">
      <div style="width:40px;height:40px;border-radius:50%;background:{{numBg}};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:{{numColor}};flex-shrink:0;">1</div>
      <div>
        <div style="font-size:18px;font-weight:600;color:{{stepColor}};">{{step1}}</div>
        <div style="font-size:13px;color:{{descColor}};margin-top:2px;">{{desc1}}</div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:16px;animation:slideRight 0.5s ease 0.35s both;opacity:0;">
      <div style="width:40px;height:40px;border-radius:50%;background:{{numBg}};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:{{numColor}};flex-shrink:0;">2</div>
      <div>
        <div style="font-size:18px;font-weight:600;color:{{stepColor}};">{{step2}}</div>
        <div style="font-size:13px;color:{{descColor}};margin-top:2px;">{{desc2}}</div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:16px;animation:slideRight 0.5s ease 0.6s both;opacity:0;">
      <div style="width:40px;height:40px;border-radius:50%;background:{{numBg}};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:{{numColor}};flex-shrink:0;">3</div>
      <div>
        <div style="font-size:18px;font-weight:600;color:{{stepColor}};">{{step3}}</div>
        <div style="font-size:13px;color:{{descColor}};margin-top:2px;">{{desc3}}</div>
      </div>
    </div>
  </div>
  <style>
    @keyframes slideRight { from { opacity:0;transform:translateX(-30px); } to { opacity:1;transform:translateX(0); } }
  </style>
</div>`,
  slots: [
    { name: 'step1', type: 'text', default: 'Sign Up', description: 'Step 1 title' },
    { name: 'desc1', type: 'text', default: 'Create your free account in 30 seconds', description: 'Step 1 description' },
    { name: 'step2', type: 'text', default: 'Choose a Plan', description: 'Step 2 title' },
    { name: 'desc2', type: 'text', default: 'Select the plan that works for you', description: 'Step 2 description' },
    { name: 'step3', type: 'text', default: 'Start Building', description: 'Step 3 title' },
    { name: 'desc3', type: 'text', default: 'Launch your project in minutes', description: 'Step 3 description' },
    { name: 'numBg', type: 'color', default: '#6C5CE7', description: 'Number circle background' },
    { name: 'numColor', type: 'color', default: '#FFFFFF', description: 'Number color' },
    { name: 'stepColor', type: 'color', default: '#FFFFFF', description: 'Step title color' },
    { name: 'descColor', type: 'color', default: '#888899', description: 'Description color' },
  ],
  dimensions: { width: 1920, height: 1080 },
  defaultDuration: 180,
  style: 'minimal',
};

const listChecklist: MotionGraphicTemplate = {
  templateId: 'ls-checklist-002',
  name: 'Checklist with Animated Checks',
  category: 'list_reveal',
  tags: ['checklist', 'check', 'todo', 'list', 'done', 'completed', 'tasks', 'checkmark'],
  semanticDescription: 'An animated checklist where each item appears with a drawing checkmark animation. Items are revealed one by one with green check circles. Great for showing completed tasks, requirements, or feature lists.',
  htmlTemplate: `<div style="position:absolute;inset:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;">
  <div style="display:flex;flex-direction:column;gap:18px;">
    <div style="font-size:22px;font-weight:700;color:{{titleColor}};margin-bottom:8px;animation:fadeIn 0.4s ease both;">{{title}}</div>
    <div style="display:flex;align-items:center;gap:14px;animation:slideRight 0.4s ease 0.2s both;opacity:0;">
      <div style="width:28px;height:28px;border-radius:50%;background:{{checkBg}};display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span style="color:{{checkColor}};font-size:16px;animation:popCheck 0.3s ease 0.5s both;opacity:0;">✓</span></div>
      <div style="font-size:16px;color:{{itemColor}};">{{item1}}</div>
    </div>
    <div style="display:flex;align-items:center;gap:14px;animation:slideRight 0.4s ease 0.45s both;opacity:0;">
      <div style="width:28px;height:28px;border-radius:50%;background:{{checkBg}};display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span style="color:{{checkColor}};font-size:16px;animation:popCheck 0.3s ease 0.75s both;opacity:0;">✓</span></div>
      <div style="font-size:16px;color:{{itemColor}};">{{item2}}</div>
    </div>
    <div style="display:flex;align-items:center;gap:14px;animation:slideRight 0.4s ease 0.7s both;opacity:0;">
      <div style="width:28px;height:28px;border-radius:50%;background:{{checkBg}};display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span style="color:{{checkColor}};font-size:16px;animation:popCheck 0.3s ease 1.0s both;opacity:0;">✓</span></div>
      <div style="font-size:16px;color:{{itemColor}};">{{item3}}</div>
    </div>
    <div style="display:flex;align-items:center;gap:14px;animation:slideRight 0.4s ease 0.95s both;opacity:0;">
      <div style="width:28px;height:28px;border-radius:50%;background:{{checkBg}};display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span style="color:{{checkColor}};font-size:16px;animation:popCheck 0.3s ease 1.25s both;opacity:0;">✓</span></div>
      <div style="font-size:16px;color:{{itemColor}};">{{item4}}</div>
    </div>
  </div>
  <style>
    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
    @keyframes slideRight { from { opacity:0;transform:translateX(-20px); } to { opacity:1;transform:translateX(0); } }
    @keyframes popCheck { from { opacity:0;transform:scale(0); } to { opacity:1;transform:scale(1); } }
  </style>
</div>`,
  slots: [
    { name: 'title', type: 'text', default: 'What You Get', description: 'Checklist title' },
    { name: 'item1', type: 'text', default: 'Unlimited projects', description: 'Item 1' },
    { name: 'item2', type: 'text', default: 'Priority support', description: 'Item 2' },
    { name: 'item3', type: 'text', default: 'Custom branding', description: 'Item 3' },
    { name: 'item4', type: 'text', default: 'Analytics dashboard', description: 'Item 4' },
    { name: 'checkBg', type: 'color', default: 'rgba(0,200,120,0.2)', description: 'Check circle background' },
    { name: 'checkColor', type: 'color', default: '#00C878', description: 'Check mark color' },
    { name: 'titleColor', type: 'color', default: '#FFFFFF', description: 'Title color' },
    { name: 'itemColor', type: 'color', default: '#DDDDEE', description: 'Item text color' },
  ],
  dimensions: { width: 1920, height: 1080 },
  defaultDuration: 180,
  style: 'minimal',
};

const listFeatureWithIcons: MotionGraphicTemplate = {
  templateId: 'ls-feature-icons-003',
  name: 'Feature List with Icons',
  category: 'list_reveal',
  tags: ['features', 'list', 'icons', 'benefits', 'product', 'selling points', 'emoji'],
  semanticDescription: 'A feature list with emoji icons and descriptive text for each feature. Each item fades in with staggered timing. Features a clean layout with icon circles. Great for product demos and pitch decks.',
  htmlTemplate: `<div style="position:absolute;inset:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;">
  <div style="display:flex;flex-direction:column;gap:20px;">
    <div style="display:flex;align-items:center;gap:16px;animation:fadeSlide 0.5s ease 0.1s both;opacity:0;">
      <div style="width:44px;height:44px;border-radius:12px;background:{{iconBg1}};display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">{{icon1}}</div>
      <div style="font-size:16px;font-weight:500;color:{{textColor}};">{{feature1}}</div>
    </div>
    <div style="display:flex;align-items:center;gap:16px;animation:fadeSlide 0.5s ease 0.3s both;opacity:0;">
      <div style="width:44px;height:44px;border-radius:12px;background:{{iconBg2}};display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">{{icon2}}</div>
      <div style="font-size:16px;font-weight:500;color:{{textColor}};">{{feature2}}</div>
    </div>
    <div style="display:flex;align-items:center;gap:16px;animation:fadeSlide 0.5s ease 0.5s both;opacity:0;">
      <div style="width:44px;height:44px;border-radius:12px;background:{{iconBg3}};display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">{{icon3}}</div>
      <div style="font-size:16px;font-weight:500;color:{{textColor}};">{{feature3}}</div>
    </div>
    <div style="display:flex;align-items:center;gap:16px;animation:fadeSlide 0.5s ease 0.7s both;opacity:0;">
      <div style="width:44px;height:44px;border-radius:12px;background:{{iconBg4}};display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">{{icon4}}</div>
      <div style="font-size:16px;font-weight:500;color:{{textColor}};">{{feature4}}</div>
    </div>
  </div>
  <style>
    @keyframes fadeSlide { from { opacity:0;transform:translateX(-20px); } to { opacity:1;transform:translateX(0); } }
  </style>
</div>`,
  slots: [
    { name: 'icon1', type: 'text', default: '⚡', description: 'Feature 1 icon' },
    { name: 'feature1', type: 'text', default: 'Lightning-fast performance', description: 'Feature 1 text' },
    { name: 'iconBg1', type: 'color', default: 'rgba(255,200,50,0.15)', description: 'Icon 1 background' },
    { name: 'icon2', type: 'text', default: '🔒', description: 'Feature 2 icon' },
    { name: 'feature2', type: 'text', default: 'Enterprise-grade security', description: 'Feature 2 text' },
    { name: 'iconBg2', type: 'color', default: 'rgba(100,200,255,0.15)', description: 'Icon 2 background' },
    { name: 'icon3', type: 'text', default: '🎨', description: 'Feature 3 icon' },
    { name: 'feature3', type: 'text', default: 'Beautiful customizable themes', description: 'Feature 3 text' },
    { name: 'iconBg3', type: 'color', default: 'rgba(200,100,255,0.15)', description: 'Icon 3 background' },
    { name: 'icon4', type: 'text', default: '📊', description: 'Feature 4 icon' },
    { name: 'feature4', type: 'text', default: 'Advanced analytics built-in', description: 'Feature 4 text' },
    { name: 'iconBg4', type: 'color', default: 'rgba(100,255,150,0.15)', description: 'Icon 4 background' },
    { name: 'textColor', type: 'color', default: '#E0E0F0', description: 'Feature text color' },
  ],
  dimensions: { width: 1920, height: 1080 },
  defaultDuration: 180,
  style: 'minimal',
};

const listProsConsComparison: MotionGraphicTemplate = {
  templateId: 'ls-pros-cons-004',
  name: 'Pros/Cons Comparison',
  category: 'comparison',
  tags: ['pros', 'cons', 'comparison', 'advantages', 'disadvantages', 'good', 'bad', 'versus'],
  semanticDescription: 'A side-by-side pros and cons comparison with green checkmarks for pros and red X marks for cons. Each item animates in with staggered timing. Great for product reviews, decision-making content, and comparisons.',
  htmlTemplate: `<div style="position:absolute;inset:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;">
  <div style="display:flex;gap:60px;">
    <div style="animation:fadeSlideLeft 0.5s ease both;">
      <div style="font-size:18px;font-weight:700;color:{{prosTitle}};margin-bottom:16px;display:flex;align-items:center;gap:8px;">✅ {{prosLabel}}</div>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div style="font-size:15px;color:{{prosTextColor}};display:flex;align-items:center;gap:10px;animation:fadeIn 0.4s ease 0.2s both;opacity:0;"><span style="color:#51CF66;">✓</span> {{pro1}}</div>
        <div style="font-size:15px;color:{{prosTextColor}};display:flex;align-items:center;gap:10px;animation:fadeIn 0.4s ease 0.4s both;opacity:0;"><span style="color:#51CF66;">✓</span> {{pro2}}</div>
        <div style="font-size:15px;color:{{prosTextColor}};display:flex;align-items:center;gap:10px;animation:fadeIn 0.4s ease 0.6s both;opacity:0;"><span style="color:#51CF66;">✓</span> {{pro3}}</div>
      </div>
    </div>
    <div style="width:1px;background:rgba(255,255,255,0.15);animation:fadeIn 0.5s ease 0.3s both;opacity:0;"></div>
    <div style="animation:fadeSlideRight 0.5s ease 0.15s both;opacity:0;">
      <div style="font-size:18px;font-weight:700;color:{{consTitle}};margin-bottom:16px;display:flex;align-items:center;gap:8px;">❌ {{consLabel}}</div>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div style="font-size:15px;color:{{consTextColor}};display:flex;align-items:center;gap:10px;animation:fadeIn 0.4s ease 0.35s both;opacity:0;"><span style="color:#FF6B6B;">✗</span> {{con1}}</div>
        <div style="font-size:15px;color:{{consTextColor}};display:flex;align-items:center;gap:10px;animation:fadeIn 0.4s ease 0.55s both;opacity:0;"><span style="color:#FF6B6B;">✗</span> {{con2}}</div>
        <div style="font-size:15px;color:{{consTextColor}};display:flex;align-items:center;gap:10px;animation:fadeIn 0.4s ease 0.75s both;opacity:0;"><span style="color:#FF6B6B;">✗</span> {{con3}}</div>
      </div>
    </div>
  </div>
  <style>
    @keyframes fadeSlideLeft { from { opacity:0;transform:translateX(-20px); } to { opacity:1;transform:translateX(0); } }
    @keyframes fadeSlideRight { from { opacity:0;transform:translateX(20px); } to { opacity:1;transform:translateX(0); } }
    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
  </style>
</div>`,
  slots: [
    { name: 'prosLabel', type: 'text', default: 'Pros', description: 'Pros column title' },
    { name: 'pro1', type: 'text', default: 'Easy to use', description: 'Pro 1' },
    { name: 'pro2', type: 'text', default: 'Great customer support', description: 'Pro 2' },
    { name: 'pro3', type: 'text', default: 'Affordable pricing', description: 'Pro 3' },
    { name: 'consLabel', type: 'text', default: 'Cons', description: 'Cons column title' },
    { name: 'con1', type: 'text', default: 'Limited free plan', description: 'Con 1' },
    { name: 'con2', type: 'text', default: 'No mobile app yet', description: 'Con 2' },
    { name: 'con3', type: 'text', default: 'Steep learning curve', description: 'Con 3' },
    { name: 'prosTitle', type: 'color', default: '#51CF66', description: 'Pros title color' },
    { name: 'consTitle', type: 'color', default: '#FF6B6B', description: 'Cons title color' },
    { name: 'prosTextColor', type: 'color', default: '#CCDDCC', description: 'Pros text color' },
    { name: 'consTextColor', type: 'color', default: '#DDCCCC', description: 'Cons text color' },
  ],
  dimensions: { width: 1920, height: 1080 },
  defaultDuration: 180,
  style: 'minimal',
};

const listTimeline: MotionGraphicTemplate = {
  templateId: 'ls-timeline-005',
  name: 'Timeline / Chronology',
  category: 'list_reveal',
  tags: ['timeline', 'chronology', 'history', 'milestones', 'events', 'roadmap', 'journey'],
  semanticDescription: 'A vertical timeline with connected dots and event descriptions that reveal sequentially. Features a vertical line connecting milestone dots with dates and descriptions. Great for showing company history, roadmaps, or event chronology.',
  htmlTemplate: `<div style="position:absolute;inset:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;">
  <div style="position:relative;padding-left:40px;">
    <div style="position:absolute;left:14px;top:8px;bottom:8px;width:2px;background:{{lineColor}};animation:growDown 1s ease both;transform-origin:top;"></div>
    <div style="display:flex;flex-direction:column;gap:32px;">
      <div style="position:relative;animation:fadeSlide 0.5s ease 0.2s both;opacity:0;">
        <div style="position:absolute;left:-33px;top:4px;width:12px;height:12px;border-radius:50%;background:{{dotColor}};border:2px solid {{dotBorder}};"></div>
        <div style="font-size:12px;font-weight:600;color:{{dateColor}};text-transform:uppercase;letter-spacing:0.1em;">{{date1}}</div>
        <div style="font-size:17px;font-weight:600;color:{{eventColor}};margin-top:4px;">{{event1}}</div>
      </div>
      <div style="position:relative;animation:fadeSlide 0.5s ease 0.5s both;opacity:0;">
        <div style="position:absolute;left:-33px;top:4px;width:12px;height:12px;border-radius:50%;background:{{dotColor}};border:2px solid {{dotBorder}};"></div>
        <div style="font-size:12px;font-weight:600;color:{{dateColor}};text-transform:uppercase;letter-spacing:0.1em;">{{date2}}</div>
        <div style="font-size:17px;font-weight:600;color:{{eventColor}};margin-top:4px;">{{event2}}</div>
      </div>
      <div style="position:relative;animation:fadeSlide 0.5s ease 0.8s both;opacity:0;">
        <div style="position:absolute;left:-33px;top:4px;width:12px;height:12px;border-radius:50%;background:{{dotColor}};border:2px solid {{dotBorder}};"></div>
        <div style="font-size:12px;font-weight:600;color:{{dateColor}};text-transform:uppercase;letter-spacing:0.1em;">{{date3}}</div>
        <div style="font-size:17px;font-weight:600;color:{{eventColor}};margin-top:4px;">{{event3}}</div>
      </div>
    </div>
  </div>
  <style>
    @keyframes growDown { from { transform:scaleY(0); } to { transform:scaleY(1); } }
    @keyframes fadeSlide { from { opacity:0;transform:translateX(-15px); } to { opacity:1;transform:translateX(0); } }
  </style>
</div>`,
  slots: [
    { name: 'date1', type: 'text', default: '2020', description: 'Event 1 date' },
    { name: 'event1', type: 'text', default: 'Company Founded', description: 'Event 1 title' },
    { name: 'date2', type: 'text', default: '2022', description: 'Event 2 date' },
    { name: 'event2', type: 'text', default: 'Series A Funding', description: 'Event 2 title' },
    { name: 'date3', type: 'text', default: '2024', description: 'Event 3 date' },
    { name: 'event3', type: 'text', default: 'Global Launch', description: 'Event 3 title' },
    { name: 'lineColor', type: 'color', default: 'rgba(255,255,255,0.15)', description: 'Timeline line color' },
    { name: 'dotColor', type: 'color', default: '#6C5CE7', description: 'Dot fill color' },
    { name: 'dotBorder', type: 'color', default: '#6C5CE7', description: 'Dot border color' },
    { name: 'dateColor', type: 'color', default: '#6C5CE7', description: 'Date text color' },
    { name: 'eventColor', type: 'color', default: '#FFFFFF', description: 'Event title color' },
  ],
  dimensions: { width: 1920, height: 1080 },
  defaultDuration: 180,
  style: 'elegant',
};

// ═══════════════════════════════════════════════════════════════
// EXPORT ALL 30 TEMPLATES
// ═══════════════════════════════════════════════════════════════

export const MOTION_GRAPHIC_TEMPLATES: MotionGraphicTemplate[] = [
  // Lower Thirds
  lowerThirdCleanMinimal,
  lowerThirdBoldAccent,
  lowerThirdAnimatedSlideIn,
  lowerThirdGradientFade,
  lowerThirdNewsStyle,
  // Callouts
  calloutStatCounter,
  calloutTipInfo,
  calloutWarningAlert,
  calloutFeatureHighlight,
  calloutQuote,
  // Title Cards
  titleCinematicCentered,
  titleSplitScreen,
  titleGlitchEffect,
  titleTypewriter,
  titleGradientText,
  // Data Visualization
  dataVizAnimatedCounter,
  dataVizProgressBar,
  dataVizComparison,
  dataVizBarChart,
  dataVizDonutSegment,
  // Social / Engagement
  socialSubscribeButton,
  socialLikeFollow,
  socialSocialProof,
  socialNotificationPopup,
  socialCommentReview,
  // Lists / Steps
  listStepByStep,
  listChecklist,
  listFeatureWithIcons,
  listProsConsComparison,
  listTimeline,
];
