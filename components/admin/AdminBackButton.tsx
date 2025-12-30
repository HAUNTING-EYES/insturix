"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AdminBackButtonProps {
  href?: string;
  label?: string;
}

export default function AdminBackButton({
  href = "/admin/dashboard",
  label = "Back to dashboard",
}: AdminBackButtonProps) {
  const router = useRouter();

  const handleClick = useCallback(() => {
    if (href) {
      router.push(href);
      return;
    }

    router.back();
  }, [href, router]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleClick}
      className="group w-fit px-0 text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
    >
      <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
      {label}
    </Button>
  );
}
