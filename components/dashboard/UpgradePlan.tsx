"use client";

import { useState } from "react";
import { ArrowUpCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function UpgradeButton() {
  const [isOpen, setIsOpen] = useState(false);

  const handleUpgrade = () => {
    // Here you would typically implement the actual upgrade logic
    console.log("Upgrading plan...");
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Upgrade Plan</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Upgrade to Pro Plan</DialogTitle>
          <DialogDescription>
            Unlock premium features and take your experience to the next level.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="flex items-center gap-4">
            <Check className="h-5 w-5 text-green-500" />
            <span>Unlimited projects</span>
          </div>
          <div className="flex items-center gap-4">
            <Check className="h-5 w-5 text-green-500" />
            <span>Priority support</span>
          </div>
          <div className="flex items-center gap-4">
            <Check className="h-5 w-5 text-green-500" />
            <span>Advanced analytics</span>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleUpgrade} className="w-full">
            <ArrowUpCircle className="mr-2 h-4 w-4" />
            Upgrade Now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
