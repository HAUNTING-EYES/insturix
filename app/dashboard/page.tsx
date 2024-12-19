"use client";

import { useAuth } from "@clerk/nextjs";

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
      <h1>This is the Dashboard</h1>
    </>
  );
}
