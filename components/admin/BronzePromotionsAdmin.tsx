"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AdminBackButton from "@/components/admin/AdminBackButton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle2, XCircle, ExternalLink, Instagram, Linkedin, ChevronDown } from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

interface BronzeSubmission {
  _id: string;
  clerkUserId: string;
  name?: string;
  displayName?: string;
  email?: string;
  phone?: string;
  instagramProofUrl?: string;
  linkedinProofUrl?: string;
  status: 'submitted' | 'verified' | 'rejected';
  rejectionReason?: string;
  createdAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  instagramHandle?: string;
  linkedinHandle?: string;
  source?: 'submission' | 'submission+attendee' | 'attendee';
}

export default function BronzePromotionsAdmin() {
  const [submissions, setSubmissions] = useState<BronzeSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState<BronzeSubmission | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'submitted' | 'verified' | 'rejected'>("submitted");
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const abortControllerRef = useRef<AbortController | null>(null);
  const latestRequestRef = useRef<symbol | null>(null);
  const { toast } = useToast();

  const formatDate = (value?: string) => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
  };

  const formatDateTime = (value?: string) => {
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toLocaleString();
  };

  const getDisplayName = (submission: BronzeSubmission) =>
    submission.displayName || submission.name || submission.email || "Unknown";

  const getToastLabel = (submission: BronzeSubmission) =>
    getDisplayName(submission) || submission._id;

  const getSourceLabel = (source?: BronzeSubmission['source']) => {
    switch (source) {
      case 'submission+attendee':
        return 'Submission + attendee record';
      case 'attendee':
        return 'Attendee record';
      default:
        return 'Submission record';
    }
  };

  const fetchSubmissions = useCallback(async (status: BronzeSubmission['status']) => {
    // cancel any in-flight request to avoid stale data
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const requestId = Symbol(status);
    latestRequestRef.current = requestId;

    try {
      setLoading(true);
      setSubmissions([]);
      const res = await fetch(`/api/ics25/admin/bronze-promotions?status=${status}`, {
        signal: controller.signal,
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data?.message || "Failed to fetch submissions");
      }
      
      if (latestRequestRef.current !== requestId) {
        return;
      }

      const entries = (data.submissions || []) as BronzeSubmission[];
      const filtered = entries.filter((entry) => entry.status === status);

      setSubmissions(filtered);
      setExpandedRows({});
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        return;
      }

      if (latestRequestRef.current !== requestId) {
        return;
      }

      toast({
        title: "Error",
        description: error?.message || "Failed to load submissions",
        variant: "destructive" as any,
      });
    } finally {
      if (latestRequestRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [toast]);

  useEffect(() => {
    fetchSubmissions(activeTab);

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [activeTab, fetchSubmissions]);

  const handleApprove = async (submission: BronzeSubmission) => {
    try {
      setProcessing(true);
      const res = await fetch("/api/ics25/admin/bronze-promotions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          submissionId: submission._id,
          action: "approve",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to approve");
      }

      toast({
        title: "Approved!",
        description: `Bronze promotion for ${getToastLabel(submission)} has been approved.`,
      });

      // Refresh list
      fetchSubmissions(activeTab);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to approve submission",
        variant: "destructive" as any,
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedSubmission || !rejectionReason.trim()) {
      toast({
        title: "Missing reason",
        description: "Please provide a reason for rejection",
        variant: "destructive" as any,
      });
      return;
    }

    try {
      setProcessing(true);
      const res = await fetch("/api/ics25/admin/bronze-promotions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          submissionId: selectedSubmission._id,
          action: "reject",
          rejectionReason: rejectionReason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to reject");
      }

      toast({
        title: "Rejected",
        description: "Submission has been rejected.",
      });

      // Close dialog and refresh list
      setShowRejectDialog(false);
      setSelectedSubmission(null);
      setRejectionReason("");
      fetchSubmissions(activeTab);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to reject submission",
        variant: "destructive" as any,
      });
    } finally {
      setProcessing(false);
    }
  };

  const openRejectDialog = (submission: BronzeSubmission) => {
    setSelectedSubmission(submission);
    setShowRejectDialog(true);
  };

  const handleRevert = async (submission: BronzeSubmission) => {
    try {
      setProcessing(true);
      const res = await fetch("/api/ics25/admin/bronze-promotions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          submissionId: submission._id,
          action: "revert",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to revert submission");
      }

      toast({
        title: "Reverted",
        description: `${getToastLabel(submission)} moved back to pending review.`,
      });

      fetchSubmissions(activeTab);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to revert submission",
        variant: "destructive" as any,
      });
    } finally {
      setProcessing(false);
    }
  };

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleTabChange = (value: string) => {
    if (value === activeTab) {
      fetchSubmissions(activeTab);
      return;
    }

    if (value === 'submitted' || value === 'verified' || value === 'rejected') {
      setActiveTab(value);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6">
        <AdminBackButton />
      </div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          Bronze Pass Promotions
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 mt-2">
          Review Instagram and LinkedIn promotion submissions for Bronze Pass approval
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="mb-6">
          <TabsTrigger value="submitted">Pending Review</TabsTrigger>
          <TabsTrigger value="verified">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab}>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
            </div>
          ) : submissions.length === 0 ? (
            <Card>
              <div className="py-12 text-center">
                <p className="text-zinc-600 dark:text-zinc-400">
                  No {activeTab === 'submitted' ? 'pending' : activeTab} submissions
                </p>
              </div>
            </Card>
          ) : (
            <div className="grid gap-4">
              {submissions.map((submission) => {
                const isExpanded = expandedRows[submission._id] ?? false;
                const displayName = getDisplayName(submission);
                const instagramLabel = submission.instagramHandle || (submission.instagramProofUrl ? "Link provided" : "—");
                const linkedinLabel = submission.linkedinHandle || (submission.linkedinProofUrl ? "Link provided" : "—");
                const canRevert = submission.status !== 'submitted' && submission.source !== 'attendee';

                return (
                  <Card key={submission._id}>
                    <div className="p-4 space-y-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-6">
                        <div className="flex-1 space-y-1">
                          <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{displayName}</p>
                          {submission.email && (
                            <p className="text-sm text-zinc-500 dark:text-zinc-400">{submission.email}</p>
                          )}
                          <p className="text-xs uppercase tracking-wide text-zinc-400 mt-1">
                            {getSourceLabel(submission.source)}
                          </p>
                        </div>
                        <div className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400 min-w-[180px]">
                          <span>Instagram: {instagramLabel}</span>
                          <span>LinkedIn: {linkedinLabel}</span>
                        </div>
                        <div className="flex flex-col items-start gap-2 text-sm text-zinc-500 dark:text-zinc-400 min-w-[160px]">
                          <span>Submitted: {formatDate(submission.createdAt)}</span>
                          {submission.status !== 'submitted' && (
                            <span className="inline-flex items-center rounded-full border border-zinc-200 dark:border-zinc-700 px-2 py-1 text-xs font-medium capitalize text-zinc-600 dark:text-zinc-300">
                              {submission.status === 'verified' ? 'approved' : submission.status}
                            </span>
                          )}
                        </div>
                        <div className="flex items-start gap-2 ml-auto">
                          {submission.status === 'submitted' && (
                            <>
                              <Button
                                onClick={() => handleApprove(submission)}
                                disabled={processing}
                                className="bg-emerald-600 hover:bg-emerald-700"
                              >
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                Approve
                              </Button>
                              <Button
                                onClick={() => openRejectDialog(submission)}
                                disabled={processing}
                                variant="destructive"
                              >
                                <XCircle className="w-4 h-4 mr-2" />
                                Reject
                              </Button>
                            </>
                          )}
                          {canRevert && (
                            <Button
                              onClick={() => handleRevert(submission)}
                              disabled={processing}
                              variant="outline"
                            >
                              Revert
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-sky-600 hover:text-sky-700"
                            onClick={() => toggleRow(submission._id)}
                          >
                            <span className="mr-1 text-sm">{isExpanded ? "Hide" : "View"} details</span>
                            <ChevronDown
                              className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                            />
                          </Button>
                        </div>
                      </div>

                      {submission.status !== 'submitted' && (
                        <div className={`rounded-lg border p-3 text-sm ${submission.status === 'verified' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'}`}>
                          <div className="flex flex-wrap items-center gap-2">
                            {submission.status === 'verified' ? (
                              <CheckCircle2 className="w-4 h-4" />
                            ) : (
                              <XCircle className="w-4 h-4" />
                            )}
                            <span className="font-medium capitalize">{submission.status === 'verified' ? 'Approved' : 'Rejected'}</span>
                            {(submission.reviewedAt || submission.reviewedBy) && (
                              <span className="text-xs text-zinc-700 dark:text-zinc-300">
                                {submission.reviewedAt && `on ${formatDate(submission.reviewedAt)}`}
                                {submission.reviewedBy && ` by ${submission.reviewedBy}`}
                              </span>
                            )}
                          </div>
                          {submission.status === 'rejected' && submission.rejectionReason && (
                            <p className="mt-2 text-xs text-zinc-700 dark:text-zinc-300">
                              Reason: {submission.rejectionReason}
                            </p>
                          )}
                        </div>
                      )}

                      {isExpanded && (
                        <div className="space-y-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                          <div className="grid gap-4 text-sm text-zinc-600 dark:text-zinc-400 md:grid-cols-2">
                            <div>
                              <p className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Clerk User ID</p>
                              <p className="font-mono text-xs break-all text-zinc-700 dark:text-zinc-300">
                                {submission.clerkUserId}
                              </p>
                            </div>
                            {submission.phone && (
                              <div>
                                <p className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Phone</p>
                                <p>{submission.phone}</p>
                              </div>
                            )}
                            {submission.reviewedBy && (
                              <div>
                                <p className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Reviewed By</p>
                                <p>{submission.reviewedBy}</p>
                              </div>
                            )}
                            {formatDateTime(submission.reviewedAt) && (
                              <div>
                                <p className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Reviewed At</p>
                                <p>{formatDateTime(submission.reviewedAt)}</p>
                              </div>
                            )}
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                              <div className="flex items-center gap-2 mb-2">
                                <Instagram className="w-5 h-5 text-pink-500" />
                                <span className="font-medium">Instagram Promotion</span>
                              </div>
                              {submission.instagramProofUrl ? (
                                <a
                                  href={submission.instagramProofUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm text-sky-600 hover:underline flex items-center gap-1"
                                >
                                  View Post
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              ) : (
                                <div className="text-sm text-zinc-500">Not provided</div>
                              )}
                            </div>

                            <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                              <div className="flex items-center gap-2 mb-2">
                                <Linkedin className="w-5 h-5 text-blue-600" />
                                <span className="font-medium">LinkedIn Post</span>
                              </div>
                              {submission.linkedinProofUrl ? (
                                <a
                                  href={submission.linkedinProofUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm text-sky-600 hover:underline flex items-center gap-1"
                                >
                                  View Post
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              ) : (
                                <div className="text-sm text-zinc-500">Not provided</div>
                              )}
                            </div>
                          </div>

                          <div className="text-xs text-zinc-500 dark:text-zinc-400">
                            Submitted: {formatDateTime(submission.createdAt) ?? '—'}
                            {submission.reviewedAt && ` • Reviewed: ${formatDateTime(submission.reviewedAt)}`}
                            {submission.reviewedBy && ` • By ${submission.reviewedBy}`}
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Submission</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this submission. The user will see this message.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="e.g., Posts don't properly tag Insturix, content unclear, etc."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowRejectDialog(false);
                setSelectedSubmission(null);
                setRejectionReason("");
              }}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={processing || !rejectionReason.trim()}
            >
              {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <XCircle className="w-4 h-4 mr-2" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
