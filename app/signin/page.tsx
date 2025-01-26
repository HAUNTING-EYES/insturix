import Navbar from "@/components/Navbar";
import SignInComponent from "@/components/SignIn";
import CursorEffect from "@/components/ui/CursorEffect";

const THEME = {
  color: "rgba(59, 130, 246, 0.15)", // Blue glow for signin/authentication
};

export default function SignInPage() {
  return (
    <>
      <div className="absolute inset-0 -z-10">
        <CursorEffect
          variant="glow"
          color={THEME.color}
          size={500}
          blur={100}
        />
      </div>
      <Navbar />
      <main className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center p-4 overflow-hidden animate-content-show">
        <div className="absolute inset-0 bg-grid-neutral-100 dark:bg-grid-neutral-900 -z-10" />
        <div className="absolute inset-0 backdrop-blur-[1px] -z-10" />
        <div className="relative z-10">
          <SignInComponent />
        </div>
      </main>
    </>
  );
}
