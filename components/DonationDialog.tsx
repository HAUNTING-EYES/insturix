"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface DonationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onDonate: (amount: number) => void;
}

export default function DonationDialog({ isOpen, onClose, onDonate }: DonationDialogProps) {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    onDonate(parsedAmount);
    setAmount("");
    setError("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-white dark:bg-[rgb(var(--surface-1))] sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Enter Custom Amount</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">₹</div>
            <Input
              type="number"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError("");
              }}
              className="pl-7"
              placeholder="0.00"
              step="0.01"
              min="0"
            />
            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="text-sm text-red-500 mt-1"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
          <div className="flex justify-end space-x-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="px-4"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="px-4 bg-zinc-900 hover:bg-zinc-800 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              Donate
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
