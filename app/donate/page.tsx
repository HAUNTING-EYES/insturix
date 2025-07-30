import DonationPage from "@/components/DonationPage";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import CursorEffect from "@/components/ui/CursorEffect";

export default function Donate() {
    return (
        <>
            <CursorEffect
                variant="glow"
                color="rgba(59, 130, 246, 0.15)"
                size={500}
                blur={100}
            />
            <Navbar />
            <div className="mt-[60px] md:pt-0">
                <DonationPage />
            </div>
            <Footer />
        </>
    );
}