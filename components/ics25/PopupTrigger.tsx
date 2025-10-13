"use client";

import { useEffect, useState } from "react";
import ICS25Popup from "@/components/ICS25Popup";
import ICS25GamingPopup from "@/components/ics25/GamingPopup";

type PopupContext = "home" | "ics25" | "register";

export default function PopupTrigger({ context }: { context: PopupContext }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const hasShownHome = sessionStorage.getItem("ics25_popup_home") === "1";
      const shouldShow =
        context === "home" ? true : context === "ics25" ? !hasShownHome : context === "register" ? true : false;
      if (!shouldShow) return;
      const t = setTimeout(() => setOpen(true), 200);
      return () => clearTimeout(t);
    } catch {
      // Fallback: always show
      const t = setTimeout(() => setOpen(true), 200);
      return () => clearTimeout(t);
    }
  }, [context]);

  const handleClose = () => {
    try {
      if (context === "home") sessionStorage.setItem("ics25_popup_home", "1");
    } catch {}
    setOpen(false);
  };

  if (context === "register") {
    return <ICS25GamingPopup isOpen={open} onClose={handleClose} />;
  }
  return <ICS25Popup isOpen={open} onClose={handleClose} />;
}
