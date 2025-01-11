import Testimo from "@/components/Testimo";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import WhoWeAre from "@/components/WhoWeAre";
import { WhyUs } from "@/components/WhyUs";
import HeroSection from "@/components/Home/HeroSection";

export default function Home() {
  return (
    <>
      <Navbar />
      <HeroSection />
      <WhoWeAre />
      <WhyUs />
      <Testimo />
      <Footer />
    </>
  );
}
