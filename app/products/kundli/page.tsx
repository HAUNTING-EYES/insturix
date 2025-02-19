import Header from "@/components/new-product-page/Header";
 // import InteractiveDemo from "@/components/new-product-page/InteractiveDemo";
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
    title: "In-Depth Analytics",
    description: "Offers detailed reports on audience engagement, follower trends, and content performance.",
    icon: "ChartBar",
  },
  {
    title: "Growth Strategies",
    description: "Recommends personalized action plans for optimizing account growth.",
    icon: "Users",
  },
  {
    title: "Authenticity Checks",
    description: "Detects fake followers and engagement metrics for credibility analysis.",
    icon: "Heart",
  },
  {
    title: "Competitor Benchmarking",
    description: "Compares accounts with peers in the same niche.",
    icon: "TrendingUp",
  },
  {
    title: "Real-Time Updates",
    description: "Tracks dynamic metrics to adapt strategies on the fly.",
    icon: "Sparkles",
  },
];

const useCases = [
  {
    title: "Social Media Agencies",
    description: "Optimizes client account performance with growth and engagement insights.",
  },
  {
    title: "Influencers",
    description: "Provides detailed analytics to refine content strategy and boost audience interaction.",
  },
  {
    title: "Brands",
    description: "Helps evaluate potential influencer partnerships by analyzing follower engagement and authenticity.",
  },
  {
    title: "Startups",
    description: "Offers actionable insights to grow their digital presence effectively.",
  },
  {
    title: "Event Organizers",
    description: "Analyzes audience trends to optimize event promotion strategies.",
  },
];

const headerContent = {
  title: "Understand Your Audience Better with",
  highlightText: "Kund-li",
  description:
    "Optimize social media accounts with growth insights, refine content strategy, and evaluate influencer partnerships effectively.",
  videoUrl: "https://www.youtube.com/embed/kIhb5pEo_j0?si=6Nah3lDaJg_RwTIp",
  videoTitle: "Account Performance Optimization with Kund-Li",
  getStartedLink: "/signup",
  accentColor: THEME.color,
  accentGradient: THEME.gradient,
};

{ /* const demoContent = {
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
}; */}

export default function Kundli() {
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
