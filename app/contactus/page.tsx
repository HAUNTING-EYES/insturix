import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import { ContactPage } from "@/components/shared/contact-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact | Insturix",
  description: "Get in touch with Insturix. We respond within 24 hours.",
};

export default function ContactUs() {
  return (
    <>
      <SiteNavbar />
      <ContactPage />
      <SiteFooter />
    </>
  );
}
