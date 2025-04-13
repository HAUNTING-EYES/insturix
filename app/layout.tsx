import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import ThemeProvider from "@/providers/ThemeProvider";
import { Toaster } from "@/components/ui/toaster";
import ReactQueryProvider from "@/providers/ReactQuery";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { TransitionProvider } from "@/components/Loader/TransitionProvider";
import { Inter } from "next/font/google";
import { keywords } from "@/lib/seo/keywords";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#000000",
};

export const metadata: Metadata = {
  title: "Insturix",
  description: "Building Future, Together.",
  manifest: "./manifest.json",
  keywords: keywords,
  icons: {
    icon: [
      { url: "./favicon.ico", sizes: "any" }, // ICO favicon
      { url: "../public/icons/icon.svg", type: "image/svg+xml" }, // SVG favicon
      {
        url: "../public/icons/favicon-16x16.png",
        sizes: "16x16",
        type: "image/png",
      },
      {
        url: "../public/icons/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "../public/icons/apple-touch-icon.png",
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider waitlistUrl="/waitlist">
      <html lang="en" className={inter.className}>
        <head>
          <meta
            name="google-site-verification"
            content={process.env.GOOGLE_VERIFICATION_ID}
          />
          <script async src={process.env.GOOGLE_ADSENSE} crossOrigin="anonymous"></script>
        </head>
        <body>
          <ReactQueryProvider>
            <ThemeProvider>
              <TransitionProvider>
                {children}
                <Analytics />
                <SpeedInsights />
                <Toaster />
                <ReactQueryDevtools />
              </TransitionProvider>
            </ThemeProvider>
          </ReactQueryProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
