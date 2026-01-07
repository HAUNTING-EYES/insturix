'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription 
} from '@/components/ui/card';
import { 
  BarChart3, 
  MessageSquare, 
  User, 
  Mail, 
  Calendar, 
  ChevronDown, 
  ChevronUp,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Search
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

interface ContactMessage {
  _id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: string;
  read?: boolean;
}

interface SeriesPoint {
  _id: string; // date string
  count?: number;
  totalAmount?: number;
}

interface UsersMetricsResponse {
  ok: boolean;
  start: string;
  total: number;
  series: SeriesPoint[];
}

interface RevenueMetricsResponse {
  ok: boolean;
  start: string;
  totalAmount: number;
  count: number;
  series: SeriesPoint[];
}

interface PaginationData {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function AnalyticsTab() {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<PaginationData | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [usersSeries, setUsersSeries] = useState<SeriesPoint[]>([]);
  const [usersTotal, setUsersTotal] = useState<number>(0);
  const [revenueSeries, setRevenueSeries] = useState<SeriesPoint[]>([]);
  const [revenueTotal, setRevenueTotal] = useState<number>(0);
  const [metricsLoading, setMetricsLoading] = useState<boolean>(true);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ContactMessage | null>(null);
  const [replySubject, setReplySubject] = useState('');
  const [replyMessage, setReplyMessage] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchMessages = useCallback(async (page: number) => {
    try {
      setLoading(true);
      const readFilter = filter === 'unread' ? '&read=false' : '';
      const response = await fetch(`/api/admin/contacts?page=${page}&limit=10${readFilter}`);
      const data = await response.json();
      if (data.ok) {
        setMessages(data.contacts);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error('Failed to fetch contact messages:', error);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchMessages(currentPage);
  }, [currentPage, fetchMessages]);

  // Fetch metrics once
  useEffect(() => {
    (async () => {
      try {
        setMetricsLoading(true);
        const [usersRes, revRes] = await Promise.all([
          fetch('/api/admin/metrics/users'),
          fetch('/api/admin/metrics/revenue'),
        ]);
        const usersJson: UsersMetricsResponse = await usersRes.json();
        const revJson: RevenueMetricsResponse = await revRes.json();
        if (usersJson.ok) {
          setUsersSeries(usersJson.series || []);
          setUsersTotal(usersJson.total || 0);
        }
        if (revJson.ok) {
          setRevenueSeries(revJson.series || []);
          setRevenueTotal(revJson.totalAmount || 0);
        }
      } catch (e) {
        console.error('Failed loading metrics', e);
      } finally {
        setMetricsLoading(false);
      }
    })();
  }, []);

  // Fetch unread count separately (for quick stat)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/contacts?page=1&limit=1&read=false');
        const json = await res.json();
        if (json?.pagination?.total != null) setUnreadCount(json.pagination.total);
      } catch {}
    })();
  }, [filter]);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const openReply = (msg: ContactMessage) => {
    setReplyTarget(msg);
    setReplySubject(`Re: ${msg.subject}`);
    setReplyMessage(`Hi ${msg.name},\n\n`);
    setReplyError(null);
    setReplyOpen(true);
  };

  const sendReply = async () => {
    if (!replyTarget) return;
    if (!replySubject.trim() || !replyMessage.trim()) {
      setReplyError('Subject and message are required.');
      return;
    }
    try {
      setReplySending(true);
      setReplyError(null);
      const res = await fetch('/api/admin/mailing/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: replySubject,
          message: replyMessage,
          testMode: true, // use single-recipient path
          testEmail: replyTarget.email,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.message || 'Failed to send');
      }
      // optimistically mark as read
      setMessages((prev) => prev.map((m) => m._id === replyTarget._id ? { ...m, read: true } : m));
      setUnreadCount((c) => Math.max(0, c - 1));
      setReplyOpen(false);
      toast({
        title: "Email sent successfully",
        description: `Reply sent to ${replyTarget.email}`,
        variant: "default",
      });
    } catch (e: any) {
      setReplyError(e?.message || 'Failed to send');
      toast({
        title: "Failed to send email",
        description: e?.message || 'An error occurred while sending the reply',
        variant: "destructive",
      });
    } finally {
      setReplySending(false);
    }
  };

  return (
    <>
    <div className="space-y-8">
      {/* Quick Stats Header */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-white/50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Total Inquiries</p>
                <h3 className="text-2xl font-bold">{pagination?.total || 0}</h3>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-lg bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Unread</p>
                <h3 className="text-2xl font-bold">{unreadCount}</h3>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <User className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">New Users (30d)</p>
                <h3 className="text-2xl font-bold">{usersTotal}</h3>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Revenue (30d)</p>
                <h3 className="text-2xl font-bold">${revenueTotal.toFixed(0)}</h3>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lightweight charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">User Registrations (30d)</CardTitle>
            <CardDescription className="text-xs">Daily signups</CardDescription>
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <div className="flex items-center justify-center h-32 text-zinc-500">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : usersSeries.length === 0 ? (
              <p className="text-xs text-zinc-500">No data</p>
            ) : (
              <div className="flex items-end gap-1 h-40">
                {usersSeries.map((p) => {
                  const height = Math.min(100, (p.count || 0) * 12);
                  return (
                    <div key={p._id} className="flex-1 flex flex-col items-center">
                      <div className="w-full bg-emerald-500/70 rounded-t" style={{ height: `${height}px` }} />
                      <span className="text-[10px] text-zinc-500 mt-1">{p._id.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">Revenue (30d)</CardTitle>
            <CardDescription className="text-xs">Based on plan activations</CardDescription>
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <div className="flex items-center justify-center h-32 text-zinc-500">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : revenueSeries.length === 0 ? (
              <p className="text-xs text-zinc-500">No data</p>
            ) : (
              <div className="flex items-end gap-1 h-40">
                {revenueSeries.map((p) => {
                  const amount = p.totalAmount || 0;
                  const height = Math.min(120, amount / 5);
                  return (
                    <div key={p._id} className="flex-1 flex flex-col items-center">
                      <div className="w-full bg-amber-500/70 rounded-t" style={{ height: `${height}px` }} />
                      <span className="text-[10px] text-zinc-500 mt-1">{p._id.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Contact Form Responses Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <MessageSquare className="w-6 h-6 text-fuchsia-500" />
              Contact Form Responses
            </h2>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">
              Manage and respond to user messages sent via the contact page
            </p>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <span>Unread:</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400">
                {unreadCount}
              </span>
            </div>
          </div>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => fetchMessages(currentPage)}
            disabled={loading}
            className="text-xs"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Clock className="w-3 h-3 mr-2" />}
            Refresh
          </Button>
        </div>

        <Card className="border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-6 pt-4 flex items-center justify-between gap-4">
            <Tabs value={filter} onValueChange={(val) => { setFilter(val as 'all' | 'unread'); setCurrentPage(1); }}>
              <TabsList className="bg-zinc-100/70 dark:bg-zinc-900/60">
                <TabsTrigger value="all" className="data-[state=active]:bg-white data-[state=active]:text-zinc-900">All</TabsTrigger>
                <TabsTrigger value="unread" className="data-[state=active]:bg-white data-[state=active]:text-zinc-900">Unread</TabsTrigger>
              </TabsList>
            </Tabs>
            <p className="text-xs text-zinc-500">Page {pagination?.page || 1} of {pagination?.totalPages || 1}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800">
                  <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Sender</th>
                  <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Subject</th>
                  <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-4 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {loading && messages.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-zinc-500">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-8 h-8 animate-spin text-fuchsia-500" />
                        <p>Loading messages...</p>
                      </div>
                    </td>
                  </tr>
                ) : messages.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-zinc-500">
                      No messages found.
                    </td>
                  </tr>
                ) : (
                  messages.map((msg) => (
                    <React.Fragment key={msg._id}>
                      <tr 
                        onClick={() => toggleExpand(msg._id)}
                        className={`cursor-pointer transition-colors duration-150 ${
                          expandedId === msg._id 
                            ? 'bg-fuchsia-50/50 dark:bg-fuchsia-500/5' 
                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/50'
                        }`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-medium text-zinc-900 dark:text-zinc-100">{msg.name}</span>
                            <span className="text-xs text-zinc-500 font-mono truncate max-w-[200px]">{msg.email}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                            {!msg.read && (
                              <span className="inline-block w-2 h-2 rounded-full bg-fuchsia-500" />
                            )}
                            {msg.subject}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs text-zinc-500">
                            {format(new Date(msg.createdAt), 'MMM dd, yyyy · HH:mm')}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            {expandedId === msg._id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </Button>
                        </td>
                      </tr>
                      <AnimatePresence>
                        {expandedId === msg._id && (
                          <tr>
                            <td colSpan={4} className="p-0 border-b border-zinc-200 dark:border-zinc-800">
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden bg-zinc-50/30 dark:bg-zinc-900/30"
                              >
                                <div className="px-12 py-8 space-y-6">
                                  <div className="grid md:grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                      <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Contact Details</h4>
                                      <div className="space-y-3">
                                        <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                                          <User className="w-4 h-4 text-fuchsia-500" />
                                          <span className="font-medium text-zinc-900 dark:text-zinc-100">{msg.name}</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                                          <Mail className="w-4 h-4 text-fuchsia-500" />
                                          <span className="font-medium text-zinc-900 dark:text-zinc-100 underline decoration-fuchsia-500/30 underline-offset-4">{msg.email}</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                                          <Calendar className="w-4 h-4 text-fuchsia-500" />
                                          <span>{format(new Date(msg.createdAt), 'PPPP p')}</span>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="space-y-4">
                                      <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Subject</h4>
                                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{msg.subject}</p>
                                    </div>
                                  </div>

                                  <div className="space-y-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                                    <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Message Content</h4>
                                    <div className="prose prose-sm dark:prose-invert max-w-none">
                                      <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap text-base">
                                        {msg.message}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="pt-4 flex justify-end gap-3">
                                    <Button 
                                      variant={msg.read ? 'outline' : 'default'} 
                                      size="sm"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        try {
                                          const res = await fetch(`/api/admin/contacts/${msg._id}`, {
                                            method: 'PATCH',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ read: !msg.read }),
                                          });
                                          const json = await res.json();
                                          if (json.ok) {
                                            setMessages((prev) => prev.map(m => m._id === msg._id ? { ...m, read: !msg.read } : m));
                                            setUnreadCount((c) => json.contact?.read ? Math.max(0, c - 1) : c + 1);
                                          }
                                        } catch {}
                                      }}
                                    >
                                      {msg.read ? 'Mark as Unread' : 'Mark as Read'}
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={(e) => {
                                      e.stopPropagation();
                                      openReply(msg);
                                    }}>
                                      <Mail className="w-4 h-4 mr-2" />
                                      Respond
                                    </Button>
                                  </div>
                                </div>
                              </motion.div>
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <p className="text-xs text-zinc-500">
                Showing <span className="font-medium">{(currentPage - 1) * 10 + 1}</span> to <span className="font-medium">{Math.min(currentPage * 10, pagination.total)}</span> of <span className="font-medium">{pagination.total}</span> messages
              </p>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1 || loading}
                  className="h-8 px-2"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="flex items-center gap-1">
                  {[...Array(pagination.totalPages)].map((_, i) => (
                    <Button
                      key={i}
                      variant={currentPage === i + 1 ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(i + 1)}
                      className={`h-8 w-8 p-0 text-xs ${currentPage === i + 1 ? 'bg-fuchsia-500 hover:bg-fuchsia-600 border-none' : ''}`}
                      disabled={loading}
                    >
                      {i + 1}
                    </Button>
                  )).slice(Math.max(0, currentPage - 3), Math.min(pagination.totalPages, currentPage + 2))}
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setCurrentPage(prev => Math.min(pagination.totalPages, prev + 1))}
                  disabled={currentPage === pagination.totalPages || loading}
                  className="h-8 px-2"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>

    <Dialog open={replyOpen} onOpenChange={setReplyOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Respond to {replyTarget?.name || 'message'}</DialogTitle>
          <DialogDescription>
            This sends an email directly to the sender using the mailing service.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="text-xs text-zinc-500">To</p>
            <p className="text-sm font-medium">{replyTarget?.email}</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Subject</label>
            <Input value={replySubject} onChange={(e) => setReplySubject(e.target.value)} placeholder="Subject" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Message</label>
            <Textarea value={replyMessage} onChange={(e) => setReplyMessage(e.target.value)} rows={6} />
            <p className="text-xs text-zinc-500">Uses mailing custom endpoint (single recipient).</p>
          </div>
          {replyError && <p className="text-sm text-red-500">{replyError}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setReplyOpen(false)} disabled={replySending}>Cancel</Button>
          <Button onClick={sendReply} disabled={replySending}>
            {replySending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
