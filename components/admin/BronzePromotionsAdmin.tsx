"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { 
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle2, XCircle, ExternalLink, Instagram, Linkedin } from "lucide-react";
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
  email?: string;
  phone?: string;
  instagramProofUrl: string;
  linkedinProofUrl: string;
  status: 'submitted' | 'verified' | 'rejected';
  rejectionReason?: string;
  createdAt: string;
  reviewedAt?: string;
}

export default function BronzePromotionsAdmin() {
  const [submissions, setSubmissions] = useState<BronzeSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState<BronzeSubmission | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState("submitted");
  const { toast } = useToast();

  const fetchSubmissions = async (status: string = 'submitted') => {
    try {
      setLoading(true);
      const res = await fetch(`/api/ics25/admin/bronze-promotions?status=${status}`);
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data?.message || "Failed to fetch submissions");
      }
      
      setSubmissions(data.submissions || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to load submissions",
        variant: "destructive" as any,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmissions(activeTab);
  }, [activeTab]);

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
        description: `Bronze promotion for ${submission.email || submission.name} has been approved.`,
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

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          Bronze Pass Promotions
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 mt-2">
          Review Instagram and LinkedIn promotion submissions for Bronze Pass approval
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
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
              <CardContent className="py-12 text-center">
                <p className="text-zinc-600 dark:text-zinc-400">
                  No {activeTab === 'submitted' ? 'pending' : activeTab} submissions
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {submissions.map((submission) => (
                <Card key={submission._id}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div>
                        <div>{submission.name || submission.email || 'Unknown'}</div>
                        {submission.email && (
                          <div className="text-sm font-normal text-zinc-500 mt-1">
                            {submission.email}
                          </div>
                        )}
                      </div>
                      <span className="text-sm font-normal text-zinc-500">
                        {new Date(submission.createdAt).toLocaleDateString()}
                      </span>
                    </CardTitle>
                    {submission.phone && (
                      <CardDescription>
                        Phone: {submission.phone}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {/* Promotion Links */}
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Instagram className="w-5 h-5 text-pink-500" />
                            <span className="font-medium">Instagram Promotion</span>
                          </div>
                          <a
                            href={submission.instagramProofUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-sky-600 hover:underline flex items-center gap-1"
                          >
                            View Post
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>

                        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Linkedin className="w-5 h-5 text-blue-600" />
                            <span className="font-medium">LinkedIn Post</span>
                          </div>
                          <a
                            href={submission.linkedinProofUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-sky-600 hover:underline flex items-center gap-1"
                          >
                            View Post
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>

                      {/* Status & Actions */}
                      {submission.status === 'submitted' && (
                        <div className="flex gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                          <Button
                            onClick={() => handleApprove(submission)}
                            disabled={processing}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                          >
                            <CheckCircle2 className="w-4 h-4 mr-2" />
                            Approve
                          </Button>
                          <Button
                            onClick={() => openRejectDialog(submission)}
                            disabled={processing}
                            variant="destructive"
                            className="flex-1"
                          >
                            <XCircle className="w-4 h-4 mr-2" />
                            Reject
                          </Button>
                        </div>
                      )}

                      {submission.status === 'verified' && (
                        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
                          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-5 h-5" />
                            <span className="font-medium">Approved</span>
                            {submission.reviewedAt && (
                              <span className="text-sm ml-auto">
                                {new Date(submission.reviewedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {submission.status === 'rejected' && (
                        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                          <div className="flex items-center gap-2 text-red-600 dark:text-red-400 mb-2">
                            <XCircle className="w-5 h-5" />
                            <span className="font-medium">Rejected</span>
                            {submission.reviewedAt && (
                              <span className="text-sm ml-auto">
                                {new Date(submission.reviewedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          {submission.rejectionReason && (
                            <p className="text-sm text-zinc-700 dark:text-zinc-300 mt-2">
                              Reason: {submission.rejectionReason}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
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
