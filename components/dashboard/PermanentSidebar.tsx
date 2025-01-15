"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Plus,
  Search,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  Edit2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { ModelSelector } from "@/components/dashboard/ModelSelector";
import { UserSettings } from "@/components/dashboard/UserSettings";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Conversation {
  id: number;
  name: string;
  lastMessage?: string;
  timestamp?: number;
}

interface PermanentSidebarProps {
  selectedModel: string;
  setSelectedModel: React.Dispatch<React.SetStateAction<string>>;
  onSelectConversation?: (id: number) => void;
  className?: string;
}

export default function PermanentSidebar({
  selectedModel,
  setSelectedModel,
  onSelectConversation,
  className,
}: PermanentSidebarProps) {
  const [conversations, setConversations] = React.useState<Conversation[]>([
    {
      id: 1,
      name: "Chat History 1",
      lastMessage: "Last message 1",
      timestamp: Date.now(),
    },
    {
      id: 2,
      name: "Chat History 2",
      lastMessage: "Last message 2",
      timestamp: Date.now() - 1000,
    },
    {
      id: 3,
      name: "Chat History 3",
      lastMessage: "Last message 3",
      timestamp: Date.now() - 2000,
    },
  ]);
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  React.useEffect(() => {
    const storedConversations = localStorage.getItem("conversations");
    if (storedConversations) {
      setConversations(JSON.parse(storedConversations));
    }
  }, []);

  React.useEffect(() => {
    localStorage.setItem("conversations", JSON.stringify(conversations));
  }, [conversations]);

  const handleNewChat = () => {
    const newConversation: Conversation = {
      id: Date.now(),
      name: "New Chat",
      lastMessage: "Click to start chatting",
      timestamp: Date.now(),
    };
    setConversations([newConversation, ...conversations]);
    setEditingId(newConversation.id);
    onSelectConversation?.(newConversation.id);
  };

  const handleEdit = (id: number, newName: string) => {
    setConversations(
      conversations.map((conv) =>
        conv.id === id ? { ...conv, name: newName } : conv
      )
    );
    setEditingId(null);
  };

  const handleDelete = (id: number) => {
    setConversations(conversations.filter((conv) => conv.id !== id));
  };

  const filteredConversations = conversations.filter((conv) =>
    conv.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <TooltipProvider>
      <motion.div
        className={cn(
          "flex flex-col h-screen bg-gray-900 border-r border-gray-800 transition-all duration-300 ease-in-out",
          isCollapsed ? "w-16" : "w-64",
          className
        )}
        animate={{ width: isCollapsed ? 64 : 256 }}
      >
        <div className="flex items-center justify-between p-4">
          <AnimatePresence initial={false}>
            {!isCollapsed && (
              <motion.h2
                className="text-xl font-bold text-white"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                Chats
              </motion.h2>
            )}
          </AnimatePresence>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsCollapsed(!isCollapsed)}
                aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {isCollapsed ? <ChevronDown /> : <ChevronUp />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex-1 overflow-hidden">
          <div className="p-4 space-y-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="w-full justify-start text-white bg-gray-800 hover:bg-gray-700"
                  variant="outline"
                  onClick={handleNewChat}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {!isCollapsed && "New Chat"}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Start a new chat</TooltipContent>
            </Tooltip>
            <AnimatePresence initial={false}>
              {!isCollapsed && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <ModelSelector
                    selectedModel={selectedModel}
                    setSelectedModel={setSelectedModel}
                  />
                  <div className="relative mt-4">
                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-500" />
                    <Input
                      className="pl-8 bg-gray-800 text-white border-gray-700"
                      placeholder="Search conversations..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <ScrollArea className="flex-1 px-4">
            <AnimatePresence initial={false}>
              {filteredConversations.map((conv) => (
                <motion.div
                  key={conv.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.2 }}
                  className="mb-2"
                >
                  <div className="flex items-center space-x-2 group">
                    {editingId === conv.id ? (
                      <Input
                        value={conv.name}
                        onChange={(e) => handleEdit(conv.id, e.target.value)}
                        onBlur={() => setEditingId(null)}
                        onKeyPress={(e) =>
                          e.key === "Enter" &&
                          handleEdit(
                            conv.id,
                            (e.target as HTMLInputElement).value
                          )
                        }
                        autoFocus
                        className="bg-gray-800 text-white border-gray-700"
                      />
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          className={cn(
                            "w-full justify-start text-gray-300 hover:text-white hover:bg-gray-800",
                            isCollapsed && "px-2"
                          )}
                          onClick={() => onSelectConversation?.(conv.id)}
                        >
                          <div
                            className={cn(
                              "flex flex-col items-start overflow-hidden",
                              isCollapsed && "items-center"
                            )}
                          >
                            <span className="font-medium truncate w-full">
                              {isCollapsed
                                ? conv.name.charAt(0).toUpperCase()
                                : conv.name}
                            </span>
                            {!isCollapsed && conv.lastMessage && (
                              <span className="text-xs text-gray-500 truncate w-full">
                                {conv.lastMessage}
                              </span>
                            )}
                          </div>
                        </Button>
                        {!isCollapsed && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem
                                onSelect={() => setEditingId(conv.id)}
                              >
                                <Edit2 className="mr-2 h-4 w-4" />
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() => handleDelete(conv.id)}
                                className="text-red-600 focus:text-red-600"
                              >
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </ScrollArea>
        </div>
        <div className="border-t border-gray-800 p-4">
          <UserSettings />
        </div>
      </motion.div>
    </TooltipProvider>
  );
}
