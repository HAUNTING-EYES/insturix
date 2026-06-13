

import {
  Lightbulb,
  Image as ImageIcon,
  Video,
  BarChart3,
  Music,
  Share2,
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
  Icon: Lightbulb,
  name: "Planning & Scripting",
  description: "Turn creative sparks into complete scripts. Brainstorm with AI, refine ideas in real-time, and get step-by-step guidance from concept to execution.",
  longDescription: "Turn half-formed ideas into usable briefs, outlines, and scripts. Describe the concept, find stronger angles, structure the flow, and move toward something ready to produce.",
  features: [
    "Idea Generation from Creative Sparks",
    "End-to-End AI Collaboration System",
    "Personalized Script Documentation",
    "Real-Time Refinement & Feedback"
  ],
  tags: ["Ideation", "Scripting", "Creative AI"],
  accentColor: "#ef4444",
  product_href: "/products",
  dashboard_href: "/dashboard",
  cta: "Start Creating",
  image_src:"/icons/og-image.jpg",
},
  {
  Id:2,
  Icon: ImageIcon,
  name: "Visual Asset Design",
  description: "Design scroll-stopping thumbnails fast. Describe your concept, get AI-optimized variations, then edit faces, text, and colors directly on the canvas.",
  longDescription: "Create thumbnails, campaign visuals, and supporting assets from a description. Generate multiple directions, edit text and color, and keep output aligned with the brand profile.",
  features: [
    "AI Prompt Expansion Engine",
    "High-Fidelity Render Pipeline",
    "Inline AI-Powered Editor",
    "Brand Palette & Typography Presets"
  ],
  tags: ["Thumbnails", "Design", "AI Editing"],
  accentColor: "#9333EA",
  product_href: "/products",
  dashboard_href: "/dashboard",
  cta: "Create Thumbnails",
  image_src:"/icons/og-image.jpg",
},
  {
  Id:3,
  Icon: Video,
  name: "Automated Editing",
  description: "Turn raw footage into polished videos in minutes. AI detects topics, handles trimming and stitching, then adds captions, transitions, and effects automatically.",
  longDescription: "Handle repetitive editing work so teams can focus on creative decisions. Upload raw clips, identify key moments, remove dead space, add captions, transitions, and effects, then prepare media for the right format.",
  features: [
    "AI-Powered Automation Pipeline",
    "Audio Topic Detection & Timestamps",
    "One-Click Captions & Transitions",
    "Multi-Platform Format Optimization"
  ],
  tags: ["Video Editing", "Automation", "Multi-Platform"],
  accentColor: "#14B8A6",
  product_href: "/products",
  dashboard_href: "/dashboard",
  cta: "Start Editing",
  image_src:"/icons/og-image.jpg",
},
 {
  Id:4,
  Icon: BarChart3,
  name: "Content Analysis",
  description: "Get AI feedback before you publish. Spot weaknesses in your content, pacing, and delivery, then fix them with specific suggestions on what to change.",
  longDescription: "Review drafts before publishing. Score quality, pacing, originality, technical execution, audience appeal, and brand fit, then turn the findings into concrete improvements.",
  features: [
    "Comprehensive Quality Scoring",
    "Actionable Improvement Suggestions",
    "Target Audience Analysis",
    "Compliance & Copyright Risk Check"
  ],
  tags: ["Pre-Publish Analysis", "Content Review", "Optimization"],
  accentColor: "#3B81F6",
  product_href: "/products",
  dashboard_href: "/dashboard",
  cta: "Analyze Content",
  image_src:"/icons/og-image.jpg",
},
 {
  Id:5,
  Icon: Music,
  name: "Music & Sound",
  description: "Generate custom soundtracks without copyright worries. Pick a genre, add your lyrics, choose instruments, and get royalty-free tracks ready to use anywhere.",
  longDescription: "Create original music and sound support tailored to the project. Choose genres, lyrics, instruments, and export-ready formats while reducing licensing friction.",
  features: [
    "Multi-Genre AI Music Generation",
    "Custom Lyrics Integration",
    "Instrument Selection & Mixing",
    "Royalty-Free Commercial Use"
  ],
  tags: ["Music Generation", "Royalty-Free", "Custom Audio"],
  accentColor: "#EAB308",
  product_href: "/products",
  dashboard_href: "/dashboard",
  cta: "Create Music",
  image_src:"/icons/og-image.jpg",
},
  {
  Id:6,
  Icon: Share2,
  name: "Profile Hub",
  description: "One landing page for everything you share. Connect your content, socials, and profiles with custom themes, track what gets clicked, and stay mobile-friendly.",
  longDescription: "Create a public profile surface for finished work, social links, contact details, and campaign destinations. Keep it themed to the brand and track engagement.",
  features: [
    "Custom Public Profile Pages",
    "Click Analytics Dashboard",
    "Pre-Made & Custom Themes",
    "Career Opportunity Notifications"
  ],
  tags: ["Public Profiles", "Brand Links", "Analytics"],
  accentColor: "#0EA5E9",
  product_href: "/products",
  dashboard_href: "/dashboard",
  cta: "Build Your Page",
  image_src:"/icons/og-image.jpg",
},
];
