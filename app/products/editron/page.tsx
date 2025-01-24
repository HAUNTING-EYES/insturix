import Header from "@/components/new-product-page/Header";
import InteractiveDemo from "@/components/new-product-page/InteractiveDemo";
import Features from "@/components/new-product-page/Features";
import UseCases from "@/components/new-product-page/UseCases";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CursorEffect from "@/components/ui/CursorEffect";

const THEME = {
  color: "rgba(20, 184, 166, 0.15)",
  gradient: {
    from: "from-teal-400",
    to: "to-teal-600",
  },
};

const features = [
  {
    title: "Smart Editing",
    description: "AI-powered content enhancement and correction.",
    icon: "Edit",
  },
  {
    title: "Style Analysis",
    description: "Intelligent writing style recommendations.",
    icon: "TypeWriter",
  },
  {
    title: "Grammar Check",
    description: "Advanced grammar and syntax correction.",
    icon: "Check",
  },
  {
    title: "Tone Adjustment",
    description: "Smart tone and voice modification tools.",
    icon: "Music",
  },
  {
    title: "Plagiarism Detection",
    description: "Advanced content originality verification.",
    icon: "Search",
  },
  {
    title: "Auto Formatting",
    description: "Intelligent document formatting assistance.",
    icon: "Layout",
  },
];

const useCases = [
  {
    title: "Content Creation",
    description: "Perfect your articles, blogs, and social media posts.",
  },
  {
    title: "Academic Writing",
    description: "Enhance research papers and academic works.",
  },
  {
    title: "Business Documents",
    description: "Polish professional documents and proposals.",
  },
];

const headerContent = {
  title: "Perfect Your Content with",
  highlightText: "Editron",
  description:
    "AI-powered writing assistant that helps you create flawless content. Enhanced grammar checking, style suggestions, and intelligent editing features.",
  videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
  videoTitle: "Editron Platform Overview",
  getStartedLink: "/signup",
  accentColor: THEME.color,
  accentGradient: THEME.gradient,
};

const demoContent = {
  title: "Writing Enhancement Demo",
  subtitle: "Experience our AI editing capabilities",
  defaultInput: "Paste your text here for instant improvements...",
  inputPlaceholder: "Enter your content to edit...",
  outputPlaceholder: "Enhanced content will appear here...",
  buttonText: "Enhance Text",
  processingDelay: 2000,
  simulatedResponse:
    "Content Analysis Complete:\n- Grammar Score: 98%\n- Style: Professional\n- Tone: Confident\n- Suggestions: 3 improvements found\n- Readability: Grade A",
};

export default function Editron() {
  return (
    <>
      <CursorEffect variant="glow" color={THEME.color} size={500} blur={100} />
      <Navbar />
      <main className="min-h-screen">
        <Header {...headerContent} />
        <InteractiveDemo {...demoContent} />
        <Features features={features} />
        <UseCases useCases={useCases} />
      </main>
      <Footer />
    </>
  );
}
