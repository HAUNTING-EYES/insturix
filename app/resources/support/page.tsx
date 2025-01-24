import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SupportContent from "@/components/SupportContent";
import CursorEffect from "@/components/ui/CursorEffect";

export default function SupportPage() {
  return (
    <>
      <CursorEffect variant="glow" color="rgba(59, 130, 246, 0.15)" size={500} blur={100} />
      <Navbar />
      <SupportContent />
      <Footer />
    </>
  );
}
