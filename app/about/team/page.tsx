import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import TeamContent from "@/components/TeamContent";
import CursorEffect from "@/components/ui/CursorEffect";

export default function TeamPage() {
    return (
        <>
            <CursorEffect variant="glow" color="rgba(59, 130, 246, 0.15)" size={500} blur={100} />
            <Navbar />
            <TeamContent />
            <Footer />
        </>
    );
}
