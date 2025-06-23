import Header from "@/components/new-product-page/Header";
import Features from "@/components/new-product-page/Features";
import UseCases from "@/components/new-product-page/UseCases";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CursorEffect from "@/components/ui/CursorEffect";

const THEME = {
  color: "rgba(234, 179, 8, 0.20)",
  gradient: {
    from: "from-amber-400",
    to: "to-amber-600",
  },
};
const features = [
  {
    title: "AI Music Generation",
    description: "Generate unique music tracks using advanced AI algorithms across multiple genres.",
    icon: "Music",
  },
  {
    title: "Lyrics Integration",
    description: "Add your own lyrics to generate personalized songs with matching melodies.",
    icon: "PenTool",
  },
  {
    title: "Genre Selection",
    description: "Choose from various music genres including pop, rock, classical, jazz, and more.",
    icon: "List",
  },
  {
    title: "Custom Instruments",
    description: "Select and mix different instruments to create your perfect sound.",
    icon: "Radio",
  },
  {
    title: "Export Options",
    description: "Download your creations in multiple formats with professional quality.",
    icon: "Download",
  },
];

const useCases = [
  {
    title: "Content Creators",
    description: "Create unique background music for videos and podcasts instantly.",
  },
  {
    title: "Musicians",
    description: "Generate inspiration and backing tracks for your compositions.",
  },
  {
    title: "Game Developers",
    description: "Create dynamic soundtracks and sound effects for your games.",
  },
  {
    title: "Filmmakers",
    description: "Generate custom scores and atmospheric music for your productions.",
  },
  {
    title: "Advertisers",
    description: "Create original jingles and background music for commercials.",
  },
];

const headerContent = {
  title: "Create Custom Music with",
  highlightText: "Musitron",
  description:
    "Generate unique AI-powered music across multiple genres, add your own lyrics, and create the perfect soundtrack for any project.",
  videoUrl: "https://www.youtube.com/embed/kIhb5pEo_j0?si=6Nah3lDaJg_RwTIp",
  videoTitle: "AI Music Generation with Musitron",
  getStartedLink: "/signup",
  accentColor: THEME.color,
  accentGradient: THEME.gradient,
};

export default function Musitron() {
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
