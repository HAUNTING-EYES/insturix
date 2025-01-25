import Header from "@/components/new-product-page/Header";
import InteractiveDemo from "@/components/new-product-page/InteractiveDemo";
import Features from "@/components/new-product-page/Features";
import UseCases from "@/components/new-product-page/UseCases";
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
  videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
  videoTitle: "AI Idea Generator for Content and Marketing",
  getStartedLink: "/signup",
  accentColor: THEME.color,
  accentGradient: THEME.gradient,
};

const demoContent = {
  title: "Learning Analysis Demo",
  subtitle: "Experience our adaptive learning system",
  defaultInput: "Enter a topic you want to learn...",
  inputPlaceholder: "e.g., Mathematics, Physics, Programming...",
  outputPlaceholder: "Your personalized learning plan will appear here...",
  buttonText: "Generate Plan",
  processingDelay: 2000,
  simulatedResponse:
    "Learning Analysis Complete:\n- Recommended Path: Intermediate\n- Est. Time: 4 weeks\n- Key Topics: 5 identified\n- Practice Exercises: 12\n- Assessment Tests: 3",
};

export default function thinkforge() {
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
