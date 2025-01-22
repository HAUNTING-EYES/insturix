import Header from "@/components/new-product-page/Header";
import InteractiveDemo from "@/components/new-product-page/InteractiveDemo";
import Features from "@/components/new-product-page/Features";
import UseCases from "@/components/new-product-page/UseCases";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CursorEffect from "@/components/ui/CursorEffect";

const THEME = {
  color: "rgba(59, 130, 246, 0.15)",
  gradient: {
    from: "from-blue-400",
    to: "to-blue-600"
  }
};

const features = [
  {
    title: "Real-time Processing",
    description: "Process and analyze content instantly with our advanced AI algorithms.",
    icon: "Zap",
  },
  {
    title: "Enhanced Security",
    description: "Military-grade encryption and security protocols to protect your data.",
    icon: "Shield",
  },
  {
    title: "Smart Analytics",
    description: "Gain deep insights with our intelligent analytics and reporting.",
    icon: "LineChart",
  },
  {
    title: "Neural Networks",
    description: "Advanced neural networks for superior pattern recognition.",
    icon: "Brain",
  },
  {
    title: "Edge Computing",
    description: "Distributed processing for faster response times.",
    icon: "Cpu",
  },
  {
    title: "Privacy First",
    description: "Your data privacy is our top priority with end-to-end encryption.",
    icon: "Lock",
  },
];

const useCases = [
  {
    title: "Healthcare",
    description: "AI-powered diagnostics and personalized treatment plans.",
  },
  {
    title: "Finance",
    description:
      "Intelligent fraud detection and automated trading strategies.",
  },
  {
    title: "Education",
    description: "Adaptive learning systems and automated grading.",
  },
];

const headerContent = {
  title: "Revolutionize Your Content Safety with",
  highlightText: "Techie Tiwari",
  description: "Harness the power of AI to moderate your content and keep your users safe. Intelligent, efficient, and reliable content moderation.",
  videoUrl: "https://www.youtube.com/embed/FieYiEcMJow",
  videoTitle: 'Nirmala Sitharaman Left Speechless To "Govt My Sleeping Partner" Question',
  getStartedLink: "/signup",
  accentColor: THEME.color,
  accentGradient: THEME.gradient
};

const demoContent = {
  title: "Interactive AI Demo",
  subtitle: "Try out our AI-powered content moderation in real-time",
  defaultInput: "Enter some text to analyze its safety and content...",
  inputPlaceholder: "Type or paste your content here...",
  outputPlaceholder: "Content analysis results will appear here...",
  buttonText: "Analyze Content",
  processingDelay: 3000,
  simulatedResponse: "Content Analysis Complete:\n- Safety Score: 95%\n- No harmful content detected\n- Tone: Professional\n- Suggested improvements: None"
};

export default function TechieTewari() {
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
