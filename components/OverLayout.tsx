import React, { ReactNode } from "react";
import Background from "./Background";

interface OverlayLayoutProps {
  children: ReactNode;
}

const OverlayLayout: React.FC<OverlayLayoutProps> = ({ children }) => {
  return (
    <div className="relative w-full h-full min-h-screen overflow-hidden">
      <div className="absolute inset-0 z-0">
        <Background />
      </div>
      <div className="relative z-10 w-full h-full">{children}</div>
    </div>
  );
};

export default OverlayLayout;
