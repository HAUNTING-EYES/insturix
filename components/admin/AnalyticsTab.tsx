'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Loader2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Building2,
  Phone,
  Users,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  Send,
  X,
  Inbox,
  Trash2,
  MailOpen,
  MailX,
  CheckSquare,
  Square,
  Undo2,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

interface ContactMessage {
  _id: string;
  source?: 'contact' | 'support';
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: string;
  read?: boolean;
  deleted?: boolean;
  deletedAt?: string;
  organizationName?: string | null;
  telephone?: string | null;
  budget?: number | null;
}

interface AgencyMessage {
  _id: string;
  name: string;
  email: string;
  companyName: string;
  phone?: string;
  companySize?: string;
  message: string;
  createdAt: string;
  read?: boolean;
  deleted?: boolean;
  deletedAt?: string;
}

interface SeriesPoint {
  _id: string;
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

// Helper to calculate trend percentage
const calculateTrend = (series: SeriesPoint[], key: 'count' | 'totalAmount'): number => {
  if (series.length < 14) return 0;
  const recentHalf = series.slice(-7);
  const olderHalf = series.slice(-14, -7);
  const recentSum = recentHalf.reduce((sum, p) => sum + (p[key] || 0), 0);
  const olderSum = olderHalf.reduce((sum, p) => sum + (p[key] || 0), 0);
  if (olderSum === 0) return recentSum > 0 ? 100 : 0;
  return Math.round(((recentSum - olderSum) / olderSum) * 100);
};

export default function AnalyticsTab() {
  // Messages state
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<PaginationData | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread' | 'deleted'>('all');
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [deletedContactCount, setDeletedContactCount] = useState<number>(0);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [messagesError, setMessagesError] = useState<string | null>(null);
  
  // Metrics state
  const [usersSeries, setUsersSeries] = useState<SeriesPoint[]>([]);
  const [usersTotal, setUsersTotal] = useState<number>(0);
  const [revenueSeries, setRevenueSeries] = useState<SeriesPoint[]>([]);
  const [revenueTotal, setRevenueTotal] = useState<number>(0);
  const [metricsLoading, setMetricsLoading] = useState<boolean>(true);
  
  // Reply state
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ContactMessage | AgencyMessage | null>(null);
  const [replyType, setReplyType] = useState<'contact' | 'agency'>('contact');
  const [replySubject, setReplySubject] = useState('');
  const [replyMessage, setReplyMessage] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  
  // Agency state
  const [agencies, setAgencies] = useState<AgencyMessage[]>([]);
  const [agencyLoading, setAgencyLoading] = useState(true);
  const [agencyPagination, setAgencyPagination] = useState<PaginationData | null>(null);
  const [agencyCurrentPage, setAgencyCurrentPage] = useState(1);
  const [agencyExpandedId, setAgencyExpandedId] = useState<string | null>(null);
  const [agencyFilter, setAgencyFilter] = useState<'all' | 'unread' | 'deleted'>('all');
  const [agencyUnreadCount, setAgencyUnreadCount] = useState<number>(0);
  const [deletedAgencyCount, setDeletedAgencyCount] = useState<number>(0);
  const [selectedAgencies, setSelectedAgencies] = useState<Set<string>>(new Set());
  
  // Inbox tab state
  const [inboxTab, setInboxTab] = useState<'contacts' | 'agencies'>('contacts');
  
  // Bulk action loading state
  const [bulkLoading, setBulkLoading] = useState(false);
  
  // Permanent delete confirmation modal
  const [permanentDeleteModal, setPermanentDeleteModal] = useState(false);
  const [permanentDeleteType, setPermanentDeleteType] = useState<'contact' | 'agency'>('contact');
  const [permanentDeleteIds, setPermanentDeleteIds] = useState<string[]>([]);
  
  // Undo state
  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const { toast } = useToast();

  // Fetch messages
  const fetchMessages = useCallback(async (page: number) => {
    try {
      setLoading(true);
      let queryParams = `page=${page}&limit=10`;
      if (filter === 'unread') queryParams += '&read=false';
      if (filter === 'deleted') queryParams += '&deleted=only';
      const response = await fetch(`/api/admin/inbox?${queryParams}`);
      const data = await response.json();
      if (!response.ok || !data?.ok) {
        throw new Error(data?.message || 'Unable to load messages');
      }

      setMessages(data.messages || []);
      setPagination(data.pagination);
      setMessagesError(null);
    } catch (error: unknown) {
      console.error('Failed to fetch inbox messages:', error);
      setMessagesError(error instanceof Error ? error.message : 'Unable to load messages');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchMessages(currentPage);
    setSelectedContacts(new Set());
  }, [currentPage, filter, fetchMessages]);

  // Fetch agencies
  const fetchAgencies = useCallback(async (page: number) => {
    try {
      setAgencyLoading(true);
      let queryParams = `page=${page}&limit=10`;
      if (agencyFilter === 'unread') queryParams += '&read=false';
      if (agencyFilter === 'deleted') queryParams += '&deleted=only';
      const response = await fetch(`/api/admin/agencies?${queryParams}`);
      const data = await response.json();
      if (data.ok) {
        setAgencies(data.agencies);
        setAgencyPagination(data.pagination);
      }
    } catch (error) {
      console.error('Failed to fetch agency messages:', error);
    } finally {
      setAgencyLoading(false);
    }
  }, [agencyFilter]);

  useEffect(() => {
    fetchAgencies(agencyCurrentPage);
    setSelectedAgencies(new Set());
  }, [agencyCurrentPage, agencyFilter, fetchAgencies]);

  // Fetch counts (unread + deleted)
  const fetchCounts = useCallback(async () => {
    try {
      const [contactUnread, agencyUnread, contactDeleted, agencyDeleted] = await Promise.all([
        fetch('/api/admin/inbox?page=1&limit=1&read=false'),
        fetch('/api/admin/agencies?page=1&limit=1&read=false'),
        fetch('/api/admin/inbox?page=1&limit=1&deleted=only'),
        fetch('/api/admin/agencies?page=1&limit=1&deleted=only'),
      ]);
      const [cUnread, aUnread, cDeleted, aDeleted] = await Promise.all([
        contactUnread.json(), agencyUnread.json(), contactDeleted.json(), agencyDeleted.json()
      ]);
      if (cUnread?.pagination?.total != null) setUnreadCount(cUnread.pagination.total);
      if (aUnread?.pagination?.total != null) setAgencyUnreadCount(aUnread.pagination.total);
      if (cDeleted?.pagination?.total != null) setDeletedContactCount(cDeleted.pagination.total);
      if (aDeleted?.pagination?.total != null) setDeletedAgencyCount(aDeleted.pagination.total);
    } catch {}
  }, []);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  // Fetch metrics
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

  const toggleExpand = (id: string) => setExpandedId(expandedId === id ? null : id);
  const toggleAgencyExpand = (id: string) => setAgencyExpandedId(agencyExpandedId === id ? null : id);

  // Selection handlers
  const toggleContactSelection = (id: string) => {
    setSelectedContacts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAgencySelection = (id: string) => {
    setSelectedAgencies(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllContacts = () => {
    if (selectedContacts.size === messages.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(messages.map(m => m._id)));
    }
  };

  const selectAllAgencies = () => {
    if (selectedAgencies.size === agencies.length) {
      setSelectedAgencies(new Set());
    } else {
      setSelectedAgencies(new Set(agencies.map(a => a._id)));
    }
  };

  // Undo handler
  const handleUndo = async (ids: string[], type: 'contact' | 'agency') => {
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    
    try {
      const endpoint = type === 'contact' ? '/api/admin/inbox' : '/api/admin/agencies/bulk';
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action: 'restore' }),
      });
      const json = await res.json();
      if (json.ok) {
        toast({ title: "Restored", description: `${json.modifiedCount} item(s) restored` });
        if (type === 'contact') {
          fetchMessages(currentPage);
        } else {
          fetchAgencies(agencyCurrentPage);
        }
        fetchCounts();
      }
    } catch (e) {
      toast({ title: "Error", description: "Failed to restore", variant: "destructive" });
    }
  };

