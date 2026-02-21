

import {
  Brain,
  Sparkles,
  Scissors,
  Video,
  BarChart3,
  Music,
  Share2,
  Upload,
} from "lucide-react";

export interface product {
    Id?: number;
    Icon: React.ComponentType<any>;
    name: string;
    description: string; // Keep for backward compatibility or small cards
    longDescription: string;
    features: string[];
    tags: string[];
    product_href: string;
    dashboard_href: string;
    cta: string;
    image_src:string,
    accentColor?: string;
}

export const Products : product[] = [
 {
  Id:1,
  Icon: Brain,
  name: "ThinkForge",
  description: "Turn creative sparks into complete scripts. Brainstorm with AI, refine ideas in real-time, and get step-by-step guidance from concept to execution.",
  longDescription: "ThinkForge takes half-formed ideas and turns them into usable scripts. Describe your concept and ForgeAI helps flesh it out—finding angles you missed, structuring the flow, and writing alongside you. It works through the messy creative process until you've got something ready to shoot.",
  features: [
    "Idea Generation from Creative Sparks",
    "End-to-End AI Collaboration System",
    "Personalized Script Documentation",
    "Real-Time Refinement & Feedback"
  ],
  tags: ["Ideation", "Scripting", "Creative AI"],
  accentColor: "#ef4444",
  product_href: "/products/thinkforge",
  dashboard_href: "/dashboard/thinkforge",
  cta: "Start Creating",
  image_src:"/products-preview/thinkforge.webp",
},
  {
  Id:2,
  Icon: Sparkles,
  name: "Clickatron",
  description: "Design scroll-stopping thumbnails fast. Describe your concept, get AI-optimized variations, then edit faces, text, and colors directly on the canvas.",
  longDescription: "Clickatron handles thumbnails from idea to export. Drop in a description and it generates multiple click-optimized directions. Swap faces, change text inline, or lock in your brand colors and fonts once. The render pipeline keeps everything crisp and high-contrast so your thumbnails stand out.",
  features: [
    "AI Prompt Expansion Engine",
    "High-Fidelity Render Pipeline",
    "Inline AI-Powered Editor",
    "Brand Palette & Typography Presets"
  ],
  tags: ["Thumbnails", "Design", "AI Editing"],
  accentColor: "#9333EA",
  product_href: "/products/clickatron",
  dashboard_href: "/dashboard/clickatron",
  cta: "Create Thumbnails",
  image_src:"/products-preview/clickatron.webp",
},
  {
  Id:3,
  Icon: Scissors,
  name: "Editron",
  description: "Turn raw footage into polished videos in minutes. AI detects topics, handles trimming and stitching, then adds captions, transitions, and effects automatically.",
  longDescription: "Editron handles the repetitive editing work so you can focus on creative decisions. Upload raw clips and it finds key moments, timestamps topics from audio, and removes dead space. Add captions, transitions, and effects with a few clicks. It scales from 30-second reels to 30-minute videos.",
  features: [
    "AI-Powered Automation Pipeline",
    "Audio Topic Detection & Timestamps",
    "One-Click Captions & Transitions",
    "Multi-Platform Format Optimization"
  ],
  tags: ["Video Editing", "Automation", "Multi-Platform"],
  accentColor: "#14B8A6",
  product_href: "/products/editron",
  dashboard_href: "/dashboard/editron",
  cta: "Start Editing",
  image_src:"/products-preview/editron.webp",
},
 {
  Id:4,
  Icon: Video,
  name: "Alyzitron",
  description: "Get AI feedback before you publish. Spot weaknesses in your content, pacing, and delivery, then fix them with specific suggestions on what to change.",
  longDescription: "Alyzitron reviews your video like an experienced creator—catching issues and telling you how to fix them. Upload your draft and get scored on quality, pacing, originality, and technical execution. It analyzes audience appeal, flags copyright or guideline issues, and gives concrete steps to improve. Analysis takes minutes so you can iterate fast.",
  features: [
    "Comprehensive Quality Scoring",
    "Actionable Improvement Suggestions",
    "Target Audience Analysis",
    "Compliance & Copyright Risk Check"
  ],
  tags: ["Pre-Publish Analysis", "Content Review", "Optimization"],
  accentColor: "#3B81F6",
  product_href: "/products/alyzitron",
  dashboard_href: "/dashboard/alyzitron",
  cta: "Analyze Video",
  image_src:"/products-preview/alyzitron.webp",
},
 {
  Id:5,
  Icon: Music,
  name: "Musitron",
  description: "Generate custom soundtracks without copyright worries. Pick a genre, add your lyrics, choose instruments, and get royalty-free tracks ready to use anywhere.",
  longDescription: "Musitron creates original music tailored to your project. Choose from multiple genres, add your own lyrics, and mix instruments to get the exact vibe. Export in professional quality formats and use tracks anywhere without licensing headaches. Everything is royalty-free and copyright-free.",
  features: [
    "Multi-Genre AI Music Generation",
    "Custom Lyrics Integration",
    "Instrument Selection & Mixing",
    "Royalty-Free Commercial Use"
  ],
  tags: ["Music Generation", "Royalty-Free", "Custom Audio"],
  accentColor: "#EAB308",
  product_href: "/products/musitron",
  dashboard_href: "/dashboard/musitron",
  cta: "Create Music",
  image_src:"/products-preview/musitron.webp",
},
  {
  Id:6,
  Icon: Share2,
  name: "Socialize",
  description: "One landing page for everything you share. Connect your content, socials, and profiles with custom themes, track what gets clicked, and stay mobile-friendly.",
  longDescription: "Socialize gives you one link that houses everything—content, social profiles, contact info, and any links you want visible. Pick a theme that matches your brand or build your own. Track which links get clicks and get notified about career opportunities. One link connects everything.",
  features: [
    "Custom Bio Link Pages",
    "Click Analytics Dashboard",
    "Pre-Made & Custom Themes",
    "Career Opportunity Notifications"
  ],
  tags: ["Link-in-Bio", "Creator Tools", "Analytics"],
  accentColor: "#0EA5E9",
  product_href: "/products/socialize",
  dashboard_href: "/dashboard/socialize",
  cta: "Build Your Page",
  image_src:"/products-preview/socialize.webp",
},
 {
  Id:7,
  Icon: Upload,
  name: "UploaderX",
  description: "Publish to YouTube, Instagram, TikTok, and Meta simultaneously. Schedule, optimize, and track.",
  longDescription: "UploaderX is your multi-platform distribution hub. Upload once and distribute to all major social platforms. It automatically optimizes formats for each platform, schedules posts for peak engagement, and provides deep cross-platform analytics to see what's working where.",
  features: [
    "Multi-Platform Simultaneous Upload",
    "Smart Scheduling & Peak Time Detection",
    "Auto-Formatting for Platform Compliance",
    "Unified Cross-Platform Analytics"
  ],
  tags: ["Distribution", "Social Media", "Automation"],
  accentColor: "#2DD4BF",
  product_href: "/products/uploaderx",
  dashboard_href: "/dashboard/uploaderx",
  cta: "Start Distribution",
  image_src:"/products-preview/uploaderx.webp",
},
];