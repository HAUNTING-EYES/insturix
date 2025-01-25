import Header from "@/components/new-product-page/Header";
// import InteractiveDemo from "@/components/new-product-page/InteractiveDemo";
import Features from "@/components/new-product-page/Features";
import UseCases from "@/components/new-product-page/UseCases";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CursorEffect from "@/components/ui/CursorEffect";

const THEME = {
  color: "rgba(59, 130, 246, 0.15)",
  gradient: {
    from: "from-blue-400",
    to: "to-blue-600",
  },
};

const features = [
  {
    title: "Guideline Compliance",
    description:
      "Scans content to ensure it meets platform rules and avoids strikes.",
    icon: "Zap",
  },
  {
    title: "Accuracy Verification",
    description: "Cross-checks facts and figures to maintain credibility.",
    icon: "Shield",
  },
  {
    title: "Content Optimization",
    description:
      "Provides actionable suggestions to improve content clarity and impact.",
    icon: "LineChart",
  },
  {
    title: "Multi-Format Support",
    description:
      "Analyzes text, images, and video content for diverse applications.",
    icon: "Brain",
  },
  {
    title: "Real-Time Insights",
    description:
      "Delivers immediate feedback, saving creators from costly mistakes.",
    icon: "Cpu",
  },
];

const useCases = [
  {
    title: "Social Media Management",
    description:
      "Scans for guideline compliance to avoid content strikes and maximize reach.",
  },
  {
    title: "Brand Campaigns",
    description:
      "Ensures marketing content is accurate, engaging, and aligned with brand goals.",
  },
  {
    title: "Journalism",
    description:
      "Verifies facts and figures before publishing articles or videos.",
  },
  {
    title: "Education Platforms",
    description: "Assists in curating quality content for students.",
  },
  {
    title: "E-commerce",
    description:
      "Checks product descriptions and visuals to improve clarity and compliance.",
  },
];

const headerContent = {
  title: "Revolutionize Your Content Safety with",
  highlightText: "Alyzitron",
  description:
    "Scans for guideline compliance, ensures accuracy, and optimizes content for maximum impact and brand alignment.",
  videoUrl: "https://www.youtube.com/embed/FieYiEcMJow",
  videoTitle: "Content Guidelines Compliance and Accuracy Verification",
  getStartedLink: "/signup",
  accentColor: THEME.color,
  accentGradient: THEME.gradient,
};

{
  /* const demoContent = {
  title: "Interactive AI Demo",
  subtitle: "Try out our AI-powered content moderation in real-time",
  defaultInput: "Enter some text to analyze its safety and content...",
  inputPlaceholder: "Type or paste your content here...",
  outputPlaceholder: "Content analysis results will appear here...",
  buttonText: "Analyze Content",
  processingDelay: 3000,
  simulatedResponse:
    "Content Analysis Complete:\n- Safety Score: 95%\n- No harmful content detected\n- Tone: Professional\n- Suggested improvements: None",
}; */
}

export default function TechieTewari() {
  return (
    <>
      <CursorEffect variant="glow" color={THEME.color} size={500} blur={100} />
      <Navbar />
      <main className="min-h-screen">
        <Header {...headerContent} />
        {/* <InteractiveDemo {...demoContent} /> */}
        <Features features={features} />
        <UseCases useCases={useCases} />
      </main>
      <Footer />
    </>
  );
}
