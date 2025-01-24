import Header from "@/components/new-product-page/Header";
import InteractiveDemo from "@/components/new-product-page/InteractiveDemo";
import Features from "@/components/new-product-page/Features";
import UseCases from "@/components/new-product-page/UseCases";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CursorEffect from "@/components/ui/CursorEffect";

const THEME = {
  color: "rgba(34, 197, 94, 0.15)",
  gradient: {
    from: "from-green-400",
    to: "to-green-600",
  },
};

const features = [
  {
    title: "AI Health Analysis",
    description: "Advanced health monitoring and prediction system.",
    icon: "Heart",
  },
  {
    title: "Wellness Tracking",
    description: "Track your daily wellness metrics and habits.",
    icon: "Activity",
  },
  {
    title: "Smart Diagnostics",
    description: "AI-powered health diagnostics and recommendations.",
    icon: "Stethoscope",
  },
  {
    title: "Mental Wellness",
    description: "Track and improve your mental well-being.",
    icon: "Brain",
  },
  {
    title: "Nutrition AI",
    description: "Personalized nutrition recommendations.",
    icon: "Apple",
  },
  {
    title: "Sleep Analysis",
    description: "Advanced sleep pattern analysis and tips.",
    icon: "Moon",
  },
];

const useCases = [
  {
    title: "Personal Health",
    description: "Monitor and improve your daily health metrics.",
  },
  {
    title: "Healthcare Providers",
    description: "Enhanced patient monitoring and care delivery.",
  },
  {
    title: "Wellness Centers",
    description: "Comprehensive health tracking for facilities.",
  },
];

const headerContent = {
  title: "Transform Your Health with",
  highlightText: "Meditron",
  description:
    "AI-powered health monitoring and wellness optimization platform. Get personalized insights and recommendations for better health outcomes.",
  videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
  videoTitle: "Meditron Health Platform Overview",
  getStartedLink: "/signup",
  accentColor: THEME.color,
  accentGradient: THEME.gradient,
};

const demoContent = {
  title: "Health Analysis Demo",
  subtitle: "Experience our AI health analysis in action",
  defaultInput: "Describe your symptoms or health concerns...",
  inputPlaceholder: "Enter your health data or concerns here...",
  outputPlaceholder: "Health analysis results will appear here...",
  buttonText: "Analyze Health",
  processingDelay: 2000,
  simulatedResponse:
    "Health Analysis Complete:\n- Overall Health Score: 85%\n- Recommendations: Increase water intake\n- Sleep Quality: Good\n- Stress Level: Moderate",
};

export default function Meditron() {
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
