import Header from "@/components/new-product-page/Header";
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
    title: "Copyright Defense",
    description: "Shields accounts and content from infringement claims.",
    icon: "Shield",
  },
  {
    title: "Account Security",
    description: "Protects against community guideline strikes and takedowns.",
    icon: "Eye",
  },
  {
    title: "Content Theft Prevention",
    description: "Monitors for unauthorized use of intellectual property.",
    icon: "Shell",
  },
  {
    title: "Legal Assistance",
    description: "Offers guidance and resources for handling disputes.",
    icon: "Key",
  },
  {
    title: "Subscription-Based Model",
    description: "Flexible tiers for creators at all levels.",
    icon: "Save",
  },
];

const useCases = [
  {
    title: "Content Creators",
    description: "Protects accounts from copyright strikes, takedowns, and guideline violations.",
  },
  {
    title: "Brands",
    description: "Safeguards their social media presence and intellectual property.",
  },
  {
    title: "E-learning Platforms",
    description: "Secures online course materials against unauthorized use or duplication.",
  },
  {
    title: "Event Planners",
    description: "Protects promotional content from copyright claims during campaigns.",
  },
  {
    title: "Podcasters",
    description: "Shields audio content from unauthorized use or takedowns.",
  },
];

const headerContent = {
  title: "Next-Generation Security with",
  highlightText: "Shield",
  description:
    "Protects content creators and brands from copyright issues, takedowns, and content theft, ensuring peace of mind and legal safety.",
  videoUrl: "https://www.youtube.com/embed/kIhb5pEo_j0?si=6Nah3lDaJg_RwTIp",
  videoTitle: "Content Protection and Policy Enforcement",
  getStartedLink: "/products/shield/contact",
  accentColor: THEME.color,
  accentGradient: THEME.gradient,
};

export default function Shield() {
  return (
    <>
      <CursorEffect variant="glow" color={THEME.color} size={500} blur={100} />
      <Navbar />
      <main className="min-h-screen">
        <Header {...headerContent} />
        <Features features={features} />
        <UseCases useCases={useCases} />
      </main>
      <Footer />
    </>
  );
}
