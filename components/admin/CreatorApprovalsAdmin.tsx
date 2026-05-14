"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle, ExternalLink, Youtube, Instagram, Linkedin, Clock, Ban, ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import AdminBackButton from "@/components/admin/AdminBackButton";

interface CreatorApplication {
  _id: string;
  clerkUserId: string;
  name: string;
  displayName?: string;
  email: string;
  phone: string;
  instagram: string;
  linkedin: string;
  organization?: string;
  profession: string;
  ageGroup: string;
  city: string;
  state: string;
  socialLinks: {
    youtube?: string;
    instagram?: string;
    linkedin?: string;
  };
  attendeeName?: string;
  attendeeEmail?: string;
  attendeePhone?: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
}

export default function CreatorApprovalsAdmin() {
  const [expandedStatus, setExpandedStatus] = useState<'pending' | 'approved' | 'rejected' | null>('pending');
  const [applications, setApplications] = useState<CreatorApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [displayLimit, setDisplayLimit] = useState<Record<string, number>>({
    'pending': 10,
    'approved': 10,
    'rejected': 10,
  });
  const [selectedApplication, setSelectedApplication] = useState<CreatorApplication | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  const getDisplayName = (app?: CreatorApplication | null) => {
    if (!app) return 'Unnamed Creator';
    const { displayName, name } = app;
    const candidate = [displayName, name]
      .map((value) => (value ?? '').trim())
      .find((value) => value.length > 0);
    return candidate || 'Unnamed Creator';
  };

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

  const mergeCreators = (base: CreatorApplication, incoming?: Partial<CreatorApplication>): CreatorApplication => ({
    ...base,
    ...(incoming ?? {}),
    socialLinks: {
      ...base.socialLinks,
      ...(incoming?.socialLinks ?? {}),
    },
  });

  const updateApplicationInState = (creatorId: string, patch: Partial<CreatorApplication>) => {
    setApplications((prev) => prev.map((app) => (
      app._id === creatorId ? mergeCreators(app, patch) : app
    )));
  };

  const closeRejectDialog = () => {
    setShowRejectDialog(false);
    setSelectedApplication(null);
    setRejectionReason("");
  };

  const fetchApplications = async (status: string) => {
    try {
      const res = await fetch(`/api/ics25/admin/creator-approvals?status=${status}`);
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data?.message || "Failed to fetch applications");
      }
      
      return data.creators || [];
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to load applications",
        variant: "destructive",
      });
      return [];
    }
  };

  const loadAllApplications = async () => {
    setLoading(true);
    const [pending, approved, rejected] = await Promise.all([
      fetchApplications('pending'),
      fetchApplications('approved'),
      fetchApplications('rejected'),
    ]);
    
    const allApps = [...pending, ...approved, ...rejected];
    setApplications(allApps);
    setLoading(false);
  };

  useEffect(() => {
    loadAllApplications();
  }, []);

  const handleApprove = async (app: CreatorApplication) => {
    try {
      setProcessing(true);
      const creatorName = getDisplayName(app);
      const res = await fetch("/api/ics25/admin/approve-creator-upgrade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          creatorUserId: app.clerkUserId,
          approved: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to approve");
      }

      await loadAllApplications();

      const manualRefundNeeded = data?.requiresManualRefund;
      const refundAmount = typeof data?.refundAmount === 'number' ? data.refundAmount : undefined;

      toast({
        title: manualRefundNeeded ? "Approved – manual refund required" : "Approved!",
        description:
          data?.message
            || (manualRefundNeeded
              ? `Creator Pass application for ${creatorName} was approved. Please process the refund manually${refundAmount ? ` (₹${refundAmount})` : ''}.`
              : `Creator Pass application for ${creatorName} has been approved${refundAmount ? ` with a ₹${refundAmount} refund.` : '.'}`),
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to approve application",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedApplication) {
      toast({
        title: "Error",
        description: "No application selected",
        variant: "destructive",
      });
      return;
    }

    const reason = rejectionReason.trim();
    if (!reason) {
      toast({
        title: "Error",
        description: "Please provide a rejection reason",
        variant: "destructive",
      });
      return;
    }

    const creatorName = getDisplayName(selectedApplication);

    try {
      setProcessing(true);

      const res = await fetch("/api/ics25/admin/creator-approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          creatorId: selectedApplication._id,
          action: "reject",
          rejectionReason: reason,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to reject");
      }

      const updatedCreator = data?.creator as CreatorApplication | undefined;
      if (updatedCreator) {
        updateApplicationInState(updatedCreator._id, updatedCreator);
      } else {
        updateApplicationInState(selectedApplication._id, {
          status: 'rejected',
          rejectionReason: reason,
          reviewedAt: new Date().toISOString(),
        });
      }

      toast({
        title: "Rejected",
        description: `Creator Pass application for ${creatorName} has been rejected.`,
      });

      closeRejectDialog();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to reject application",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleRevert = async (app: CreatorApplication) => {
    try {
      setProcessing(true);
      const res = await fetch("/api/ics25/admin/creator-approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          creatorId: app._id,
          action: "revert",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to revert");
      }

      const updatedCreator = data?.creator as CreatorApplication | undefined;
      if (updatedCreator) {
        updateApplicationInState(updatedCreator._id, updatedCreator);
      } else {
        updateApplicationInState(app._id, {
          status: 'pending',
          reviewedAt: undefined,
          reviewedBy: undefined,
          rejectionReason: undefined,
        });
      }

      toast({
        title: "Reverted",
        description: `Application for ${app.name} has been reverted to pending.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to revert application",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const openRejectDialog = (app: CreatorApplication) => {
    setSelectedApplication(app);
    setRejectionReason(app.rejectionReason ?? "");
    setShowRejectDialog(true);
  };

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const pendingCount = applications.filter((app) => app.status === 'pending').length;
  const approvedCount = applications.filter((app) => app.status === 'approved').length;
  const rejectedCount = applications.filter((app) => app.status === 'rejected').length;

  const renderExpandedSection = () => {
    if (expandedStatus === null) {
      return null;
    }

    const statusLabel = expandedStatus as 'pending' | 'approved' | 'rejected';
    const statusTitle = statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1);
    const countMap = {
      pending: pendingCount,
      approved: approvedCount,
      rejected: rejectedCount,
    } as const;

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {statusLabel === 'pending' && <Clock className="w-5 h-5 text-yellow-500" />}
            {statusLabel === 'approved' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
            {statusLabel === 'rejected' && <Ban className="w-5 h-5 text-red-500" />}
            <span>{statusTitle} Applications</span>
          </CardTitle>
          <CardDescription>
            {statusLabel === 'pending' && `Approve or reject ${countMap.pending} pending creator applications`}
            {statusLabel === 'approved' && `${countMap.approved} approved creator applications`}
            {statusLabel === 'rejected' && `${countMap.rejected} rejected creator applications`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ApplicationTable apps={applications} status={statusLabel} />
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
      </div>
    );
  }

  const ApplicationTable = ({ apps, status }: { apps: CreatorApplication[]; status: 'pending' | 'approved' | 'rejected' }) => {
    const filteredApps = apps.filter((a) => a.status === status);
    const key = status;
    const currentLimit = displayLimit[key] || 10;
    const displayedApps = filteredApps.slice(0, currentLimit);
    const hasMore = filteredApps.length > currentLimit;

    if (filteredApps.length === 0) {
      return (
        <div className="py-8 text-center text-zinc-500 dark:text-zinc-400">
          No {status} applications
        </div>
      );
    }

    const statusPill = (appStatus: CreatorApplication['status']) => {
      const base = "inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-medium capitalize";
      if (appStatus === 'approved') return `${base} border-emerald-400 text-emerald-600 dark:text-emerald-300`;
      if (appStatus === 'rejected') return `${base} border-red-400 text-red-600 dark:text-red-300`;
      return `${base} border-yellow-400 text-yellow-600 dark:text-yellow-300`;
    };

    return (
      <div className="space-y-4">
        {displayedApps.map((app) => {
          const isExpanded = expandedRows[app._id] ?? false;
          const submittedLabel = formatDateTime(app.submittedAt);
          const reviewedLabel = formatDateTime(app.reviewedAt);
          const statusLabel = app.status.charAt(0).toUpperCase() + app.status.slice(1);

          const displayName = getDisplayName(app);
          return (
            <Card key={app._id} className="transition-shadow hover:shadow-md">
              <div className="p-4 space-y-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
                  <div className="flex-1 space-y-1">
                    <p className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">{displayName}</p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">{app.email}</p>
                    <p className="text-[11px] uppercase tracking-wide text-zinc-400">
                      {app.profession}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400 min-w-[180px]">
                    <span>Instagram: {app.instagram || '—'}</span>
                    <span>LinkedIn: {app.linkedin || '—'}</span>
                  </div>
                  <div className="flex flex-col gap-1 text-sm text-zinc-500 dark:text-zinc-400 min-w-[170px]">
                    <span>Submitted: {formatDate(app.submittedAt)}</span>
                    {app.reviewedAt && <span>Reviewed: {formatDate(app.reviewedAt)}</span>}
                  </div>
                  <div className="flex items-start gap-2 ml-auto">
                    {status === 'pending' ? (
                      <>
                        <Button
                          onClick={() => handleApprove(app)}
                          disabled={processing}
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Approve
                        </Button>
                        <Button
                          onClick={() => openRejectDialog(app)}
                          disabled={processing}
                          variant="destructive"
                          size="sm"
                        >
                          <XCircle className="mr-2 h-4 w-4" />
                          Reject
                        </Button>
                      </>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className={statusPill(app.status)}>
                          {statusLabel}
                        </span>
                        <Button
                          onClick={() => handleRevert(app)}
                          disabled={processing}
                          variant="outline"
                          size="sm"
                        >
                          Revert
                        </Button>
                      </div>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-sky-600 hover:text-sky-700"
                      onClick={() => toggleRow(app._id)}
                    >
                      <span className="mr-1 text-sm">{isExpanded ? 'Hide' : 'View'} details</span>
                      <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </Button>
                  </div>
                </div>

                {app.status !== 'pending' && (
                  <div className={`rounded-lg border p-3 text-sm ${app.status === 'approved' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300'}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      {app.status === 'approved' ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                      <span className="font-medium capitalize">{statusLabel}</span>
                      {(reviewedLabel || app.reviewedBy) && (
                        <span className="text-[11px] text-zinc-700 dark:text-zinc-300">
                          {reviewedLabel && `on ${reviewedLabel}`}
                          {app.reviewedBy && ` by ${app.reviewedBy}`}
                        </span>
                      )}
                    </div>
                    {app.status === 'rejected' && app.rejectionReason && (
                      <p className="mt-2 text-[11px]">Reason: {app.rejectionReason}</p>
                    )}
                  </div>
                )}

                {isExpanded && (
                  <div className="space-y-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                    <div className="grid gap-4 text-sm text-zinc-600 dark:text-zinc-400 md:grid-cols-2">
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Phone</p>
                        <p>{app.phone}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Location</p>
                        <p>{app.city}, {app.state}</p>
                      </div>
                      {app.organization && (
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Organization</p>
                          <p>{app.organization}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Age Group</p>
                        <p>{app.ageGroup}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Clerk User ID</p>
                        <p className="font-mono text-[11px] break-all text-zinc-700 dark:text-zinc-300">{app.clerkUserId}</p>
                      </div>
                      {app.reviewedBy && (
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Reviewed By</p>
                          <p>{app.reviewedBy}</p>
                        </div>
                      )}
                      {reviewedLabel && (
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Reviewed At</p>
                          <p>{reviewedLabel}</p>
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Social Links</p>
                      <div className="space-y-2">
                        {app.socialLinks.youtube && (
                          <a
                            href={app.socialLinks.youtube}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm text-blue-600 hover:underline dark:text-blue-400"
                          >
                            <Youtube className="h-4 w-4 text-red-500" />
                            <span className="truncate">{app.socialLinks.youtube}</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {app.socialLinks.instagram && (
                          <a
                            href={app.socialLinks.instagram}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm text-pink-600 hover:underline dark:text-pink-400"
                          >
                            <Instagram className="h-4 w-4 text-pink-500" />
                            <span className="truncate">{app.socialLinks.instagram}</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {app.socialLinks.linkedin && (
                          <a
                            href={app.socialLinks.linkedin}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm text-blue-600 hover:underline dark:text-blue-400"
                          >
                            <Linkedin className="h-4 w-4 text-blue-500" />
                            <span className="truncate">{app.socialLinks.linkedin}</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Submitted: {submittedLabel ?? '—'}
                      {reviewedLabel && ` • Reviewed: ${reviewedLabel}`}
                      {app.reviewedBy && ` • By ${app.reviewedBy}`}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          );
        })}

        {hasMore && (
          <div className="flex justify-center pt-4">
            <Button
              variant="outline"
              onClick={() =>
                setDisplayLimit({
                  ...displayLimit,
                  [key]: currentLimit + 10,
                })
              }
            >
              Load 10 More ({currentLimit} of {filteredApps.length})
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6">
        <AdminBackButton />
      </div>
      <div className="mb-8">
        <h1 className="text-[32px] font-bold text-zinc-900 dark:text-zinc-100">
          Creator Pass Applications
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 mt-2">
          Review and approve Creator Pass applications (10k+ followers required)
        </p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card 
          className="border-l-4 border-l-yellow-500 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setExpandedStatus(expandedStatus === 'pending' ? null : 'pending')}
        >
          <CardContent className="p-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Pending</p>
            <p className="text-2xl font-bold mt-1">{pendingCount}</p>
            <p className="text-[11px] text-zinc-400 mt-2">Click to {expandedStatus === 'pending' ? 'collapse' : 'expand'}</p>
          </CardContent>
        </Card>
        <Card 
          className="border-l-4 border-l-green-500 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setExpandedStatus(expandedStatus === 'approved' ? null : 'approved')}
        >
          <CardContent className="p-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Approved</p>
            <p className="text-2xl font-bold mt-1">{approvedCount}</p>
            <p className="text-[11px] text-zinc-400 mt-2">Click to {expandedStatus === 'approved' ? 'collapse' : 'expand'}</p>
          </CardContent>
        </Card>
        <Card 
          className="border-l-4 border-l-red-500 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setExpandedStatus(expandedStatus === 'rejected' ? null : 'rejected')}
        >
          <CardContent className="p-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Rejected</p>
            <p className="text-2xl font-bold mt-1">{rejectedCount}</p>
            <p className="text-[11px] text-zinc-400 mt-2">Click to {expandedStatus === 'rejected' ? 'collapse' : 'expand'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Expanded Section */}
      {renderExpandedSection()}

      <Dialog
        open={showRejectDialog}
        onOpenChange={(open) => {
          if (!open) {
            closeRejectDialog();
          } else {
            setShowRejectDialog(true);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Creator Application</DialogTitle>
            <DialogDescription>
              {selectedApplication
                ? `Provide a rejection reason for ${getDisplayName(selectedApplication)}. This will be shared with the applicant.`
                : "Provide a rejection reason. This will be shared with the applicant."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="e.g., Follower count requirement not met (minimum 10k followers on any platform)"
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeRejectDialog}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={processing || !rejectionReason.trim()}
            >
              {processing ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <XCircle className="w-4 h-4 mr-2" />
              )}
              Reject Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
