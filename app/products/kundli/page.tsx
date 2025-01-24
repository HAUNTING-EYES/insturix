import Header from "@/components/new-product-page/Header";
import InteractiveDemo from "@/components/new-product-page/InteractiveDemo";
import Features from "@/components/new-product-page/Features";
import UseCases from "@/components/new-product-page/UseCases";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CursorEffect from "@/components/ui/CursorEffect";

const THEME = {
  color: "rgba(249, 115, 22, 0.15)",
  gradient: {
    from: "from-orange-400",
    to: "to-orange-600",
  },
};

const features = [
  {
    title: "AI Astrology",
    description: "Advanced astrological calculations and predictions.",
    icon: "Star",
  },
  {
    title: "Birth Chart Analysis",
    description: "Detailed analysis of planetary positions.",
    icon: "Sun",
  },
  {
    title: "Compatibility Match",
    description: "Advanced relationship compatibility analysis.",
    icon: "Heart",
  },
  {
    title: "Daily Predictions",
    description: "Personalized daily horoscope and guidance.",
    icon: "Calendar",
  },
  {
    title: "Life Path Analysis",
    description: "Discover your life purpose and potential.",
    icon: "Compass",
  },
  {
    title: "Remedial Solutions",
    description: "Personalized astrological remedies and guidance.",
    icon: "Sparkles",
  },
];

const useCases = [
  {
    title: "Personal Guidance",
    description: "Get insights about your life path and decisions.",
  },
  {
    title: "Relationship Match",
    description: "Analyze compatibility between partners.",
  },
  {
    title: "Career Planning",
    description: "Astrological guidance for career decisions.",
  },
];

const headerContent = {
  title: "Discover Your Path with",
  highlightText: "Kundli",
  description:
    "AI-powered vedic astrology platform that combines ancient wisdom with modern technology. Get accurate predictions and personalized guidance for your life journey.",
  videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
  videoTitle: "Kundli Platform Overview",
  getStartedLink: "/signup",
  accentColor: THEME.color,
  accentGradient: THEME.gradient,
};

const demoContent = {
  title: "Kundli Analysis Demo",
  subtitle: "Experience our AI astrological analysis",
  defaultInput: "Enter your birth details (Date, Time, Place)...",
  inputPlaceholder: "DD/MM/YYYY, HH:MM, City...",
  outputPlaceholder:
    "Your personalized astrological analysis will appear here...",
  buttonText: "Generate Kundli",
  processingDelay: 2000,
  simulatedResponse:
    "Kundli Analysis Complete:\n- Rising Sign: Leo\n- Moon Sign: Taurus\n- Key Planetary Positions\n- Life Path Number: 7\n- Current Dasha: Jupiter",
};

export default function Kundli() {
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
