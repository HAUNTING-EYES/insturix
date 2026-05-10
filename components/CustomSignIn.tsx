"use client";

import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Icons } from "@/components/ui/icons";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSignIn } from "@clerk/nextjs";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CustomSignIn() {
  const { signIn, isLoaded, setActive } = useSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const router = useRouter();

  // Handle sign-in form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;

    setIsLoading(true);
    setError("");

    try {
      const result = await signIn.create({
        identifier: email,
        password,
      });

      if (result.status === "complete") {
        // Set the active session and redirect
        await setActive({ session: result.createdSessionId });
        router.push("/dashboard");
      } else {
        setError("Sign-in failed. Please try again.");
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || "Something went wrong.");
      } else {
        setError("Something went wrong.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Handle forgot password flow
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;

    setIsLoading(true);
    setError("");

    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email,
      });

      setError("Check your email for reset instructions.");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || "Something went wrong.");
      } else {
        setError("Something went wrong.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex justify-center relative">
      <div className="w-full px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-3xl mx-auto"
        >
          <Card className="p-8">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-semibold mb-2">Welcome back</h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {showForgotPassword
                  ? "Reset your password"
                  : "Sign in to your account to continue"}
              </p>
            </div>

            {!showForgotPassword && (
              <>
                <div className="flex justify-center gap-4 mb-8">
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() =>
                      signIn?.authenticateWithPopup({
                        strategy: "oauth_facebook",
                        redirectUrl: "/dashboard",
                        redirectUrlComplete: "/dashboard",
                        popup: window.open("", "_blank", "width=500,height=600")
                      })
                    }
                    disabled={!isLoaded || isLoading}
                    className="w-40"
                  >
                    {isLoading ? (
                      <Icons.spinner className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Icons.facebook className="h-4 w-4 mr-2" />
                        Facebook
                      </>
                    )}
                  </Button>

                  <Button
                    variant="outline"
                    type="button"
                    onClick={() =>
                      signIn?.authenticateWithPopup({
                        strategy: "oauth_google",
                        redirectUrl: "/dashboard",
                        redirectUrlComplete: "/dashboard",
                        popup: window.open("", "_blank", "width=500,height=600")
                      })
                    }
                    disabled={!isLoaded || isLoading}
                    className="w-40"
                  >
                    {isLoading ? (
                      <Icons.spinner className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Icons.google className="h-4 w-4 mr-2" />
                        Google
                      </>
                    )}
                  </Button>
                </div>

                <div className="relative my-8">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-[11px] uppercase">
                    <span className="bg-white dark:bg-[rgb(var(--surface-0))] px-4 relative text-muted-foreground">
                      Or
                    </span>
                  </div>
                </div>
              </>
            )}

            <form
              onSubmit={
                showForgotPassword ? handleForgotPassword : handleSubmit
              }
              className="max-w-sm mx-auto space-y-6"
            >
              <div className="space-y-4">
                <div>
                  <label htmlFor="email" className="text-sm font-medium">
                    Email address
                  </label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    className="mt-2"
                    required
                    autoComplete="email"
                  />
                </div>

                {!showForgotPassword && (
                  <div>
                    <label htmlFor="password" className="text-sm font-medium">
                      Password
                    </label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="mt-2"
                      required
                      autoComplete="current-password"
                    />
                  </div>
                )}
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="link"
                  className="text-sm text-blue-500 hover:text-blue-600 p-0"
                  onClick={() => {
                    setShowForgotPassword(!showForgotPassword);
                    setError("");
                  }}
                >
                  {showForgotPassword ? "Back to sign in" : "Forgot password?"}
                </Button>
              </div>

              <Button
                className="w-full"
                type="submit"
                disabled={!isLoaded || isLoading}
              >
                {isLoading ? (
                  <Icons.spinner className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    {showForgotPassword ? "Send reset link" : "Sign in"}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </form>

            <div className="text-center mt-8">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Don&apos;t have an account?{" "}
                <Link href="/signup" className="text-blue-500 hover:underline">
                  Sign up
                </Link>
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-2">
                Secured by <span className="font-semibold">clerk</span>{" "}
                <span className="text-amber-500">Development mode</span>
              </p>
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Decorative gradient orbs */}
      <div className="fixed top-1/4 -left-48 w-96 h-96 bg-amber-500/10 dark:bg-amber-500/5 rounded-full blur-3xl" />
      <div className="fixed bottom-1/4 -right-48 w-96 h-96 bg-purple-500/10 dark:bg-purple-500/5 rounded-full blur-3xl" />
    </div>
  );
}

