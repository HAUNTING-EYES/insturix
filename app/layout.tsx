import type { Metadata } from "next";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import ThemeProvider from "@/providers/ThemeProvider";
import { Toaster } from "@/components/ui/toaster";

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
            <ThemeProvider>
              {children}
              <Toaster />
            </ThemeProvider>
          </body>
        </html>
      </ClerkProvider>
    </>
  );
}
