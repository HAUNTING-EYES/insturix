import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFormik } from "formik";
import * as Yup from "yup";
import { Label } from "@/components/ui/label";

interface DonationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (amount: number) => void;
}

const validationSchema = Yup.object({
  amount: Yup.number()
    .min(100, "Amount must be at least 100")
    .required("Amount is required"),
});

export function DonationDialog({
  isOpen,
  onClose,
  onSubmit,
}: DonationDialogProps) {
  const formik = useFormik({
    initialValues: {
      amount: "",
    },
    validationSchema,
    onSubmit: (values) => {
      onSubmit(Number(values.amount));
      onClose();
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Make a Donation</DialogTitle>
        </DialogHeader>
        <form onSubmit={formik.handleSubmit}>
          <div className="space-y-4">
            <div>
              <Label htmlFor="amount">Donation Amount</Label>
              <Input
                id="amount"
                type="number"
                placeholder="Enter amount (min 100)"
                {...formik.getFieldProps("amount")}
              />
              {formik.touched.amount && formik.errors.amount && (
                <div className="text-red-500 text-sm mt-1">
                  {formik.errors.amount}
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Donate</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
