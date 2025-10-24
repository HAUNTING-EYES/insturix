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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle2, XCircle, Youtube, Instagram, Linkedin, Users, Clock, Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface CreatorApplication {
  _id: string;
  clerkUserId: string;
  name: string;
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
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
  hasCompletedPayment: boolean;
}

export default function ICS25AdminDashboard() {
  const [activeTab, setActiveTab] = useState("creators");
  const [pendingApps, setPendingApps] = useState<CreatorApplication[]>([]);
  const [approvedApps, setApprovedApps] = useState<CreatorApplication[]>([]);
  const [rejectedApps, setRejectedApps] = useState<CreatorApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<CreatorApplication | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const { toast } = useToast();

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
        variant: "destructive" as any,
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
    setPendingApps(pending);
    setApprovedApps(approved);
    setRejectedApps(rejected);
    setLoading(false);
  };

  useEffect(() => {
    loadAllApplications();
  }, []);

  const handleApprove = async (app: CreatorApplication) => {
    try {
      setProcessing(true);
      const res = await fetch("/api/ics25/admin/creator-approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          creatorId: app._id,
          action: "approve",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to approve");
      }

      toast({
        title: "Approved!",
        description: `Creator Pass application for ${app.name} (${app.email}) has been approved.`,
      });

      await loadAllApplications();
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
        title: "Error",
        description: "Please provide a rejection reason",
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
          creatorId: selectedApp._id,
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
        description: `Application for ${selectedApp.name} (${selectedApp.email}) has been rejected.`,
      });

      setShowRejectDialog(false);
      setSelectedApp(null);
      setRejectionReason("");
      await loadAllApplications();
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

  const openRejectDialog = (app: CreatorApplication) => {
    setSelectedApp(app);
    setShowRejectDialog(true);
  };

  const ApplicationCard = ({ app, showActions = true }: { app: CreatorApplication; showActions?: boolean }) => (
    <Card key={app._id} className="mb-4">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{app.name}</CardTitle>
            <CardDescription>
              {app.email} • {app.phone}
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-2">
            {app.status === 'pending' && <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20"><Clock className="w-3 h-3 mr-1" />Pending</Badge>}
            {app.status === 'approved' && <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle2 className="w-3 h-3 mr-1" />Approved</Badge>}
            {app.status === 'rejected' && <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20"><Ban className="w-3 h-3 mr-1" />Rejected</Badge>}
            {app.hasCompletedPayment && <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">Paid</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">Profession:</span>
            <p className="font-medium">{app.profession}</p>
          </div>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">Organization:</span>
            <p className="font-medium">{app.organization || "N/A"}</p>
          </div>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">Age Group:</span>
            <p className="font-medium">{app.ageGroup}</p>
          </div>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">Location:</span>
            <p className="font-medium">{app.city}, {app.state}</p>
          </div>
        </div>

        <div className="border-t pt-4">
          <h4 className="font-semibold mb-2">Social Media Links</h4>
          <div className="space-y-2">
            {app.socialLinks.youtube && (
              <a 
                href={app.socialLinks.youtube} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-red-600 hover:underline"
              >
                <Youtube className="w-4 h-4" />
                {app.socialLinks.youtube}
              </a>
            )}
            {app.socialLinks.instagram && (
              <a 
                href={app.socialLinks.instagram} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-pink-600 hover:underline"
              >
                <Instagram className="w-4 h-4" />
                {app.socialLinks.instagram}
              </a>
            )}
            {app.socialLinks.linkedin && (
              <a 
                href={app.socialLinks.linkedin} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
              >
                <Linkedin className="w-4 h-4" />
                {app.socialLinks.linkedin}
              </a>
            )}
          </div>
        </div>

        {app.rejectionReason && (
          <div className="border-t pt-4">
            <h4 className="font-semibold mb-2 text-red-600">Rejection Reason</h4>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{app.rejectionReason}</p>
          </div>
        )}

        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          Submitted: {new Date(app.submittedAt).toLocaleString()}
          {app.reviewedAt && ` • Reviewed: ${new Date(app.reviewedAt).toLocaleString()}`}
        </div>

        {showActions && app.status === 'pending' && (
          <div className="flex gap-2 pt-4 border-t">
            <Button 
              onClick={() => handleApprove(app)} 
              disabled={processing}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Approve
            </Button>
            <Button 
              onClick={() => openRejectDialog(app)} 
              disabled={processing}
              variant="destructive"
              className="flex-1"
            >
              <XCircle className="w-4 h-4 mr-2" />
              Reject
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
      </div>
    );
  }

  return (
    <>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-8">
          <TabsTrigger value="creators" className="relative">
            <Clock className="w-4 h-4 mr-2" />
            Pending ({pendingApps.length})
          </TabsTrigger>
          <TabsTrigger value="approved">
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Approved ({approvedApps.length})
          </TabsTrigger>
          <TabsTrigger value="rejected">
            <Ban className="w-4 h-4 mr-2" />
            Rejected ({rejectedApps.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="creators">
          <Card>
            <CardHeader>
              <CardTitle>Pending Creator Applications</CardTitle>
              <CardDescription>
                Review and approve creator pass applications with 10k+ followers
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingApps.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 dark:text-zinc-400">
                  No pending applications
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingApps.map(app => <ApplicationCard key={app._id} app={app} showActions={true} />)}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approved">
          <Card>
            <CardHeader>
              <CardTitle>Approved Creators</CardTitle>
              <CardDescription>
                Creators who have been approved for the Creator Pass
              </CardDescription>
            </CardHeader>
            <CardContent>
              {approvedApps.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 dark:text-zinc-400">
                  No approved applications yet
                </div>
              ) : (
                <div className="space-y-4">
                  {approvedApps.map(app => <ApplicationCard key={app._id} app={app} showActions={false} />)}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rejected">
          <Card>
            <CardHeader>
              <CardTitle>Rejected Applications</CardTitle>
              <CardDescription>
                Applications that did not meet the eligibility criteria
              </CardDescription>
            </CardHeader>
            <CardContent>
              {rejectedApps.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 dark:text-zinc-400">
                  No rejected applications
                </div>
              ) : (
                <div className="space-y-4">
                  {rejectedApps.map(app => <ApplicationCard key={app._id} app={app} showActions={false} />)}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Creator Application</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting {selectedApp?.name}'s application. This will be shown to the user.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="e.g., Follower count requirement not met (minimum 10k followers required on any platform)"
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
              {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Reject Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
