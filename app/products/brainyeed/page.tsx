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
    title: "Smart Learning",
    description: "AI-powered personalized learning paths.",
    icon: "Brain",
  },
  {
    title: "Progress Tracking",
    description: "Advanced analytics on learning progress.",
    icon: "LineChart",
  },
  {
    title: "Interactive Exercises",
    description: "Engaging practice with instant feedback.",
    icon: "Pencil",
  },
  {
    title: "Concept Mapping",
    description: "Visual learning and concept connections.",
    icon: "Network",
  },
  {
    title: "Study Planning",
    description: "Optimized study schedules and reminders.",
    icon: "Calendar",
  },
  {
    title: "Knowledge Testing",
    description: "Adaptive quizzes and assessments.",
    icon: "GraduationCap",
  },
];

const useCases = [
  {
    title: "Students",
    description: "Enhance your learning and academic performance.",
  },
  {
    title: "Educators",
    description: "Track and improve student progress effectively.",
  },
  {
    title: "Self-Learners",
    description: "Master new skills at your own pace.",
  },
];

const headerContent = {
  title: "Accelerate Your Learning with",
  highlightText: "Brainyeed",
  description:
    "AI-powered learning platform that adapts to your needs. Experience personalized education with intelligent feedback and progress tracking.",
  videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
  videoTitle: "Brainyeed Learning Platform Overview",
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

export default function Brainyeed() {
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
