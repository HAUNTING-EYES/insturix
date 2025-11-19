"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Switch } from "@/components/ui/switch";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center space-x-2">
      <Switch
        checked={theme === "dark"}
        onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
        className="
          data-[state=checked]:bg-zinc-800 
          data-[state=unchecked]:bg-zinc-200
          dark:data-[state=unchecked]:bg-zinc-700"
      />
      <div className="flex items-center">
        {theme === "dark" ? (
          <Moon className="h-[0.9rem] w-[0.9rem] text-zinc-100" />
        ) : (
          <Sun className="h-[0.9rem] w-[0.9rem] text-zinc-900" />
        )}
      </div>
    </div>
  );
}
