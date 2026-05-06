import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import { ContactChannel } from "@/components/shared/contact/contact-channel";

export default function ContactB() {
  return (
    <>
      <SiteNavbar />
      <ContactChannel />
      <SiteFooter />
    </>
  );
}
