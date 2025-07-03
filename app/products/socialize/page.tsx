// import Header from "@/components/new-product-page/Header";
// import Features from "@/components/new-product-page/Features";
// import UseCases from "@/components/new-product-page/UseCases";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CursorEffect from "@/components/ui/CursorEffect";

const THEME = {
  color: "rgba(14, 165, 233, 0.15)",
  gradient: {
    from: "from-sky-400",
    to: "to-blue-600",
  },
};
const features = [
  {
    title: "Custom Bio Links",
    description: "Create beautiful, personalized link pages that match your brand identity.",
    icon: "Link",
  },
  {
    title: "Analytics Dashboard",
    description: "Track clicks, visitor engagement, and performance of each link.",
    icon: "ChartBar",
  },
  {
    title: "Beautiful Themes",
    description: "Choose from various pre-made themes or create your own custom design.",
    icon: "Palette",
  },
  {
    title: "Social Integration",
    description: "Seamlessly connect all your social media profiles in one place.",
    icon: "Share2",
  },
  {
    title: "Mobile Optimization",
    description: "Perfect viewing experience on all devices and screen sizes.",
    icon: "Smartphone",
  },
];

const useCases = [
  {
    title: "Content Creators",
    description: "Share all your content, merchandise, and social profiles in one beautiful page.",
  },
  {
    title: "Businesses",
    description: "Connect customers to your products, services, and social channels effortlessly.",
  },
  {
    title: "Artists",
    description: "Showcase your portfolio, exhibitions, and available works in one place.",
  },
  {
    title: "Professionals",
    description: "Create a professional landing page with your resume, portfolio, and contact info.",
  },
  {
    title: "Event Promoters",
    description: "Share event details, ticket links, and updates through a single link.",
  },
];

const headerContent = {
  title: "Share Everything You Are with",
  highlightText: "Socialize",
  description:
    "Create a stunning landing page for all your content, social profiles, and links. Make it easier for your audience to find everything you share online.",
  videoUrl: "https://www.youtube.com/embed/kIhb5pEo_j0?si=6Nah3lDaJg_RwTIp",
  videoTitle: "Create Your Perfect Landing Page with Socialize",
  getStartedLink: "/dashboard/socialize",
  accentColor: THEME.color,
  accentGradient: THEME.gradient,
};

export default function Socialize() {
  return (
    <>
      <CursorEffect variant="glow" color={THEME.color} size={500} blur={100} />
      <Navbar />
      <main className="min-h-screen">
        {/* <Header {...headerContent} />
        <Features features={features} />
        <UseCases useCases={useCases} /> */}
      </main>
      <Footer />
    </>
  );
}
