import DonationPage from "@/components/DonationPage";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import CursorEffect from "@/components/ui/CursorEffect";
import { CurrencyProvider } from "@/lib/CurrencyContext";
import { PricingClientProvider } from "@/lib/PricingContext";

export default function Donate() {
    return (
        <PricingClientProvider>
            <CurrencyProvider>
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
            </CurrencyProvider>
        </PricingClientProvider>
    );
}