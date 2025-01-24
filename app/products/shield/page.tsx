import Header from "@/components/new-product-page/Header";
import InteractiveDemo from "@/components/new-product-page/InteractiveDemo";
import Features from "@/components/new-product-page/Features";
import UseCases from "@/components/new-product-page/UseCases";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CursorEffect from "@/components/ui/CursorEffect";

const THEME = {
  color: "rgba(147, 51, 234, 0.15)",
  gradient: {
    from: "from-purple-400",
    to: "to-purple-600",
  },
};

const features = [
  {
    title: "Smart Protection",
    description: "AI-powered threat detection and prevention system.",
    icon: "Shield",
  },
  {
    title: "Real-time Monitoring",
    description: "24/7 surveillance and instant threat alerts.",
    icon: "Eye",
  },
  {
    title: "Zero-Day Defense",
    description: "Protection against newest security threats.",
    icon: "Shell",
  },
  {
    title: "Access Control",
    description: "Advanced authentication and authorization.",
    icon: "Key",
  },
  {
    title: "Data Encryption",
    description: "Military-grade encryption for your data.",
    icon: "Lock",
  },
  {
    title: "Secure Backup",
    description: "Automated backup with encrypted storage.",
    icon: "Save",
  },
];

const useCases = [
  {
    title: "Enterprise Security",
    description: "Comprehensive protection for business infrastructure.",
  },
  {
    title: "Personal Privacy",
    description: "Keep your personal data safe and secure.",
  },
  {
    title: "Cloud Security",
    description: "Protect your cloud applications and data.",
  },
];

const headerContent = {
  title: "Next-Generation Security with",
  highlightText: "Shield",
  description:
    "Advanced AI-powered security solution that protects your digital assets from modern threats. Stay ahead of cybercriminals with our intelligent security system.",
  videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
  videoTitle: "Shield Security System Overview",
  getStartedLink: "/signup",
  accentColor: THEME.color,
  accentGradient: THEME.gradient,
};

const demoContent = {
  title: "Security Scanner Demo",
  subtitle: "Experience our security analysis in real-time",
  defaultInput: "Enter a URL or piece of code to analyze...",
  inputPlaceholder: "https://example.com or paste code here...",
  outputPlaceholder: "Security analysis results will appear here...",
  buttonText: "Scan Now",
  processingDelay: 2000,
  simulatedResponse:
    "Security Scan Complete:\n- Threat Level: Low\n- Vulnerabilities: None detected\n- SSL/TLS: Valid\n- Firewall Status: Active",
};

export default function Shield() {
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
