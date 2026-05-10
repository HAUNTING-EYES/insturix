"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export default function NotSignedIn() {
  const router = useRouter();

  const handleSignUp = () => {
    router.push("/signup");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md mx-auto text-center"
      >
        <h1 className="text-[32px] font-semibold mb-4 tracking-tight">
          You need to sign up
        </h1>
        <p className="text-muted-foreground mb-8">
          Please create an account to access this page.
        </p>
        <Button onClick={handleSignUp} className="w-full max-w-xs mx-auto">
          Sign Up
        </Button>
      </motion.div>
    </div>
  );
}
