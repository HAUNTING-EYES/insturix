import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Insturance",
  description: "Building Future, Together.",
};

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider waitlistUrl="/waitlist">
      <html lang="en" className={inter.className}>
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
