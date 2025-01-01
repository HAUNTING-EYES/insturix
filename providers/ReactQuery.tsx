"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/QueryClient";
import { ReactNode } from "react";

export default function ReactQueryProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
