"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Plus, Settings, Trash, Edit2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ModelSelector } from "@/components/dashboard/tools/ModelSelector";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
}

interface Conversation {
  id: number;
  name: string;
}

export function Sidebar({
  open,
  onClose,
  selectedModel,
  setSelectedModel,
}: SidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleNewChat = () => {
    const newConversation = { id: Date.now(), name: "New Chat" };
    setConversations([newConversation, ...conversations]);
    setEditingId(newConversation.id);
    setEditingName(newConversation.name);
  };

  const handleEdit = (id: number, newName: string) => {
    if (newName.trim() !== "") {
      setConversations(
        conversations.map((conv) =>
          conv.id === id ? { ...conv, name: newName.trim() } : conv
        )
      );
    }
    setEditingId(null);
  };

  const startEditing = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditingName(conv.name);
  };

  useEffect(() => {
    if (editingId !== null && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingId]);

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="left" className="p-0 w-[250px]">
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
                      ref={inputRef}
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => handleEdit(conv.id, editingName)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleEdit(conv.id, editingName);
                        }
                      }}
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
                        onClick={() => startEditing(conv)}
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
            <Button
              variant="ghost"
              className="w-full justify-start text-gray-300 hover:text-white hover:bg-gray-800"
            >
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
