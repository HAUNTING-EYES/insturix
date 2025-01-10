import type { Metadata } from "next";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import ThemeProvider from "@/providers/ThemeProvider";
import { Toaster } from "@/components/ui/toaster";
import ReactQueryProvider from "@/providers/ReactQuery";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata: Metadata = {
  title: "Insturance",
  description: "Building Future, Together.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <ClerkProvider>
        <html lang="en">
          <body>
            <ReactQueryProvider>
              <ThemeProvider>
                {children}
                <Analytics />
                <SpeedInsights />
                <Toaster />
                <ReactQueryDevtools />
              </ThemeProvider>
            </ReactQueryProvider>
          </body>
        </html>
      </ClerkProvider>
    </>
  );
}
