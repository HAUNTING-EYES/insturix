import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import TutorialContent from "@/components/TutorialContent";
import CursorEffect from "@/components/ui/CursorEffect";

export default function TutorialsPage() {
  return (
    <>
      <CursorEffect
        variant="glow"
        color="rgba(59, 130, 246, 0.15)"
        size={500}
        blur={100}
      />
      <Navbar />
      <TutorialContent />
      <Footer />
    </>
  );
}
