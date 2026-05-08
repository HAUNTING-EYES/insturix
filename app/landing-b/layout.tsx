export default function LandingBLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Bypass the default app shell (Navbar, Footer, ThemeProvider)
  // This page is a standalone scroll-driven experience
  return <>{children}</>;
}
