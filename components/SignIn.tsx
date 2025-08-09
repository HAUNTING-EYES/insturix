"use client";

import React from "react";
import * as Clerk from "@clerk/elements/common";
import * as SignIn from "@clerk/elements/sign-in";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icons } from "@/components/ui/icons";
import Link from "next/link";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

export default function SignInPage() {
  const { isSignedIn } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (isSignedIn) {
      router.replace("/dashboard");
    }
  }, [isSignedIn, router]);

  return (
    <div className="grid w-full grow items-center px-4 sm:justify-center">
      <SignIn.Root routing="hash">
        <Clerk.Loading>
          {(isGlobalLoading) => (
            <SignIn.Step name="start">
              <Card className="section-card glow-effect w-full sm:w-[32rem] backdrop-blur-sm bg-background/30 relative">
                <CardHeader className="relative z-10">
                  <CardTitle>Sign in to your account</CardTitle>
                  <CardDescription>
                    Welcome back! Please enter your details.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-y-6 px-6 relative z-10">
                  <div className="grid grid-cols-2 gap-x-4">
                    <Clerk.Connection
                      name="facebook"
                      asChild
                      className="relative z-10 w-full"
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        disabled={isGlobalLoading}
                        className="w-full card-hover hover:bg-blue-50/20 hover:border-blue-200/50 dark:hover:bg-blue-900/20 dark:hover:border-blue-700/50 transition-all duration-300 hover:scale-105"
                      >
                        <Clerk.Loading scope="provider:facebook">
                          {(isLoading) =>
                            isLoading ? (
                              <Icons.spinner className="size-4 animate-spin" />
                            ) : (
                              <>
                                <Icons.facebook className="mr-2 size-4" />
                                Facebook
                              </>
                            )
                          }
                        </Clerk.Loading>
                      </Button>
                    </Clerk.Connection>
                    <Clerk.Connection
                      name="google"
                      asChild
                      className="relative z-10 w-full"
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        disabled={isGlobalLoading}
                        className="w-full card-hover hover:bg-red-50/20 hover:border-red-200/50 dark:hover:bg-red-900/20 dark:hover:border-red-700/50 transition-all duration-300 hover:scale-105"
                      >
                        <Clerk.Loading scope="provider:google">
                          {(isLoading) =>
                            isLoading ? (
                              <Icons.spinner className="size-4 animate-spin" />
                            ) : (
                              <>
                                <Icons.google className="mr-2 size-4" />
                                Google
                              </>
                            )
                          }
                        </Clerk.Loading>
                      </Button>
                    </Clerk.Connection>
                  </div>
                  <p className="flex items-center gap-x-3 text-sm text-muted-foreground before:h-px before:flex-1 before:bg-gradient-to-r before:from-transparent before:via-border before:to-transparent after:h-px after:flex-1 after:bg-gradient-to-r after:from-transparent after:via-border after:to-transparent">
                    or
                  </p>
                  <Clerk.Field name="identifier" className="space-y-2">
                    <Clerk.Label asChild>
                      <Label>Email address</Label>
                    </Clerk.Label>
                    <Clerk.Input type="email" required asChild>
                      <Input className="bg-background/50 backdrop-blur-sm hover:bg-background/70 focus:bg-background/90 transition-all duration-300 border-2 border-input focus:border-blue-200 hover:border-blue-100 rounded-md shadow-sm" />
                    </Clerk.Input>
                    <Clerk.FieldError className="block text-sm text-destructive" />
                  </Clerk.Field>
                  <Clerk.Field name="password" className="space-y-2">
                    <Clerk.Label asChild>
                      <Label>Password</Label>
                    </Clerk.Label>
                    <Clerk.Input type="password" required asChild>
                      <Input className="bg-background/50 backdrop-blur-sm hover:bg-background/70 focus:bg-background/90 transition-all duration-300 border-2 border-input focus:border-blue-200 hover:border-blue-100 rounded-md shadow-sm" />
                    </Clerk.Input>
                    <Clerk.FieldError className="block text-sm text-destructive" />
                  </Clerk.Field>
                </CardContent>
                <CardFooter className="relative z-10">
                  <div className="grid w-full gap-y-4">
                    <SignIn.Action submit asChild>
                      <Button
                        disabled={isGlobalLoading}
                        className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white dark:text-white hover:scale-[1.02] transition-all duration-300 animate-content-show"
                      >
                        <Clerk.Loading>
                          {(isLoading) => {
                            return isLoading ? (
                              <Icons.spinner className="size-4 animate-spin" />
                            ) : (
                              "Continue"
                            );
                          }}
                        </Clerk.Loading>
                      </Button>
                    </SignIn.Action>
                    <Button
                      variant="link"
                      size="sm"
                      asChild
                      className="hover:text-blue-500 dark:hover:text-blue-400"
                    >
                      <Link href="/signup">
                        Don&apos;t have an account? Sign up
                      </Link>
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            </SignIn.Step>
          )}
        </Clerk.Loading>
      </SignIn.Root>
    </div>
  );
}