  // Bulk actions
  const handleBulkContactAction = async (action: 'read' | 'unread' | 'delete' | 'restore' | 'permanent-delete') => {
    if (selectedContacts.size === 0) return;
    
    if (action === 'permanent-delete') {
      setPermanentDeleteType('contact');
      setPermanentDeleteIds(Array.from(selectedContacts));
      setPermanentDeleteModal(true);
      return;
    }
    
    try {
      setBulkLoading(true);
      const ids = Array.from(selectedContacts);
      const res = await fetch('/api/admin/inbox', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action }),
      });
      const json = await res.json();
      if (json.ok) {
        if (action === 'delete') {
          setMessages(prev => prev.filter(m => !selectedContacts.has(m._id)));
          const t = toast({ 
            title: "Deleted", 
            description: `${json.modifiedCount} message(s) moved to trash`,
            action: (
              <Button variant="outline" size="sm" onClick={() => handleUndo(ids, 'contact')} className="gap-1.5">
                <Undo2 className="w-3.5 h-3.5" /> Undo
              </Button>
            ),
          });
        } else if (action === 'restore') {
          setMessages(prev => prev.filter(m => !selectedContacts.has(m._id)));
          toast({ title: "Restored", description: `${json.modifiedCount} message(s) restored` });
        } else {
          setMessages(prev => prev.map(m => 
            selectedContacts.has(m._id) ? { ...m, read: action === 'read' } : m
          ));
          toast({ title: action === 'read' ? "Marked as Read" : "Marked as Unread", description: `${json.modifiedCount} message(s) updated` });
        }
        setSelectedContacts(new Set());
        fetchCounts();
        if (action === 'delete' || action === 'restore') {
          fetchMessages(currentPage);
        }
      }
    } catch (e) {
      toast({ title: "Error", description: "Failed to perform action", variant: "destructive" });
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkAgencyAction = async (action: 'read' | 'unread' | 'delete' | 'restore' | 'permanent-delete') => {
    if (selectedAgencies.size === 0) return;
    
    if (action === 'permanent-delete') {
      setPermanentDeleteType('agency');
      setPermanentDeleteIds(Array.from(selectedAgencies));
      setPermanentDeleteModal(true);
      return;
    }
    
    try {
      setBulkLoading(true);
      const ids = Array.from(selectedAgencies);
      const res = await fetch('/api/admin/agencies/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action }),
      });
      const json = await res.json();
      if (json.ok) {
        if (action === 'delete') {
          setAgencies(prev => prev.filter(a => !selectedAgencies.has(a._id)));
          toast({ 
            title: "Deleted", 
            description: `${json.modifiedCount} inquiry(s) moved to trash`,
            action: (
              <Button variant="outline" size="sm" onClick={() => handleUndo(ids, 'agency')} className="gap-1.5">
                <Undo2 className="w-3.5 h-3.5" /> Undo
              </Button>
            ),
          });
        } else if (action === 'restore') {
          setAgencies(prev => prev.filter(a => !selectedAgencies.has(a._id)));
          toast({ title: "Restored", description: `${json.modifiedCount} inquiry(s) restored` });
        } else {
          setAgencies(prev => prev.map(a => 
            selectedAgencies.has(a._id) ? { ...a, read: action === 'read' } : a
          ));
          toast({ title: action === 'read' ? "Marked as Read" : "Marked as Unread", description: `${json.modifiedCount} inquiry(s) updated` });
        }
        setSelectedAgencies(new Set());
        fetchCounts();
        if (action === 'delete' || action === 'restore') {
          fetchAgencies(agencyCurrentPage);
        }
      }
    } catch (e) {
      toast({ title: "Error", description: "Failed to perform action", variant: "destructive" });
    } finally {
      setBulkLoading(false);
    }
  };

  // Permanent delete confirmation
  const handleConfirmPermanentDelete = async () => {
    try {
      setBulkLoading(true);
      const endpoint = permanentDeleteType === 'contact' ? '/api/admin/inbox' : '/api/admin/agencies/bulk';
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: permanentDeleteIds, action: 'permanent-delete' }),
      });
      const json = await res.json();
      if (json.ok) {
        toast({ title: "Permanently Deleted", description: `${json.deletedCount} item(s) permanently deleted` });
        if (permanentDeleteType === 'contact') {
          setSelectedContacts(new Set());
          fetchMessages(currentPage);
        } else {
          setSelectedAgencies(new Set());
          fetchAgencies(agencyCurrentPage);
        }
        fetchCounts();
      }
    } catch (e) {
      toast({ title: "Error", description: "Failed to delete permanently", variant: "destructive" });
    } finally {
      setBulkLoading(false);
      setPermanentDeleteModal(false);
      setPermanentDeleteIds([]);
    }
  };

  // Single item actions
  const handleContactReadToggle = async (msg: ContactMessage, e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await fetch('/api/admin/inbox', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: msg._id, read: !msg.read }),
    });
    const json = await res.json();
    if (json.ok) {
      setMessages((prev) => prev.map(m => m._id === msg._id ? { ...m, read: !msg.read } : m));
      setUnreadCount((c) => json.message?.read ? Math.max(0, c - 1) : c + 1);
    }
  };

  const handleContactDelete = async (msg: ContactMessage, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch('/api/admin/inbox', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: msg._id, deleted: true }),
      });
      const json = await res.json();
      if (json.ok) {
        setMessages((prev) => prev.filter(m => m._id !== msg._id));
        if (!msg.read) setUnreadCount((c) => Math.max(0, c - 1));
        fetchCounts();
        toast({ 
          title: "Deleted", 
          description: "Message moved to trash",
          action: (
            <Button variant="outline" size="sm" onClick={() => handleUndo([msg._id], 'contact')} className="gap-1.5">
              <Undo2 className="w-3.5 h-3.5" /> Undo
            </Button>
          ),
        });
      } else {
        toast({ title: "Error", description: json.message || "Failed to delete", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to delete message", variant: "destructive" });
    }
  };

  const handleContactRestore = async (msg: ContactMessage, e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await fetch('/api/admin/inbox', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: msg._id, deleted: false }),
    });
    const json = await res.json();
    if (json.ok) {
      setMessages((prev) => prev.filter(m => m._id !== msg._id));
      fetchCounts();
      toast({ title: "Restored", description: "Message restored" });
    }
  };

  const handleContactPermanentDelete = async (msg: ContactMessage, e: React.MouseEvent) => {
    e.stopPropagation();
    setPermanentDeleteType('contact');
    setPermanentDeleteIds([msg._id]);
    setPermanentDeleteModal(true);
  };

  const handleAgencyReadToggle = async (agency: AgencyMessage, e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await fetch(`/api/admin/agencies/${agency._id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ read: !agency.read }),
    });
    const json = await res.json();
    if (json.ok) {
      setAgencies((prev) => prev.map(a => a._id === agency._id ? { ...a, read: !agency.read } : a));
      setAgencyUnreadCount((c) => json.agency?.read ? Math.max(0, c - 1) : c + 1);
    }
  };

  const handleAgencyDelete = async (agency: AgencyMessage, e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await fetch(`/api/admin/agencies/${agency._id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deleted: true }),
    });
    const json = await res.json();
    if (json.ok) {
      setAgencies((prev) => prev.filter(a => a._id !== agency._id));
      if (!agency.read) setAgencyUnreadCount((c) => Math.max(0, c - 1));
      fetchCounts();
      toast({ 
        title: "Deleted", 
        description: "Inquiry moved to trash",
        action: (
          <Button variant="outline" size="sm" onClick={() => handleUndo([agency._id], 'agency')} className="gap-1.5">
            <Undo2 className="w-3.5 h-3.5" /> Undo
          </Button>
        ),
      });
    }
  };

  const handleAgencyRestore = async (agency: AgencyMessage, e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await fetch(`/api/admin/agencies/${agency._id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deleted: false }),
    });
    const json = await res.json();
    if (json.ok) {
      setAgencies((prev) => prev.filter(a => a._id !== agency._id));
      fetchCounts();
      toast({ title: "Restored", description: "Inquiry restored" });
    }
  };

  const handleAgencyPermanentDelete = async (agency: AgencyMessage, e: React.MouseEvent) => {
    e.stopPropagation();
    setPermanentDeleteType('agency');
    setPermanentDeleteIds([agency._id]);
    setPermanentDeleteModal(true);
  };

  const openReply = (msg: ContactMessage | AgencyMessage, type: 'contact' | 'agency') => {
    setReplyTarget(msg);
    setReplyType(type);
    if (type === 'contact') {
      const contactMsg = msg as ContactMessage;
      setReplySubject(`Re: ${contactMsg.subject}`);
    } else {
      const agencyMsg = msg as AgencyMessage;
      setReplySubject(`Re: Inquiry from ${agencyMsg.companyName}`);
    }
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
          testMode: true,
          testEmail: replyTarget.email,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || 'Failed to send');
      
      if (replyType === 'contact') {
        setMessages((prev) => prev.map((m) => m._id === replyTarget._id ? { ...m, read: true } : m));
        setUnreadCount((c) => Math.max(0, c - 1));
      } else {
        setAgencies((prev) => prev.map((m) => m._id === replyTarget._id ? { ...m, read: true } : m));
        setAgencyUnreadCount((c) => Math.max(0, c - 1));
      }
      
      setReplyOpen(false);
      toast({ title: "Email sent", description: `Reply sent to ${replyTarget.email}` });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to send';
      setReplyError(message);
      toast({ title: "Failed to send", description: message, variant: "destructive" });
    } finally {
      setReplySending(false);
    }
  };

  // Calculate trends
  const usersTrend = calculateTrend(usersSeries, 'count');
  const revenueTrend = calculateTrend(revenueSeries, 'totalAmount');

  // Get max values for chart scaling
  const maxUserCount = Math.max(...usersSeries.map(p => p.count || 0), 1);
  const maxRevenue = Math.max(...revenueSeries.map(p => p.totalAmount || 0), 1);

  // Check if in deleted view
  const isContactsDeleted = filter === 'deleted';
  const isAgenciesDeleted = agencyFilter === 'deleted';

  return (
    <>
    <div className="p-6 lg:p-8 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Analytics Dashboard</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Real-time metrics and insights</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          <Activity className="w-3.5 h-3.5 text-emerald-500" />
          <span>Last 30 days</span>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Users Metric */}
        <Card className="bg-gradient-to-br from-emerald-500/5 to-emerald-500/10 border-emerald-500/20 dark:border-emerald-500/30">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">New Users</p>
                <p className="text-[32px] font-bold text-zinc-900 dark:text-zinc-100 mt-1">{usersTotal}</p>
                <div className="flex items-center gap-1 mt-2">
                  {usersTrend >= 0 ? (
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                  )}
                  <span className={`text-[11px] font-medium ${usersTrend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {usersTrend >= 0 ? '+' : ''}{usersTrend}%
                  </span>
                  <span className="text-[11px] text-zinc-500">vs last week</span>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-500/20">
                <Users className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Revenue Metric */}
        <Card className="bg-gradient-to-br from-amber-500/5 to-amber-500/10 border-amber-500/20 dark:border-amber-500/30">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">Revenue</p>
                <p className="text-[32px] font-bold text-zinc-900 dark:text-zinc-100 mt-1">${revenueTotal.toFixed(0)}</p>
                <div className="flex items-center gap-1 mt-2">
                  {revenueTrend >= 0 ? (
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                  )}
                  <span className={`text-[11px] font-medium ${revenueTrend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {revenueTrend >= 0 ? '+' : ''}{revenueTrend}%
                  </span>
                  <span className="text-[11px] text-zinc-500">vs last week</span>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-500/20">
                <DollarSign className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Inquiries Metric */}
        <Card className="bg-gradient-to-br from-blue-500/5 to-blue-500/10 border-blue-500/20 dark:border-blue-500/30">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">Total Inquiries</p>
                <p className="text-[32px] font-bold text-zinc-900 dark:text-zinc-100 mt-1">{(pagination?.total || 0) + (agencyPagination?.total || 0)}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[11px] text-zinc-500">{pagination?.total || 0} contacts</span>
                  <span className="text-zinc-300">•</span>
                  <span className="text-[11px] text-zinc-500">{agencyPagination?.total || 0} agencies</span>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-blue-500/20">
                <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Unread Metric */}
        <Card className="bg-gradient-to-br from-fuchsia-500/5 to-fuchsia-500/10 border-fuchsia-500/20 dark:border-fuchsia-500/30">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">Unread Messages</p>
                <p className="text-[32px] font-bold text-zinc-900 dark:text-zinc-100 mt-1">{unreadCount + agencyUnreadCount}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[11px] text-zinc-500">{unreadCount} contacts</span>
                  <span className="text-zinc-300">•</span>
                  <span className="text-[11px] text-zinc-500">{agencyUnreadCount} agencies</span>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-fuchsia-500/20">
                <Inbox className="w-5 h-5 text-fuchsia-600 dark:text-fuchsia-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* User Registrations Chart */}
        <Card className="bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-[14px] font-semibold">User Registrations</CardTitle>
                <CardDescription className="text-[11px] mt-1">Daily signups over the past 30 days</CardDescription>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{usersTotal}</p>
                <p className="text-[11px] text-zinc-500">total users</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {metricsLoading ? (
              <div className="flex items-center justify-center h-48 text-zinc-400">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : usersSeries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-zinc-400">
                <BarChart3 className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">No data available</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-end gap-1 h-48 px-1">
                  {usersSeries.map((p, i) => {
                    const value = p.count || 0;
                    const height = (value / maxUserCount) * 100;
                    const isToday = i === usersSeries.length - 1;
                    return (
                      <div key={p._id} className="flex-1 flex flex-col items-center group relative">
                        <div 
                          className={`w-full rounded-t transition-all duration-200 cursor-pointer ${
                            isToday ? 'bg-emerald-500' : 'bg-emerald-500/60 hover:bg-emerald-500/80'
                          }`}
                          style={{ height: `${Math.max(height, 2)}%` }}
                        />
                        <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                          <div className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[11px] px-2 py-1 rounded shadow-lg whitespace-nowrap">
                            <p className="font-medium">{value} users</p>
                            <p className="text-zinc-400 dark:text-zinc-600 text-[10px]">{format(new Date(p._id), 'MMM dd')}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between px-1 text-[10px] text-zinc-400">
                  <span>{usersSeries[0] ? format(new Date(usersSeries[0]._id), 'MMM dd') : ''}</span>
                  <span>{usersSeries[Math.floor(usersSeries.length / 2)] ? format(new Date(usersSeries[Math.floor(usersSeries.length / 2)]._id), 'MMM dd') : ''}</span>
                  <span>{usersSeries[usersSeries.length - 1] ? format(new Date(usersSeries[usersSeries.length - 1]._id), 'MMM dd') : ''}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Revenue Chart */}
        <Card className="bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-[14px] font-semibold">Revenue</CardTitle>
                <CardDescription className="text-[11px] mt-1">Daily earnings from plan activations</CardDescription>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">${revenueTotal.toFixed(0)}</p>
                <p className="text-[11px] text-zinc-500">total revenue</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {metricsLoading ? (
              <div className="flex items-center justify-center h-48 text-zinc-400">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : revenueSeries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-zinc-400">
                <DollarSign className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">No revenue data</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-end gap-1 h-48 px-1">
                  {revenueSeries.map((p, i) => {
                    const value = p.totalAmount || 0;
                    const height = (value / maxRevenue) * 100;
                    const isToday = i === revenueSeries.length - 1;
                    return (
                      <div key={p._id} className="flex-1 flex flex-col items-center group relative">
                        <div 
                          className={`w-full rounded-t transition-all duration-200 cursor-pointer ${
                            isToday ? 'bg-amber-500' : 'bg-amber-500/60 hover:bg-amber-500/80'
                          }`}
                          style={{ height: `${Math.max(height, 2)}%` }}
                        />
                        <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                          <div className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[11px] px-2 py-1 rounded shadow-lg whitespace-nowrap">
                            <p className="font-medium">${value.toFixed(0)}</p>
                            <p className="text-zinc-400 dark:text-zinc-600 text-[10px]">{format(new Date(p._id), 'MMM dd')}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between px-1 text-[10px] text-zinc-400">
                  <span>{revenueSeries[0] ? format(new Date(revenueSeries[0]._id), 'MMM dd') : ''}</span>
                  <span>{revenueSeries[Math.floor(revenueSeries.length / 2)] ? format(new Date(revenueSeries[Math.floor(revenueSeries.length / 2)]._id), 'MMM dd') : ''}</span>
                  <span>{revenueSeries[revenueSeries.length - 1] ? format(new Date(revenueSeries[revenueSeries.length - 1]._id), 'MMM dd') : ''}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Inbox Section - Tabbed */}
      <Card className="bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800 shadow-sm overflow-hidden">
        <Tabs value={inboxTab} onValueChange={(val) => setInboxTab(val as 'contacts' | 'agencies')} className="w-full">
          <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500/20 to-fuchsia-500/20">
                  <Inbox className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h2 className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">Inbox</h2>
                  <p className="text-[11px] text-zinc-500">Manage all incoming messages</p>
                </div>
              </div>
              <TabsList className="bg-zinc-100 dark:bg-zinc-800 p-1">
                <TabsTrigger value="contacts" className="text-[11px] px-3 py-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700 gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" />
                  Messages
                  {unreadCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-[10px] font-medium bg-fuchsia-500 text-white rounded-full">{unreadCount}</span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="agencies" className="text-[11px] px-3 py-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700 gap-1.5">
                  <Building2 className="w-3.5 h-3.5" />
                  Agencies
                  {agencyUnreadCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-[10px] font-medium bg-sky-500 text-white rounded-full">{agencyUnreadCount}</span>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          {/* Messages Tab */}
          <TabsContent value="contacts" className="m-0">
            {messagesError && (
              <div role="alert" className="mx-5 mt-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{messagesError}</span>
                </div>
                <Button variant="outline" size="sm" onClick={() => fetchMessages(currentPage)} disabled={loading} className="h-7 shrink-0 text-[11px]">
                  Retry
                </Button>
              </div>
            )}
            {/* Toolbar */}
            <div className="px-5 py-3 bg-zinc-50/50 dark:bg-zinc-800/30 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button onClick={selectAllContacts} className="flex items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors">
                  {selectedContacts.size === messages.length && messages.length > 0 ? (
                    <CheckSquare className="w-4 h-4 text-fuchsia-500" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                  <span>{selectedContacts.size > 0 ? `${selectedContacts.size} selected` : 'Select all'}</span>
                </button>
                {selectedContacts.size > 0 && (
                  <div className="flex items-center gap-1 pl-3 border-l border-zinc-200 dark:border-zinc-700">
                    {!isContactsDeleted ? (
                      <>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] gap-1.5" onClick={() => handleBulkContactAction('read')} disabled={bulkLoading}>
                          <MailOpen className="w-3.5 h-3.5" /> Read
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] gap-1.5" onClick={() => handleBulkContactAction('unread')} disabled={bulkLoading}>
                          <MailX className="w-3.5 h-3.5" /> Unread
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10" onClick={() => handleBulkContactAction('delete')} disabled={bulkLoading}>
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] gap-1.5" onClick={() => handleBulkContactAction('restore')} disabled={bulkLoading}>
                          <RotateCcw className="w-3.5 h-3.5" /> Restore
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10" onClick={() => handleBulkContactAction('permanent-delete')} disabled={bulkLoading}>
                          <Trash2 className="w-3.5 h-3.5" /> Delete Forever
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Tabs value={filter} onValueChange={(val) => { setFilter(val as 'all' | 'unread' | 'deleted'); setCurrentPage(1); }}>
                  <TabsList className="h-7 bg-white dark:bg-zinc-800 shadow-sm">
                    <TabsTrigger value="all" className="text-[11px] h-5 px-2">All</TabsTrigger>
                    <TabsTrigger value="unread" className="text-[11px] h-5 px-2">Unread</TabsTrigger>
                    <TabsTrigger value="deleted" className="text-[11px] h-5 px-2 gap-1">
                      <Trash2 className="w-3 h-3" />
                      Deleted
                      {deletedContactCount > 0 && <span className="text-[10px] text-red-500">({deletedContactCount})</span>}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <Button variant="ghost" size="sm" onClick={() => fetchMessages(currentPage)} disabled={loading} className="h-7 px-2 text-[11px]">
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />}
                  <span className="ml-1.5">Refresh</span>
                </Button>
              </div>
            </div>
            
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {loading && messages.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-zinc-400" />
                  <p className="text-sm text-zinc-500">Loading messages...</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  {isContactsDeleted ? (
                    <>
                      <Trash2 className="w-8 h-8 mx-auto mb-3 text-zinc-300 dark:text-zinc-700" />
                      <p className="text-sm text-zinc-500">Trash is empty</p>
                    </>
                  ) : (
                    <>
                      <MessageSquare className="w-8 h-8 mx-auto mb-3 text-zinc-300 dark:text-zinc-700" />
                      <p className="text-sm text-zinc-500">No messages found</p>
                    </>
                  )}
                </div>
              ) : (
                messages.map((msg) => (
                  <div key={msg._id}>
                    <div 
                      className={`px-5 py-4 transition-colors ${
                        expandedId === msg._id ? 'bg-fuchsia-50/50 dark:bg-fuchsia-500/5' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                      } ${isContactsDeleted ? 'opacity-75' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedContacts.has(msg._id)}
                            onCheckedChange={() => toggleContactSelection(msg._id)}
                            className="data-[state=checked]:bg-fuchsia-500 data-[state=checked]:border-fuchsia-500"
                          />
                        </div>
                        
                        {!msg.read && !isContactsDeleted && <span className="mt-2 w-2 h-2 rounded-full bg-fuchsia-500 shrink-0" />}
                        
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleExpand(msg._id)}>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{msg.name}</p>
                            <p className="text-[11px] text-zinc-400 shrink-0">{format(new Date(msg.createdAt), 'MMM dd, HH:mm')}</p>
                          </div>
                          <p className="text-sm text-zinc-600 dark:text-zinc-400 truncate mt-0.5">{msg.subject}</p>
                          <p className="text-[11px] text-zinc-400 truncate mt-1">{msg.message.slice(0, 80)}...</p>
                        </div>
                        
                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          {!isContactsDeleted ? (
                            <>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => handleContactReadToggle(msg, e)} title={msg.read ? 'Mark as unread' : 'Mark as read'}>
                                {msg.read ? <MailX className="w-3.5 h-3.5 text-zinc-400" /> : <MailOpen className="w-3.5 h-3.5 text-zinc-400" />}
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10" onClick={(e) => handleContactDelete(msg, e)} title="Delete">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => handleContactRestore(msg, e)} title="Restore">
                                <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10" onClick={(e) => handleContactPermanentDelete(msg, e)} title="Delete Forever">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                        
                        <ChevronDown 
                          className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform cursor-pointer ${expandedId === msg._id ? 'rotate-180' : ''}`}
                          onClick={() => toggleExpand(msg._id)}
                        />
                      </div>
                    </div>
                    <AnimatePresence>
                      {expandedId === msg._id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden"
                        >
                          <div className="px-5 py-4 bg-zinc-50/80 dark:bg-zinc-800/50 border-t border-zinc-100 dark:border-zinc-800">
                            <div className="grid md:grid-cols-2 gap-4 mb-4">
                              <div className="space-y-2 text-sm">
                                <p className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400"><User className="w-3.5 h-3.5" /> {msg.name}</p>
                                <p className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400"><Mail className="w-3.5 h-3.5" /> {msg.email}</p>
                                <p className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400"><Calendar className="w-3.5 h-3.5" /> {format(new Date(msg.createdAt), 'PPP p')}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">Subject</p>
                                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{msg.subject}</p>
                              </div>
                              {msg.source === 'support' && (
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">Support details</p>
                                  <div className="space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                                    {msg.organizationName && <p>{msg.organizationName}</p>}
                                    {msg.telephone && <p>{msg.telephone}</p>}
                                    {msg.budget != null && <p>Budget: ₹{msg.budget.toLocaleString()}</p>}
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="mb-4">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">Message</p>
                              <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                            </div>
                            <div className="flex justify-end gap-2">
                              {!isContactsDeleted ? (
                                <>
                                  <Button variant="ghost" size="sm" className="h-8 text-[11px]" onClick={(e) => handleContactReadToggle(msg, e)}>
                                    {msg.read ? 'Mark Unread' : 'Mark Read'}
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-8 text-[11px] text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10" onClick={(e) => handleContactDelete(msg, e)}>
                                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
                                  </Button>
                                  <Button size="sm" className="h-8 text-[11px]" onClick={(e) => { e.stopPropagation(); openReply(msg, 'contact'); }}>
                                    <Send className="w-3.5 h-3.5 mr-1.5" /> Reply
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button variant="ghost" size="sm" className="h-8 text-[11px]" onClick={(e) => handleContactRestore(msg, e)}>
                                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Restore
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-8 text-[11px] text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10" onClick={(e) => handleContactPermanentDelete(msg, e)}>
                                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete Forever
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))
              )}
            </div>
            
            {pagination && pagination.totalPages > 1 && (
              <div className="px-5 py-3 bg-zinc-50/50 dark:bg-zinc-800/30 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <p className="text-[11px] text-zinc-500">{(currentPage - 1) * 10 + 1}-{Math.min(currentPage * 10, pagination.total)} of {pagination.total}</p>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-7 w-7 p-0"><ChevronLeft className="w-4 h-4" /></Button>
                  <span className="text-[11px] text-zinc-600 px-2">{currentPage} / {pagination.totalPages}</span>
                  <Button variant="ghost" size="sm" onClick={() => setCurrentPage(p => Math.min(pagination.totalPages, p + 1))} disabled={currentPage === pagination.totalPages} className="h-7 w-7 p-0"><ChevronRight className="w-4 h-4" /></Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Agencies Tab */}
          <TabsContent value="agencies" className="m-0">
            {/* Toolbar */}
            <div className="px-5 py-3 bg-zinc-50/50 dark:bg-zinc-800/30 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button onClick={selectAllAgencies} className="flex items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors">
                  {selectedAgencies.size === agencies.length && agencies.length > 0 ? (
                    <CheckSquare className="w-4 h-4 text-sky-500" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                  <span>{selectedAgencies.size > 0 ? `${selectedAgencies.size} selected` : 'Select all'}</span>
                </button>
                {selectedAgencies.size > 0 && (
                  <div className="flex items-center gap-1 pl-3 border-l border-zinc-200 dark:border-zinc-700">
                    {!isAgenciesDeleted ? (
                      <>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] gap-1.5" onClick={() => handleBulkAgencyAction('read')} disabled={bulkLoading}>
                          <MailOpen className="w-3.5 h-3.5" /> Read
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] gap-1.5" onClick={() => handleBulkAgencyAction('unread')} disabled={bulkLoading}>
                          <MailX className="w-3.5 h-3.5" /> Unread
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10" onClick={() => handleBulkAgencyAction('delete')} disabled={bulkLoading}>
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] gap-1.5" onClick={() => handleBulkAgencyAction('restore')} disabled={bulkLoading}>
                          <RotateCcw className="w-3.5 h-3.5" /> Restore
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10" onClick={() => handleBulkAgencyAction('permanent-delete')} disabled={bulkLoading}>
                          <Trash2 className="w-3.5 h-3.5" /> Delete Forever
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Tabs value={agencyFilter} onValueChange={(val) => { setAgencyFilter(val as 'all' | 'unread' | 'deleted'); setAgencyCurrentPage(1); }}>
                  <TabsList className="h-7 bg-white dark:bg-zinc-800 shadow-sm">
                    <TabsTrigger value="all" className="text-[11px] h-5 px-2">All</TabsTrigger>
                    <TabsTrigger value="unread" className="text-[11px] h-5 px-2">Unread</TabsTrigger>
                    <TabsTrigger value="deleted" className="text-[11px] h-5 px-2 gap-1">
                      <Trash2 className="w-3 h-3" />
                      Deleted
                      {deletedAgencyCount > 0 && <span className="text-[10px] text-red-500">({deletedAgencyCount})</span>}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <Button variant="ghost" size="sm" onClick={() => fetchAgencies(agencyCurrentPage)} disabled={agencyLoading} className="h-7 px-2 text-[11px]">
                  {agencyLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />}
                  <span className="ml-1.5">Refresh</span>
                </Button>
              </div>
            </div>
            
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {agencyLoading && agencies.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-zinc-400" />
                  <p className="text-sm text-zinc-500">Loading inquiries...</p>
                </div>
              ) : agencies.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  {isAgenciesDeleted ? (
                    <>
                      <Trash2 className="w-8 h-8 mx-auto mb-3 text-zinc-300 dark:text-zinc-700" />
                      <p className="text-sm text-zinc-500">Trash is empty</p>
                    </>
                  ) : (
                    <>
                      <Building2 className="w-8 h-8 mx-auto mb-3 text-zinc-300 dark:text-zinc-700" />
                      <p className="text-sm text-zinc-500">No agency inquiries</p>
                    </>
                  )}
                </div>
              ) : (
                agencies.map((agency) => (
                  <div key={agency._id}>
                    <div 
                      className={`px-5 py-4 transition-colors ${
                        agencyExpandedId === agency._id ? 'bg-sky-50/50 dark:bg-sky-500/5' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                      } ${isAgenciesDeleted ? 'opacity-75' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedAgencies.has(agency._id)}
                            onCheckedChange={() => toggleAgencySelection(agency._id)}
                            className="data-[state=checked]:bg-sky-500 data-[state=checked]:border-sky-500"
                          />
                        </div>
                        
                        {!agency.read && !isAgenciesDeleted && <span className="mt-2 w-2 h-2 rounded-full bg-sky-500 shrink-0" />}
                        
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleAgencyExpand(agency._id)}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{agency.name}</p>
                              <span className="text-zinc-300">•</span>
                              <p className="text-sm text-sky-600 dark:text-sky-400 truncate">{agency.companyName}</p>
                            </div>
                            <p className="text-[11px] text-zinc-400 shrink-0">{format(new Date(agency.createdAt), 'MMM dd, HH:mm')}</p>
                          </div>
                          <p className="text-[11px] text-zinc-400 mt-1">{agency.email} {agency.companySize && `• ${agency.companySize}`}</p>
                          <p className="text-[11px] text-zinc-500 truncate mt-1">{agency.message.slice(0, 80)}...</p>
                        </div>
                        
                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          {!isAgenciesDeleted ? (
                            <>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => handleAgencyReadToggle(agency, e)} title={agency.read ? 'Mark as unread' : 'Mark as read'}>
                                {agency.read ? <MailX className="w-3.5 h-3.5 text-zinc-400" /> : <MailOpen className="w-3.5 h-3.5 text-zinc-400" />}
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10" onClick={(e) => handleAgencyDelete(agency, e)} title="Delete">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => handleAgencyRestore(agency, e)} title="Restore">
                                <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10" onClick={(e) => handleAgencyPermanentDelete(agency, e)} title="Delete Forever">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                        
                        <ChevronDown 
                          className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform cursor-pointer ${agencyExpandedId === agency._id ? 'rotate-180' : ''}`}
                          onClick={() => toggleAgencyExpand(agency._id)}
                        />
                      </div>
                    </div>
                    <AnimatePresence>
                      {agencyExpandedId === agency._id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden"
                        >
                          <div className="px-5 py-4 bg-zinc-50/80 dark:bg-zinc-800/50 border-t border-zinc-100 dark:border-zinc-800">
                            <div className="grid md:grid-cols-2 gap-4 mb-4">
                              <div className="space-y-2 text-sm">
                                <p className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400"><User className="w-3.5 h-3.5" /> {agency.name}</p>
                                <p className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400"><Mail className="w-3.5 h-3.5" /> {agency.email}</p>
                                {agency.phone && <p className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400"><Phone className="w-3.5 h-3.5" /> {agency.phone}</p>}
                                <p className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400"><Calendar className="w-3.5 h-3.5" /> {format(new Date(agency.createdAt), 'PPP p')}</p>
                              </div>
                              <div className="space-y-3">
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">Company</p>
                                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{agency.companyName}</p>
                                </div>
                                {agency.companySize && (
                                  <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">Size</p>
                                    <p className="text-sm text-zinc-600 dark:text-zinc-400">{agency.companySize}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="mb-4">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">Message</p>
                              <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">{agency.message}</p>
                            </div>
                            <div className="flex justify-end gap-2">
                              {!isAgenciesDeleted ? (
                                <>
                                  <Button variant="ghost" size="sm" className="h-8 text-[11px]" onClick={(e) => handleAgencyReadToggle(agency, e)}>
                                    {agency.read ? 'Mark Unread' : 'Mark Read'}
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-8 text-[11px] text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10" onClick={(e) => handleAgencyDelete(agency, e)}>
                                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
                                  </Button>
                                  <Button size="sm" className="h-8 text-[11px]" onClick={(e) => { e.stopPropagation(); openReply(agency, 'agency'); }}>
                                    <Send className="w-3.5 h-3.5 mr-1.5" /> Reply
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button variant="ghost" size="sm" className="h-8 text-[11px]" onClick={(e) => handleAgencyRestore(agency, e)}>
                                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Restore
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-8 text-[11px] text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10" onClick={(e) => handleAgencyPermanentDelete(agency, e)}>
                                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete Forever
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))
              )}
            </div>
            
            {agencyPagination && agencyPagination.totalPages > 1 && (
              <div className="px-5 py-3 bg-zinc-50/50 dark:bg-zinc-800/30 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <p className="text-[11px] text-zinc-500">{(agencyCurrentPage - 1) * 10 + 1}-{Math.min(agencyCurrentPage * 10, agencyPagination.total)} of {agencyPagination.total}</p>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setAgencyCurrentPage(p => Math.max(1, p - 1))} disabled={agencyCurrentPage === 1} className="h-7 w-7 p-0"><ChevronLeft className="w-4 h-4" /></Button>
                  <span className="text-[11px] text-zinc-600 px-2">{agencyCurrentPage} / {agencyPagination.totalPages}</span>
                  <Button variant="ghost" size="sm" onClick={() => setAgencyCurrentPage(p => Math.min(agencyPagination.totalPages, p + 1))} disabled={agencyCurrentPage === agencyPagination.totalPages} className="h-7 w-7 p-0"><ChevronRight className="w-4 h-4" /></Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </Card>
    </div>

    {/* Reply Dialog */}
    <Dialog open={replyOpen} onOpenChange={setReplyOpen}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-500/10 via-fuchsia-500/10 to-blue-500/10 px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-white dark:bg-zinc-800 shadow-sm">
                <Send className="w-4 h-4 text-fuchsia-600" />
              </div>
              Compose Reply
            </DialogTitle>
          </DialogHeader>
        </div>
        
        <div className="p-6 space-y-5">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
            <div className="p-2 rounded-full bg-zinc-200 dark:bg-zinc-700">
              <User className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{replyTarget?.name}</p>
              <p className="text-[11px] text-zinc-500 truncate">{replyTarget?.email}</p>
            </div>
            {replyType === 'agency' && (replyTarget as AgencyMessage)?.companyName && (
              <div className="px-2 py-1 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 text-[11px] font-medium">
                {(replyTarget as AgencyMessage).companyName}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject" className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">Subject</Label>
            <Input 
              id="subject"
              value={replySubject} 
              onChange={(e) => setReplySubject(e.target.value)} 
              placeholder="Enter subject..."
              className="h-10"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="message" className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">Message</Label>
            <Textarea 
              id="message"
              value={replyMessage} 
              onChange={(e) => setReplyMessage(e.target.value)} 
              placeholder="Write your message..."
              rows={8}
              className="resize-none"
            />
          </div>

          {replyError && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-sm">
              <X className="w-4 h-4" />
              {replyError}
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={() => setReplyOpen(false)} disabled={replySending}>
            Cancel
          </Button>
          <Button onClick={sendReply} disabled={replySending} className="min-w-[100px]">
            {replySending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Send
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Permanent Delete Confirmation Modal */}
    <Dialog open={permanentDeleteModal} onOpenChange={setPermanentDeleteModal}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="w-5 h-5" />
            Permanently Delete?
          </DialogTitle>
          <DialogDescription className="pt-2">
            This action cannot be undone. {permanentDeleteIds.length} {permanentDeleteIds.length === 1 ? 'item' : 'items'} will be permanently removed from the database.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4 gap-2">
          <Button variant="ghost" onClick={() => setPermanentDeleteModal(false)} disabled={bulkLoading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirmPermanentDelete} disabled={bulkLoading} className="min-w-[140px]">
            {bulkLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Forever
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
