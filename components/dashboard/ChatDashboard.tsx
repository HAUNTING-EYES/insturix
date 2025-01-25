"use client";

import { useState } from "react";
import { Sidebar } from "@/components/dashboard/sidebar/Sidebar";
import PermanentSidebar from "@/components/dashboard/sidebar/PermanentSidebar";
import KundLi from "./KundLi";
import Techie from "./Alyzitron";
import Editron from "./Editron";
import ThinkForge from "./ThinkForge";

export default function ChatDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState("Kund-Li");
  const ModelDashboard = () => {
    if (selectedModel === "Kund-Li") {
      return <KundLi />;
    } else if (selectedModel === "Techie-Tiwari") {
      return <Techie />;
    } else if (selectedModel === "ThinkForge") {
      return <ThinkForge />;
    } else {
      return <Editron />;
    }
  };

  return (
    <>
      <PermanentSidebar
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
      />
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
      />
      <div className="flex flex-col flex-1 lg:pl-[250px]">
        {ModelDashboard()}
      </div>
    </>
  );
}
