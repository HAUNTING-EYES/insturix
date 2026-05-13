"use client";
import React from "react";
import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Icons } from "@/components/ui/icons";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSignUp } from "@clerk/nextjs";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CustomSignup() {
  const { signUp, isLoaded, setActive } = useSignUp();
  const router = useRouter();

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // Verification state
  const [verifying, setVerifying] = useState<"email" | null>(null);
  const [code, setCode] = useState("");
  const [countdown, setCountdown] = useState(30);
  const [isResendDisabled, setIsResendDisabled] = useState(true);

  // Handle countdown for resend OTP
  React.useEffect(() => {
    let timer: NodeJS.Timeout;
    if (verifying && countdown > 0) {
      timer = setTimeout(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    } else if (countdown === 0) {
      setIsResendDisabled(false);
    }
    return () => clearTimeout(timer);
  }, [verifying, countdown]);

  // Handle sign-up form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;

    setIsLoading(true);
    setError("");

    try {
      // Start the sign-up process
      const result = await signUp.create({
        emailAddress: email,
        password,
        username
      });

      // If email verification is required, move to email OTP step
      if (
        result.status === "missing_requirements" &&
        result.requiredFields?.includes("email_address")
      ) {
        await signUp.prepareEmailAddressVerification({
          strategy: "email_code",
        });
        setVerifying("email");
      } else {
        setError("Unexpected response from server.");
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

  // Handle OTP verification (email)
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp) return;

    setIsLoading(true);
    setError("");

    try {
      if (verifying === "email") {
        // Verify email OTP
        const result = await signUp.attemptEmailAddressVerification({ code });
        if (result.status === "complete") {
          // If sign-up is complete, set the session and redirect
          await setActive({ session: result.createdSessionId });
          router.push("/dashboard");
        } else {
          setError("Unexpected response from server.");
        }
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

  // Handle resend OTP
  const handleResendCode = async () => {
    if (!isLoaded || !signUp) return;

    setIsLoading(true);
    setError("");

    try {
      if (verifying === "email") {
        await signUp.prepareEmailAddressVerification({
          strategy: "email_code",
        });
      }
      setCountdown(30);
      setIsResendDisabled(true);
      setError("New OTP sent! Please check your email.");
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

  // OAuth signup handlers
  const handleOAuth = async (provider: "google" | "facebook") => {
    if (!isLoaded || !signUp) return;
    setIsLoading(true);
    setError("");
    try {
      const popup = window.open("", "_blank", "width=500,height=600");
      await signUp.authenticateWithPopup({
        strategy: provider === "google" ? "oauth_google" : "oauth_facebook",
        redirectUrl: "/dashboard",
        redirectUrlComplete: "/dashboard",
        popup
      });
    } catch {
      setError("OAuth signup failed.");
    } finally {
      setIsLoading(false);
    }
  };

  // Render the appropriate form based on the current step
  if (verifying) {
    return (
      <div className="min-h-screen flex justify-center">
        <div className="w-full max-w-3xl px-4">
          <Card className="p-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-semibold mb-2">
                Verify your email
              </h2>
              <div className="flex items-center justify-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <span>{email}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-0 h-auto"
                  onClick={() => {
                    setPassword(""); // Clear password for security
                    setVerifying(null);
                  }}
                >
                </Button>
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2">
                Enter the verification code sent to your email.
              </p>
            </div>

            <form
              onSubmit={handleVerify}
              className="max-w-sm mx-auto space-y-6"
            >
              <div>
                <label htmlFor="code" className="text-sm font-medium">
                  Verification Code
                </label>
                <Input
                  id="code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Enter verification code"
                  className="mt-2"
                  required
                />
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <div className="space-y-4">
                <Button
                  className="w-full"
                  type="submit"
                  disabled={!isLoaded || isLoading}
                >
                  {isLoading ? (
                    <Icons.spinner className="h-4 w-4 animate-spin" />
                  ) : (
                    `Verify Email`
                  )}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={handleResendCode}
                  disabled={isResendDisabled || isLoading}
                >
                  {isLoading ? (
                    <Icons.spinner className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Didn&apos;t receive the code? Resend
                      {isResendDisabled && ` (${countdown})`}
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    );
  }

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
              <h1 className="text-2xl font-semibold mb-2">
                Create your account
              </h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Welcome! Please fill in the details to get started.
              </p>
            </div>

            {/* OAuth Buttons */}
            <div className="flex justify-center gap-4 mb-8">
              <Button
                variant="outline"
                type="button"
                onClick={() => handleOAuth("facebook")}
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
                onClick={() => handleOAuth("google")}
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

            <form
              onSubmit={handleSubmit}
              className="max-w-sm mx-auto space-y-6"
            >
              <div className="space-y-4">
                <div>
                  <label htmlFor="username" className="text-sm font-medium">
                    Username
                  </label>
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    className="mt-2"
                    required
                    autoComplete="username"
                  />
                </div>
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
                    autoComplete="new-password"
                  />
                </div>
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              {/* Add the CAPTCHA element */}
              <div id="clerk-captcha" className="mt-2" />

              <Button
                className="w-full"
                type="submit"
                disabled={!isLoaded || isLoading}
              >
                {isLoading ? (
                  <Icons.spinner className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Continue <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </form>

            <div className="text-center mt-8">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Already have an account?{" "}
                <Link href="/signin" className="text-blue-500 hover:underline">
                  Sign in
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
