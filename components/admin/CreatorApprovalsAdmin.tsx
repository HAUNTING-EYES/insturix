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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle2, XCircle, ExternalLink, Youtube, Instagram, Linkedin } from "lucide-react";

interface CreatorApplication {
  _id: string;
  clerkUserId: string;
  name?: string;
  email?: string;
  attendeePassTier: string;
  creatorApproval: {
    status: string;
    socialLinks: {
      youtube?: string;
      instagram?: string;
      linkedin?: string;
    };
    submittedAt: string;
  };
  createdAt: string;
}

export default function CreatorApprovalsAdmin() {
  const [applications, setApplications] = useState<CreatorApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<CreatorApplication | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const { toast } = useToast();

  const fetchApplications = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/ics25/admin/creator-approvals?status=pending");
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data?.message || "Failed to fetch applications");
      }
      
      setApplications(data.attendees || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to load applications",
        variant: "destructive" as any,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, []);

  const handleApprove = async (app: CreatorApplication) => {
    try {
      setProcessing(true);
      const res = await fetch("/api/ics25/admin/creator-approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          attendeeId: app._id,
          action: "approve",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to approve");
      }

      toast({
        title: "Approved!",
        description: `Creator Pass application for ${app.email || app.clerkUserId} has been approved.`,
      });

      // Refresh list
      fetchApplications();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to approve application",
        variant: "destructive" as any,
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedApp || !rejectionReason.trim()) {
      toast({
        title: "Missing reason",
        description: "Please provide a reason for rejection",
        variant: "destructive" as any,
      });
      return;
    }

    try {
      setProcessing(true);
      const res = await fetch("/api/ics25/admin/creator-approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          attendeeId: selectedApp._id,
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
        description: `Application has been rejected.`,
      });

      // Close dialog and refresh list
      setShowRejectDialog(false);
      setSelectedApp(null);
      setRejectionReason("");
      fetchApplications();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to reject application",
        variant: "destructive" as any,
      });
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          Creator Pass Applications
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 mt-2">
          Review and approve Creator Pass applications (10k+ followers required)
        </p>
      </div>

      {applications.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-zinc-600 dark:text-zinc-400">
              No pending applications at the moment
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {applications.map((app) => (
            <Card key={app._id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{app.email || app.clerkUserId}</span>
                  <span className="text-sm font-normal text-zinc-500">
                    {new Date(app.creatorApproval.submittedAt).toLocaleDateString()}
                  </span>
                </CardTitle>
                {app.name && (
                  <CardDescription>{app.name}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Social Links */}
                  <div>
                    <h4 className="font-semibold mb-2 text-sm text-zinc-700 dark:text-zinc-300">
                      Social Media Profiles
                    </h4>
                    <div className="space-y-2">
                      {app.creatorApproval.socialLinks.youtube && (
                        <a
                          href={app.creatorApproval.socialLinks.youtube}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                        >
                          <Youtube className="w-4 h-4 text-red-500" />
                          {app.creatorApproval.socialLinks.youtube}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      {app.creatorApproval.socialLinks.instagram && (
                        <a
                          href={app.creatorApproval.socialLinks.instagram}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                        >
                          <Instagram className="w-4 h-4 text-pink-500" />
                          {app.creatorApproval.socialLinks.instagram}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      {app.creatorApproval.socialLinks.linkedin && (
                        <a
                          href={app.creatorApproval.socialLinks.linkedin}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                        >
                          <Linkedin className="w-4 h-4 text-blue-500" />
                          {app.creatorApproval.socialLinks.linkedin}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={() => handleApprove(app)}
                      disabled={processing}
                      className="bg-green-500 hover:bg-green-600 text-white"
                    >
                      {processing ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                      )}
                      Approve
                    </Button>
                    <Button
                      onClick={() => {
                        setSelectedApp(app);
                        setShowRejectDialog(true);
                      }}
                      disabled={processing}
                      variant="destructive"
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Reject
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Application</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this Creator Pass application.
              This will be shown to the applicant.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="reason">Rejection Reason</Label>
            <Textarea
              id="reason"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g., Follower count does not meet the 10k+ requirement"
              className="mt-2"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowRejectDialog(false);
                setSelectedApp(null);
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
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Rejecting...
                </>
              ) : (
                "Reject Application"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
