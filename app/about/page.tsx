import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AboutContent from "@/components/AboutContent";
import CursorEffect from "@/components/ui/CursorEffect";

export default function AboutPage() {
    return (
        <>
            <CursorEffect variant="glow" color="rgba(59, 130, 246, 0.15)" size={500} blur={100} />
            <Navbar />
            <AboutContent />
            <Footer />
        </>
    );
}
