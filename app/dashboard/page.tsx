"use client";

import NotSignedIn from "@/components/NotSignedup";
import { useAuth, UserButton } from "@clerk/nextjs";
import { SignOutButton } from "@clerk/nextjs";

export default function Dashboard() {
  const { isSignedIn } = useAuth();

  if (!isSignedIn) {
    return (
      <>
      <NotSignedIn />
      </>
    );
  }
  return (
    <>
    <UserButton />
      <h1>This is the Dashboard</h1>
      <SignOutButton />
    </>
  );
}
