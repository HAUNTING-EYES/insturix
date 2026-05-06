import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import { ContactSignal } from "@/components/shared/contact/contact-signal";

export default function ContactD() {
  return (
    <>
      <SiteNavbar />
      <ContactSignal />
      <SiteFooter />
    </>
  );
}
