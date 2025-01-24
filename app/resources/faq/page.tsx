import FAQ from "@/components/FAQ";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import CursorEffect from "@/components/ui/CursorEffect";

export default function FaqPage() {
  return (
    <>
      <CursorEffect
        variant="glow"
        color="rgba(59, 130, 246, 0.15)"
        size={500}
        blur={100}
      />
      <Navbar />
      <FAQ />
      <Footer />
    </>
  );
}
