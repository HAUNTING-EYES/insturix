"use client";

import { useState } from "react";
import { useUser, useClerk } from "@clerk/nextjs";
import { UserProfile } from "@clerk/nextjs";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Settings, LogOut, ReceiptText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BillingDialog } from "./BillingDialog";
import { UpgradeButton } from "./UpgradePlan";

export function UserSettings() {
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [isBillingDialogOpen, setIsBillingDialogOpen] = useState(false);
  const { user } = useUser();
  const firstLetter = user?.firstName ? user.firstName.charAt(0) : "";
  const { signOut } = useClerk();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-start text-gray-300 hover:text-white hover:bg-gray-800 transition-colors duration-200"
          >
            <Image
              className="mr-2 h-6 w-6 rounded-full"
              src={user?.imageUrl as string}
              alt={firstLetter}
              width={80}
              height={80}
            />
            {user?.fullName}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">
                {user?.fullName}
              </p>
              <p className="text-xs leading-none text-muted-foreground">
                {user?.primaryEmailAddress?.emailAddress}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setIsSettingsDialogOpen(true)}
            className="cursor-pointer"
          >
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setIsBillingDialogOpen(true)}
            className="cursor-pointer"
          >
            <ReceiptText className="mr-2 h-4 w-4" />
            <span>Billing</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <UpgradeButton />
          <DropdownMenuItem
            className="cursor-pointer text-red-600 focus:text-red-600"
            onClick={() => {
              signOut({ redirectUrl: "/" });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={isSettingsDialogOpen}
        onOpenChange={setIsSettingsDialogOpen}
      >
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

      <BillingDialog
        open={isBillingDialogOpen}
        onOpenChange={setIsBillingDialogOpen}
      />
    </>
  );
}
