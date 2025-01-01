import type { Metadata } from "next";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import ThemeProvider from "@/providers/ThemeProvider";
import { Toaster } from "@/components/ui/toaster";
import ReactQueryProvider from "@/providers/ReactQuery";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

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
