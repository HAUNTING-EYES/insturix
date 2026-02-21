import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import TeamContent from "@/components/TeamContent";
import CursorEffect from "@/components/ui/CursorEffect";

export default function TeamPage() {
  return (
    <div className="selection:bg-zinc-800 selection:text-white">
      <Navbar />
      <main>
        <TeamContent />
      </main>
      <Footer />
    </div>
  );
}
