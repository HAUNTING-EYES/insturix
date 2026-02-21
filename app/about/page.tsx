import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AboutContent from "@/components/AboutContent";
import CursorEffect from "@/components/ui/CursorEffect";

export default function AboutPage() {
  return (
    <div className="selection:bg-zinc-800 selection:text-white">
      <Navbar />
      <main>
        <AboutContent />
      </main>
      <Footer />
    </div>
  );
}
