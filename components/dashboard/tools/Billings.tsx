"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface BillingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BillingDialog({ open, onOpenChange }: BillingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[90vw] h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Billing Information</DialogTitle>
        </DialogHeader>
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-4">Your Subscription</h2>
          <p className="mb-4">Current Plan: {}</p>
          <p className="mb-4">Next billing date: June 1, 2023</p>

          <h3 className="text-xl font-semibold mb-2">Payment Method</h3>
          <p className="mb-4">Visa ending in 1234</p>

          <h3 className="text-xl font-semibold mb-2">Billing History</h3>
          <table className="w-full mb-4">
            <thead>
              <tr>
                <th className="text-left">Date</th>
                <th className="text-left">Description</th>
                <th className="text-left">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>May 1, 2023</td>
                <td>Pro Plan Subscription</td>
                <td>$29.99</td>
              </tr>
              <tr>
                <td>Apr 1, 2023</td>
                <td>Pro Plan Subscription</td>
                <td>$29.99</td>
              </tr>
            </tbody>
          </table>

          <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
            Update Payment Method
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
