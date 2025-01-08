"use client";

import { useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { ChatArea } from "@/components/dashboard/ChatArea";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { PermanentSidebar } from "@/components/dashboard/PermanentSidebar";
import { ModelSelector } from "@/components/dashboard/ModelSelector";
import { ThemeToggle } from "./ThemeToggle";

export function ChatDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState("gpt-3.5-turbo");

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
        <header className="flex items-center justify-between h-16 px-4 border-b bg-background sm:px-6 lg:px-8">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className="mr-4 lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-6 w-6" />
              <span className="sr-only">Open sidebar</span>
            </Button>
            <h1 className="text-2xl font-bold">ChatGPT Clone</h1>
          </div>
          <div className="flex items-center space-x-4">
            <ModelSelector
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
            />
             <ThemeToggle />
          </div>
        </header>
        <ChatArea selectedModel={selectedModel} />
      </div>
    </>
  );
}
