"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash, Edit2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ModelSelector } from "@/components/dashboard/ModelSelector";
import { UserSettingsDialog } from "@/components/dashboard/UserSettings";

interface PermanentSidebarProps {
  selectedModel: string;
  setSelectedModel: React.Dispatch<React.SetStateAction<string>>;
}

export default function PermanentSidebar({
  selectedModel,
  setSelectedModel,
}: PermanentSidebarProps) {
  const [conversations, setConversations] = useState([
    { id: 1, name: "Chat History 1" },
    { id: 2, name: "Chat History 2" },
    { id: 3, name: "Chat History 3" },
  ]);
  const [editingId, setEditingId] = useState<number | null>(null);

  const handleNewChat = () => {
    const newConversation = { id: Date.now(), name: "New Chat" };
    setConversations([newConversation, ...conversations]);
    setEditingId(newConversation.id);
  };

  interface Conversation {
    id: number;
    name: string;
  }

  const handleEdit = (id: number, newName: string) => {
    setConversations(
      conversations.map((conv: Conversation) =>
        conv.id === id ? { ...conv, name: newName } : conv
      )
    );
    setEditingId(null);
  };

  return (
    <div className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:w-[250px] lg:bg-gray-900 lg:border-r lg:border-gray-800">
      <div className="flex flex-col h-full">
        <div className="px-4 py-6 space-y-4">
          <Button
            className="w-full justify-start text-white bg-gray-800 hover:bg-gray-700"
            variant="outline"
            onClick={handleNewChat}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Chat
          </Button>
          <ModelSelector
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
          />
        </div>
        <ScrollArea className="flex-1 px-4">
          <div className="space-y-2">
            {conversations.map((conv) => (
              <div key={conv.id} className="flex items-center space-x-2">
                {editingId === conv.id ? (
                  <Input
                    value={conv.name}
                    onChange={(e) => handleEdit(conv.id, e.target.value)}
                    onBlur={() => setEditingId(null)}
                    onKeyPress={(e) =>
                      e.key === "Enter" &&
                      handleEdit(conv.id, (e.target as HTMLInputElement).value)
                    }
                    autoFocus
                  />
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      className="w-full justify-start text-gray-300 hover:text-white hover:bg-gray-800"
                    >
                      {conv.name}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditingId(conv.id)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
        <div className="border-t border-gray-800 p-4">
          <Button
            variant="ghost"
            className="w-full justify-start text-gray-300 hover:text-white hover:bg-gray-800"
          >
            <Trash className="mr-2 h-4 w-4" />
            Clear conversations
          </Button>
          <UserSettingsDialog />
        </div>
      </div>
    </div>
  );
}
