import { ReactNode } from "react";
import type { Toast as ToastBase } from "@/hooks/use-toast";

declare module "@/hooks/use-toast" {
  interface Toast extends ToastBase {
    icon?: ReactNode;
  }
}