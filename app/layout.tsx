import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk, Caveat, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "./design-tokens.css";
import { ClerkProvider } from "@clerk/nextjs";
import ThemeProvider from "@/providers/ThemeProvider";
import { Toaster } from "@/components/ui/toaster";
import ReactQueryProvider from "@/providers/ReactQuery";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import ClientAnalyticsLoader from '@/components/analytics/ClientLoader';
import { SpeedInsights } from "@vercel/speed-insights/next";
import { keywords } from "@/lib/seo/keywords";
import { getBaseUrl } from "@/lib/env";


const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], display: "swap", variable: "--font-space-grotesk" });
const caveat = Caveat({ subsets: ["latin"], display: "swap", variable: "--font-caveat" });
const plusJakartaSans = Plus_Jakarta_Sans({ subsets: ["latin"], display: "swap", variable: "--font-plus-jakarta-sans" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], display: "swap", variable: "--font-jetbrains-mono" });



export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#000000",
};

// Base metadata that will be extended based on the route
export const metadata: Metadata = {
  title: {
    default: "Insturix | Automated Content Production Platform",
    template: "%s | Insturix",
  },
  description:
    "Insturix is an automated content production platform for agencies, in-house teams, businesses, enterprises, creator houses, and filmmakers.",
  manifest: "/manifest.json",
  keywords: keywords,
  metadataBase: new URL(getBaseUrl()),
  // NOTE (2026-07): no `alternates` here on purpose.
  //
  // Next.js metadata is INHERITED, so a root-level `canonical: "/"` was emitted on
  // every page that didn't override it — /upgrade, /showcase, /about, /contactus,
  // /newsroom, /resources/* and every blog post all told crawlers "the canonical
  // version of this page is the homepage", which suppresses them from search and
  // from answer-engine retrieval. The `languages: { "en-US": "/en-US" }` hreflang
  // also pointed at a URL that 404s.
  //
  // Pages that need a canonical declare their own (see app/page.tsx,
  // app/products/page.tsx, app/resources/blogs/[slug]/page.tsx). Pages that don't
  // are self-canonical by default, which is the correct signal.
  openGraph: {
    type: "website",
    locale: "en_US",
    // NOTE: no `url` here, on purpose — same trap as the canonical above. Next.js
    // metadata is inherited, so a root-level absolute og:url was emitted by every
    // page that does not declare its own openGraph, telling crawlers and social
    // platforms that /upgrade, /showcase and /support-us were all the homepage.
    // og:url must be the page's OWN url, so each page declares it.
    title: "Insturix | Automated Content Production Platform",
    description:
      "Automate content production from planning and editing to analysis, creative assets, and publishing workflows.",
    siteName: "Insturix",
    images: [
      {
        url: "/icons/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix - Automated Content Production Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Insturix | Automated Content Production Platform",
    description:
      "Automated content production for agencies, in-house teams, businesses, enterprises, creator houses, and filmmakers.",
    images: ["/icons/twitter-image.jpg"],
    creator: "@insturix",
    site: "@insturix",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "./favicon.ico", sizes: "any" }, // ICO favicon
      { url: "/icons/icon.svg", type: "image/svg+xml" }, // SVG favicon
      {
        url: "/icons/favicon-16x16.png",
        sizes: "16x16",
        type: "image/png",
      },
      {
        url: "/icons/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    title: "Insturix",
    statusBarStyle: "default",
    capable: true,
  },
  applicationName: "Insturix",
  category: "technology",
  other: {
    "msapplication-TileColor": "#000000",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
  <html lang="en" className={`antialiased ${inter.variable} ${spaceGrotesk.variable} ${caveat.variable} ${plusJakartaSans.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
        <head>
          <meta
            name="google-site-verification"
            content={process.env.GOOGLE_VERIFICATION_ID}
          />
          <script
            async
            src={process.env.GOOGLE_ADSENSE_ID}
            crossOrigin="anonymous"
          ></script>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "Organization",
                name: "Insturix",
                url: getBaseUrl(),
                logo: `${getBaseUrl()}/icons/logo.png`,
                sameAs: [
                  "https://twitter.com/insturix",
                  "https://www.linkedin.com/company/insturix",
                  "https://www.instagram.com/insturix",
                ],
                contactPoint: {
                  "@type": "ContactPoint",
                  email: "support@insturix.com",
                  contactType: "customer service",
                },
              }),
            }}
          />
        </head>
        <body suppressHydrationWarning>
          <ReactQueryProvider>
            <ThemeProvider>
              {children}
              {/* Lazy-loaded analytics & performance monitor (client-only) */}
              <ClientAnalyticsLoader />
              <SpeedInsights />
              <Toaster />
              {process.env.NODE_ENV === 'development' && (
                <>
                  <ReactQueryDevtools />
                </>
              )}
            </ThemeProvider>
          </ReactQueryProvider>
          <footer aria-hidden="true" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap" }}>
            <p>Insturix is an automated content production platform.</p>
            <a href="/legal/privacy">Privacy Policy</a>
            <a href="/legal/terms">Terms of Service</a>
            <a href="mailto:support@insturix.com">Contact</a>
          </footer>
        </body>
      </html>
    </ClerkProvider>
  );
}
