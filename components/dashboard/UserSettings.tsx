"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import { UserProfile } from "@clerk/nextjs";
// import { useMediaQuery } from "@/hooks/useMediaQuery";

export function UserSettingsDialog() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-start text-gray-300 hover:text-white hover:bg-gray-800"
          >
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-5xl w-[100vw] h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>User Settings</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center w-full h-full">
            <UserProfile
              appearance={{
                elements: {
                  rootBox: "w-full h-full",
                  card: "w-full h-full",
                },
              }}
              routing="hash"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
