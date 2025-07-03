// import Header from "@/components/new-product-page/Header";
// import Features from "@/components/new-product-page/Features";
// import UseCases from "@/components/new-product-page/UseCases";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CursorEffect from "@/components/ui/CursorEffect";

const THEME = {
  color: "rgba(20, 184, 166, 0.15)",
  gradient: {
    from: "from-teal-400",
    to: "to-teal-600",
  },
};

const features = [
  {
    title: "AI-Powered Automation",
    description:
      "Converts raw footage into polished, upload-ready videos in minutes.",
    icon: "Edit",
  },
  {
    title: "Topic Detection",
    description:
      "Extracts topics from audio and timestamps them for easy editing.",
    icon: "TypeWriter",
  },
  {
    title: "Seamless Editing",
    description:
      "Trim, stitch, and add captions, transitions, and effects effortlessly.",
    icon: "Check",
  },
  {
    title: "Augmented Creativity",
    description:
      "Real-life physics replication, facial emotion mapping, and movement simulation.",
    icon: "Music",
  },
  {
    title: "Scalability",
    description:
      "Handles content for multiple platforms, from short reels to long-format videos.",
    icon: "Layout",
  },
];

const useCases = [
  {
    title: "Media Production",
    description:
      "Automates post-production for ad agencies, studios, and independent filmmakers, reducing editing time by 90%.",
  },
  {
    title: "Social Media",
    description:
      "Enables influencers and marketers to create polished, platform-ready videos in minutes.",
  },
  {
    title: "Corporate Training",
    description:
      "Simplifies editing of webinars, tutorials, and employee training videos with clean transitions and captions.",
  },
  {
    title: "Education",
    description:
      "Assists educators in creating engaging video lessons quickly.",
  },
  {
    title: "Event Coverage",
    description:
      "Streamlines editing for event videographers to meet tight delivery deadlines.",
  },
];

const headerContent = {
  title: "Create Flawless Content in Minutes with",
  highlightText: "Editron",
  description:
    "Automates video post-production, simplifies social media content creation, and streamlines corporate and educational video editing.",
  videoUrl: "https://www.youtube.com/embed/kIhb5pEo_j0?si=6Nah3lDaJg_RwTIp",
  videoTitle: "AI Video Editor for Media Production",
  getStartedLink: "/signup",
  accentColor: THEME.color,
  accentGradient: THEME.gradient,
};

export default function Editron() {
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
