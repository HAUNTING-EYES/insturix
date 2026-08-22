"use client";

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Image, ArrowRight, Loader2, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { SPREAD } from "@/lib/animation/presets";

// OLD: local fadeIn (y:20, 0.4s, 'easeOut')
// NEW: shared SPREAD.fadeUp (y:20, 0.5s, expo.out — brand easing)
const fadeIn = SPREAD.fadeUp;

const staggerChildren = {
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
};

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

interface HistoryItem {
    sessionId: string;
    title: string;
    updatedAt: string;
    variationsCount: number;
    createdByName?: string;
}

interface ClickatronHistoryProps {
    onSessionDeleted?: () => void;
}

export function ClickatronHistory({ onSessionDeleted }: ClickatronHistoryProps) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>("");
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const router = useRouter();
  const pageSize = 10;



  const fetchHistory = async (page: number) => {
    try {
      setIsLoading(true);
      const offset = (page - 1) * pageSize;
      const response = await fetch(`/api/services/clickatron/history?limit=${pageSize}&offset=${offset}`);
      if (!response.ok) {
        throw new Error('Failed to fetch history');
      }
      const data = await response.json();
      setHistory(data.history);
      setTotal(data.total);
      setTotalPages(Math.ceil(data.total / pageSize));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRename = (sessionId: string, currentTitle: string) => {
    setEditingSessionId(sessionId);
    setEditingTitle(currentTitle);
  };

  const saveRename = async (sessionId: string) => {
    if (!editingTitle.trim()) return;
    
    try {
      const response = await fetch(`/api/services/clickatron/session/${sessionId}/rename`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: editingTitle.trim() }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to rename session');
      }
      
      const data = await response.json();
      
      // Update the history list with the new title
      setHistory(prev => prev.map(item =>
        item.sessionId === sessionId
          ? { ...item, title: data.session.title }
          : item
      ));
      
      setEditingSessionId(null);
      setEditingTitle("");
    } catch (err) {
      console.error('Error renaming session:', err);
      setError(err instanceof Error ? err.message : 'Failed to rename session');
    }
  };

  const handleDeleteClick = (sessionId: string) => {
    setDeletingSessionId(sessionId);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingSessionId) return;
    
    try {
      const response = await fetch(`/api/services/clickatron/session/${deletingSessionId}/delete`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete session');
      }
      
      // Remove the deleted session from the history list
      setHistory(prev => prev.filter(item => item.sessionId !== deletingSessionId));
      setTotal(prev => prev - 1);
      
      // If we're on the last page and it's now empty, go to the previous page
      if (history.length === 1 && currentPage > 1) {
        setCurrentPage(prev => prev - 1);
      } else {
        // Refresh the current page
        fetchHistory(currentPage);
      }
      
      // Notify parent component if needed
      if (onSessionDeleted) {
        onSessionDeleted();
      }
    } catch (err) {
      console.error('Error deleting session:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete session');
    } finally {
      setIsDeleteDialogOpen(false);
      setDeletingSessionId(null);
    }
  };

  useEffect(() => {
    fetchHistory(currentPage);
  }, [currentPage]);

  if (isLoading) {
    return (
      <motion.div {...fadeIn} className="text-center py-12">
        <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin text-[#D4A652]" />
        <p className="text-[#7A776E]">Loading your thumbnail history...</p>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div {...fadeIn} className="text-center py-12">
        <div className="text-[#7A776E] mb-4">
          <Image className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Failed to load history. Please try again.</p>
        </div>
      </motion.div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <motion.div {...fadeIn} className="text-center py-12">
        <div className="text-[#7A776E] mb-4">
          <Image className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Your thumbnail sessions will appear here</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div {...fadeIn} className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-[18px] font-semibold text-[#ECE9E1] flex items-center gap-2">
          <Clock className="h-5 w-5 text-[#7A776E]" />
          Past Sessions
        </h2>
        {history && history.length > 0 && (
          <span className="text-[11px] text-[#7A776E]">Showing {history.length} of {total} sessions</span>
        )}
      </div>

      <motion.div
        variants={staggerChildren}
        initial="initial"
        animate="animate"
        className="grid gap-4 grid-cols-1"
      >
        {history.map((item) => (
          <motion.div key={item.sessionId} variants={fadeIn}>
            <Card className="group bg-[#131312]/40 border-[#1C1B19]/60 hover:border-[#D4A652]/50 hover:bg-[#131312]/60 transition-all duration-300 cursor-pointer h-full flex flex-col relative overflow-hidden" onClick={() => router.push(`/dashboard/clickatron/lab/${item.sessionId}`)}>
              <div className="absolute inset-0 bg-gradient-to-br from-[#D4A652]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <CardContent className="p-4 flex flex-col flex-1 justify-between relative z-10">
                <div className="space-y-2">
                  {editingSessionId === item.sessionId ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            saveRename(item.sessionId);
                          } else if (e.key === 'Escape') {
                            setEditingSessionId(null);
                            setEditingTitle("");
                          }
                        }}
                        className="flex-1 h-8 text-sm"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => saveRename(item.sessionId)}
                        className="h-8 px-2"
                      >
                        Save
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between">
                      <h3 className="font-semibold text-[#ECE9E1] text-sm line-clamp-2 group-hover:text-white transition-colors flex-1">
                        {item.title}
                      </h3>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 hover:bg-[#282724]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4 text-[#7A776E]" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-[#1B1A18] border-[#282724]">
                          <DropdownMenuItem
                            className="text-[#ECE9E1] hover:bg-[#282724] cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRename(item.sessionId, item.title);
                            }}
                          >
                            <Pencil className="h-4 w-4 mr-2" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-[#D46A5C] hover:bg-[#D46A5C]/10 cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClick(item.sessionId);
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[11px] text-[#7A776E]">
                    <div className="flex items-center gap-1.5">
                      <div className="p-0.5 bg-[#D4A652]/10 rounded-full">
                        <Image className="h-3 w-3 text-[#D4A652]" />
                      </div>
                      <span>{item.variationsCount} variations</span>
                    </div>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="p-0.5 bg-[#282724]/50 rounded-full">
                        <Clock className="h-3 w-3 text-[#7A776E]" />
                      </div>
                      <span>{formatTimeAgo(item.updatedAt)}</span>
                    </div>
                    {item.createdByName && (
                      <div className="flex items-center gap-1.5 ml-auto truncate pl-2 border-l border-[#1C1B19]">
                        <span className="text-[10px] text-[#7A776E] font-medium">by</span>
                        <span className="text-[10px] text-[#7A776E] font-semibold truncate hover:text-[#D4A652] transition-colors">
                          {item.createdByName}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center space-x-2 mt-8">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="h-8 w-8 p-0"
          >
            <ArrowRight className="h-4 w-4 rotate-180" />
          </Button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
            <Button
              key={page}
              variant={currentPage === page ? "default" : "outline"}
              size="sm"
              onClick={() => setCurrentPage(page)}
              className="h-8 w-8"
            >
              {page}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="h-8 w-8 p-0"
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="bg-[#131312] border-[#1C1B19]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#ECE9E1]">Delete Session</AlertDialogTitle>
            <AlertDialogDescription className="text-[#7A776E]">
              Are you sure you want to delete this session? This action is permanent and you will lose this project and all {history.find(item => item.sessionId === deletingSessionId)?.variationsCount || 0} variations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[#1B1A18] border-[#282724] text-[#B5B2A8] hover:bg-[#282724] hover:text-[#ECE9E1]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-[#D46A5C] hover:bg-[#D46A5C]/90 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}