"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function UpgradeButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Upgrade Plan</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl w-[90vw] h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Upgrade to Get More Out of Our Services</DialogTitle>
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
      </DialogContent>
    </Dialog>
  );
}
