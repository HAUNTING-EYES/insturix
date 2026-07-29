import { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/careers" },
  title: "Careers | Join Our Team",
  description:
    "Explore career opportunities at Insturix. We're hiring for various roles in AI, technology, and more. Join our team and help shape the future of AI.",
  keywords:
    "Careers Insturix , Join Our Team , Insturix careers , Careers at Insturix , Job openings at Insturix , Work at Insturix , Careers in AI , Careers in technology",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/careers",
    siteName: "Insturix",
    title: "Careers | Join Our Team",
    description:
      "Explore career opportunities at Insturix. We're hiring for various roles in AI, technology, and more. Join our team and help shape the future of AI.",
    images: [
      {
        url: "/icons/contact-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Careers Insturix - Join Our Team",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Careers | Join Our Team",
    description:
      "Explore career opportunities at Insturix. We're hiring for various roles in AI, technology, and more. Join our team and help shape the future of AI.",
    images: ["/icons/careers-twitter-image.jpg"],
  },
};

export default function CareersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
    </>
  );    
}