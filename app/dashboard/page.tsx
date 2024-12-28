"use client";

import { useAuth, UserButton } from "@clerk/nextjs";
import { SignOutButton } from "@clerk/nextjs";

export default function Dashboard() {
  const { isSignedIn } = useAuth();

  if (!isSignedIn) {
    return (
      <h1>
        Not signed in <br />
      </h1>
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
