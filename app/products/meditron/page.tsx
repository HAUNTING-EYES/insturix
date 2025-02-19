import Header from "@/components/new-product-page/Header";
// import InteractiveDemo from "@/components/new-product-page/InteractiveDemo";
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
    title: "Creator-Business Matching",
    description: "Connects businesses with niche creators based on engagement and audience.",
    icon: "Sparkles",
  },
  {
    title: "Search Optimization",
    description: "Businesses can find creators tailored to their needs effortlessly.",
    icon: "ChartBar",
  },
  {
    title: "Transparent Payments",
    description: "Built-in escrow service for secure and hassle-free transactions.",
    icon: "Building",
  },
  {
    title: "Growth Opportunities",
    description: "Allows creators to pitch to businesses and grow their portfolios.",
    icon: "Video",
  },
  {
    title: "Real-Time Metrics",
    description: "Monitors campaign performance for both creators and brands.",
    icon: "ChartPie",
  },
];

const useCases = [
  {
    title: "Marketing Agencies",
    description: "Finds genuine creators to amplify brand campaigns.",
  },
  {
    title: "Creators",
    description: "Connects with businesses to monetize their content and grow their portfolio.",
  },
  {
    title: "E-commerce Platforms",
    description: "Partners with niche creators for targeted product promotion.",
  },
  {
    title: "Startups",
    description: "Enables cost-effective influencer marketing for greater visibility.",
  },
  {
    title: "Event Organizers",
    description: "Collaborates with creators for pre-event buzz and live coverage.",
  },
];

const headerContent = {
  title: "Elevate Your Content with",
  highlightText: "Meditron",
  description:
    "A platform connecting creators and businesses for collaborations, sponsorships, and growth opportunities.",
  videoUrl: "https://www.youtube.com/embed/kIhb5pEo_j0?si=6Nah3lDaJg_RwTIp",
  videoTitle: "Creator-to-Business Platform for Marketing",
  getStartedLink: "/signup",
  accentColor: THEME.color,
  accentGradient: THEME.gradient,
};

{ /* const demoContent = {
  title: "Health Analysis Demo",
  subtitle: "Experience our AI health analysis in action",
  defaultInput: "Describe your symptoms or health concerns...",
  inputPlaceholder: "Enter your health data or concerns here...",
  outputPlaceholder: "Health analysis results will appear here...",
  buttonText: "Analyze Health",
  processingDelay: 2000,
  simulatedResponse:
    "Health Analysis Complete:\n- Overall Health Score: 85%\n- Recommendations: Increase water intake\n- Sleep Quality: Good\n- Stress Level: Moderate",
}; */}

export default function Meditron() {
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
