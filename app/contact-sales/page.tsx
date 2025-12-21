import { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ContactSalesForm from "@/components/ContactSales/ContactSalesForm";
import ProgressBarWrapper from "@/components/ProgressBarWrapper";

export const metadata: Metadata = {
  title: "Contact Sales | Insturix Enterprise",
  description: "Get in touch with our sales team to learn how Insturix Enterprise can help your team deliver better software, faster.",
  alternates: {
    canonical: "/contact-sales",
  },
  openGraph: {
    title: "Contact Sales | Insturix Enterprise",
    description: "Get in touch with our sales team to learn how Insturix Enterprise can help your team deliver better software, faster.",
    images: [
      {
        url: "/icons/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix Enterprise - Contact Sales",
      },
    ],
  },
};

export default function ContactSalesPage() {
  return (
    <>
      <ProgressBarWrapper />
      <Navbar />
      <ContactSalesForm />
      <Footer />
    </>
  );
}

