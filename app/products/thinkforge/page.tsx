// import Header from "@/components/new-product-page/Header";
// import Features from "@/components/new-product-page/Features";
// import UseCases from "@/components/new-product-page/UseCases";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CursorEffect from "@/components/ui/CursorEffect";

const THEME = {
  color: "rgba(239, 68, 68, 0.15)",
  gradient: {
    from: "from-red-400",
    to: "to-red-600",
  },
};

const features = [
  {
    title: "Creative Sparks",
    description: "Generates actionable ideas for videos, blogs, campaigns, and more.",
    icon: "Lightbulb",
  },
  {
    title: "AI-Driven Insights",
    description: "Leverages algorithms to deliver unique, trend-aligned concepts.",
    icon: "LineChart",
  },
  {
    title: "Personalized Suggestions",
    description: "Tailored ideas based on industry, niche, and goals.",
    icon: "Calendar",
  },
  {
    title: "Collaborative Brainstorming",
    description: "Enables team usage for collective ideation.",
    icon: "Users",
  },
  {
    title: "Rapid Output",
    description: "Produces ideas in seconds, keeping up with fast-paced industries.",
    icon: "Sparkles",
  },
];

const useCases = [
  {
    title: "Content Creators",
    description: "Generates fresh, engaging ideas for videos, blogs, and posts.",
  },
  {
    title: "Brands",
    description: "Brainstorms innovative marketing strategies and campaign concepts.",
  },
  {
    title: "Agencies",
    description: "Assists in ideating unique client pitches and proposals.",
  },
  {
    title: "Startups",
    description: "Provides insights for product innovation and go-to-market strategies.",
  },
  {
    title: "Education",
    description: "Sparks creative lesson plans, workshops, and student projects.",
  },
];

const headerContent = {
  title: "Supercharge Your Content with",
  highlightText: "ThinkForge",
  description:
    "Generates fresh content ideas, innovative marketing strategies, and unique client pitches with AI-driven insights.",
  videoUrl: "https://www.youtube.com/embed/kIhb5pEo_j0?si=6Nah3lDaJg_RwTIp",
  videoTitle: "AI Idea Generator for Content and Marketing",
  getStartedLink: "/signup",
  accentColor: THEME.color,
  accentGradient: THEME.gradient,
};


export default function thinkforge() {
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
