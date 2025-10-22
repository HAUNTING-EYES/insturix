import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import ThemeProvider from "@/providers/ThemeProvider";
import { Toaster } from "@/components/ui/toaster";
import ReactQueryProvider from "@/providers/ReactQuery";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { PerformanceMonitor } from "@/components/performance/PerformanceMonitor";
import { keywords } from "@/lib/seo/keywords";



export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#000000",
};

// Base metadata that will be extended based on the route
export const metadata: Metadata = {
  title: {
    default: "Insturix | Building Future, Together",
    template: "%s | Insturix",
  },
  description:
    "Building Future, Together. Your all-in-one platform for creator protection, AI-powered tools, and brand collaborations.",
  manifest: "/manifest.json",
  keywords: keywords,
  metadataBase: new URL(process.env.SITE_URL || "https://insturix.com"),
  alternates: {
    canonical: "/",
    languages: {
      "en-US": "/en-US",
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: process.env.SITE_URL,
    title: "Insturix | Building Future, Together",
    description:
      "Your all-in-one platform for creator protection, AI-powered tools, and brand collaborations.",
    siteName: "Insturix",
    images: [
      {
        url: "/icons/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix - Building Future, Together",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Insturix | Building Future, Together",
    description:
      "Your all-in-one platform for creator protection, AI-powered tools, and brand collaborations.",
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
  <html lang="en" className="antialiased">
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
                url: process.env.SITE_URL,
                logo: `${process.env.SITE_URL}/icons/logo.png`,
                sameAs: [
                  "https://twitter.com/insturix",
                  "https://www.linkedin.com/company/insturix",
                  "https://www.instagram.com/insturix",
                ],
                contactPoint: {
                  "@type": "ContactPoint",
                  email: "contact@insturix.com",
                  contactType: "customer service",
                },
              }),
            }}
          />
        </head>
        <body>
          <ReactQueryProvider>
            <ThemeProvider>
              {children}
              <Analytics />
              <SpeedInsights />
              <Toaster />
              {process.env.NODE_ENV === 'development' && (
                <>
                  <ReactQueryDevtools />
                  <PerformanceMonitor />
                </>
              )}
            </ThemeProvider>
          </ReactQueryProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
