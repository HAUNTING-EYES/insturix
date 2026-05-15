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
import { Loader2, CheckCircle2, XCircle, Clock, Ban, ExternalLink, Instagram, Linkedin } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface CashbackTask {
  _id: string;
  userId: string;
  userEmail: string;
  userName: string;
  game: 'valorant' | 'bgmi';
  taskType: 'instagram_story' | 'instagram_post' | 'linkedin_post';
  submissionUrl: string;
  screenshotUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
}

export default function CashbackTasksManager() {
  const [activeTab, setActiveTab] = useState("instagram");
  const [expandedStatus, setExpandedStatus] = useState<'pending' | 'approved' | 'rejected' | null>('pending');
  const [instaTasks, setInstaTasks] = useState<CashbackTask[]>([]);
  const [linkedinTasks, setLinkedinTasks] = useState<CashbackTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [displayLimit, setDisplayLimit] = useState<Record<string, number>>({
    'instagram-pending': 10,
    'instagram-approved': 10,
    'instagram-rejected': 10,
    'linkedin-pending': 10,
    'linkedin-approved': 10,
    'linkedin-rejected': 10,
  });
  const { toast } = useToast();

  const fetchTasks = async (status: string) => {
    try {
      const res = await fetch(`/api/ics25/admin/cashback-tasks?status=${status}`);
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data?.message || "Failed to fetch tasks");
      }
      
      return data.tasks || [];
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to load tasks",
        variant: "destructive",
      });
      return [];
    }
  };

  const loadAllTasks = async () => {
    setLoading(true);
    const [pending, approved, rejected] = await Promise.all([
      fetchTasks('pending'),
      fetchTasks('approved'),
      fetchTasks('rejected'),
    ]);
    
    const allTasks = [...pending, ...approved, ...rejected];
    const insta = allTasks.filter(t => t.taskType.includes('instagram'));
    const linkedin = allTasks.filter(t => t.taskType === 'linkedin_post');
    
    setInstaTasks(insta);
    setLinkedinTasks(linkedin);
    setLoading(false);
  };

  useEffect(() => {
    loadAllTasks();
  }, []);

  const handleApprove = async (task: CashbackTask) => {
    try {
      setProcessing(true);
      const res = await fetch("/api/ics25/admin/cashback-tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          taskId: task._id,
          action: "approve",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to approve");
      }

      toast({
        title: "Approved!",
        description: `Cashback task for ${task.userName} has been approved.`,
      });

      // Update state dynamically without reloading
      const isInsta = task.taskType.includes('instagram');
      const tasksArray = isInsta ? instaTasks : linkedinTasks;
      const updatedTasks = tasksArray.map(t => 
        t._id === task._id ? { ...t, status: 'approved' as const } : t
      );
      
      if (isInsta) {
        setInstaTasks(updatedTasks);
      } else {
        setLinkedinTasks(updatedTasks);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to approve task",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (task: CashbackTask) => {
    try {
      setProcessing(true);

      const res = await fetch("/api/ics25/admin/cashback-tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          taskId: task._id,
          action: "reject",
          rejectionReason: "Task rejected by admin",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to reject");
      }

      toast({
        title: "Rejected",
        description: `Task submission for ${task.userName} has been rejected.`,
      });

      // Update state dynamically without reloading
      const isInsta = task.taskType.includes('instagram');
      const tasksArray = isInsta ? instaTasks : linkedinTasks;
      const updatedTasks = tasksArray.map(t => 
        t._id === task._id ? { ...t, status: 'rejected' as const } : t
      );
      
      if (isInsta) {
        setInstaTasks(updatedTasks);
      } else {
        setLinkedinTasks(updatedTasks);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to reject task",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleRevert = async (task: CashbackTask) => {
    try {
      setProcessing(true);
      const res = await fetch("/api/ics25/admin/cashback-tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          taskId: task._id,
          action: "revert",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to revert");
      }

      toast({
        title: "Reverted",
        description: `Task status for ${task.userName} has been reverted to pending.`,
      });

      // Update state dynamically - move back to pending
      const isInsta = task.taskType.includes('instagram');
      const tasksArray = isInsta ? instaTasks : linkedinTasks;
      const updatedTasks = tasksArray.map(t => 
        t._id === task._id ? { ...t, status: 'pending' as const } : t
      );
      
      if (isInsta) {
        setInstaTasks(updatedTasks);
      } else {
        setLinkedinTasks(updatedTasks);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to revert task",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const TaskTable = ({ tasks, status, tab }: { tasks: CashbackTask[]; status: 'pending' | 'approved' | 'rejected'; tab: 'instagram' | 'linkedin' }) => {
    const filteredTasks = tasks.filter(t => t.status === status);
    const key = `${tab}-${status}`;
    const currentLimit = displayLimit[key] || 10;
    const displayedTasks = filteredTasks.slice(0, currentLimit);
    const hasMore = filteredTasks.length > currentLimit;
    
    if (filteredTasks.length === 0) {
      return (
        <div className="text-center py-8 text-zinc-500 dark:text-zinc-400">
          No {status} tasks
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th className="text-left px-4 py-3 font-semibold text-sm">User</th>
                <th className="text-left px-4 py-3 font-semibold text-sm">Game</th>
                <th className="text-left px-4 py-3 font-semibold text-sm">Proof Link</th>
                <th className="text-left px-4 py-3 font-semibold text-sm">Submitted</th>
                <th className="text-left px-4 py-3 font-semibold text-sm">Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedTasks.map((task) => (
                <tr key={task._id} className="border-b border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{task.userName}</p>
                      <p className="text-[11px] text-zinc-500">{task.userEmail}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="uppercase text-[11px]">{task.game}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <a 
                      href={task.submissionUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 text-sm font-medium group"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span className="truncate max-w-xs group-hover:underline">
                        {new URL(task.submissionUrl).hostname}
                      </span>
                    </a>
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                    {new Date(task.submittedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {status === 'pending' && (
                      <div className="flex gap-2">
                        <Button 
                          onClick={() => handleApprove(task)} 
                          disabled={processing}
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 h-8"
                        >
                          {processing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                          Approve
                        </Button>
                        <Button 
                          onClick={() => handleReject(task)} 
                          disabled={processing}
                          variant="destructive"
                          size="sm"
                          className="h-8"
                        >
                          <XCircle className="w-3 h-3" />
                          Reject
                        </Button>
                      </div>
                    )}
                    {status === 'approved' && (
                      <div className="flex gap-2">
                        <Badge className="bg-green-600 text-white">Approved</Badge>
                        <Button 
                          onClick={() => handleRevert(task)} 
                          disabled={processing}
                          variant="outline"
                          size="sm"
                          className="h-8 text-[11px]"
                        >
                          Revert
                        </Button>
                      </div>
                    )}
                    {status === 'rejected' && (
                      <div className="flex gap-2">
                        <Badge className="bg-red-600 text-white">Rejected</Badge>
                        <Button 
                          onClick={() => handleRevert(task)} 
                          disabled={processing}
                          variant="outline"
                          size="sm"
                          className="h-8 text-[11px]"
                        >
                          Revert
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {hasMore && (
          <div className="flex justify-center pt-4">
            <Button 
              variant="outline" 
              onClick={() => setDisplayLimit({
                ...displayLimit,
                [key]: currentLimit + 10
              })}
            >
              Load 10 More ({currentLimit} of {filteredTasks.length})
            </Button>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
      </div>
    );
  }

  const pendingInsta = instaTasks.filter(t => t.status === 'pending').length;
  const approvedInsta = instaTasks.filter(t => t.status === 'approved').length;
  const rejectedInsta = instaTasks.filter(t => t.status === 'rejected').length;

  const pendingLinkedin = linkedinTasks.filter(t => t.status === 'pending').length;
  const approvedLinkedin = linkedinTasks.filter(t => t.status === 'approved').length;
  const rejectedLinkedin = linkedinTasks.filter(t => t.status === 'rejected').length;

  return (
    <>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-8">
          <TabsTrigger value="instagram" className="relative flex items-center gap-2">
            <Instagram className="w-4 h-4" />
            Instagram ({pendingInsta + approvedInsta + rejectedInsta})
          </TabsTrigger>
          <TabsTrigger value="linkedin" className="flex items-center gap-2">
            <Linkedin className="w-4 h-4" />
            LinkedIn ({pendingLinkedin + approvedLinkedin + rejectedLinkedin})
          </TabsTrigger>
        </TabsList>

        {/* Instagram Tasks */}
        <TabsContent value="instagram" className="space-y-6">
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card 
              className="border-l-4 border-l-yellow-500 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setExpandedStatus(expandedStatus === 'pending' ? null : 'pending')}
            >
              <CardContent className="p-4">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Pending</p>
                <p className="text-2xl font-bold mt-1">{pendingInsta}</p>
                <p className="text-[11px] text-zinc-400 mt-2">Click to {expandedStatus === 'pending' && activeTab === 'instagram' ? 'collapse' : 'expand'}</p>
              </CardContent>
            </Card>
            <Card 
              className="border-l-4 border-l-green-500 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setExpandedStatus(expandedStatus === 'approved' ? null : 'approved')}
            >
              <CardContent className="p-4">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Approved</p>
                <p className="text-2xl font-bold mt-1">{approvedInsta}</p>
                <p className="text-[11px] text-zinc-400 mt-2">Click to {expandedStatus === 'approved' && activeTab === 'instagram' ? 'collapse' : 'expand'}</p>
              </CardContent>
            </Card>
            <Card 
              className="border-l-4 border-l-red-500 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setExpandedStatus(expandedStatus === 'rejected' ? null : 'rejected')}
            >
              <CardContent className="p-4">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Rejected</p>
                <p className="text-2xl font-bold mt-1">{rejectedInsta}</p>
                <p className="text-[11px] text-zinc-400 mt-2">Click to {expandedStatus === 'rejected' && activeTab === 'instagram' ? 'collapse' : 'expand'}</p>
              </CardContent>
            </Card>
          </div>

          {expandedStatus && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {expandedStatus === 'pending' && <Clock className="w-5 h-5 text-yellow-500" />}
                  {expandedStatus === 'approved' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                  {expandedStatus === 'rejected' && <Ban className="w-5 h-5 text-red-500" />}
                  <span>Instagram {expandedStatus.charAt(0).toUpperCase() + expandedStatus.slice(1)} Tasks</span>
                </CardTitle>
                <CardDescription>
                  {expandedStatus === 'pending' && `Approve or reject ${pendingInsta} pending Instagram submissions`}
                  {expandedStatus === 'approved' && `${approvedInsta} approved Instagram submissions`}
                  {expandedStatus === 'rejected' && `${rejectedInsta} rejected Instagram submissions`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TaskTable tasks={instaTasks} status={expandedStatus} tab="instagram" />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* LinkedIn Tasks */}
        <TabsContent value="linkedin" className="space-y-6">
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card 
              className="border-l-4 border-l-yellow-500 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setExpandedStatus(expandedStatus === 'pending' ? null : 'pending')}
            >
              <CardContent className="p-4">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Pending</p>
                <p className="text-2xl font-bold mt-1">{pendingLinkedin}</p>
                <p className="text-[11px] text-zinc-400 mt-2">Click to {expandedStatus === 'pending' && activeTab === 'linkedin' ? 'collapse' : 'expand'}</p>
              </CardContent>
            </Card>
            <Card 
              className="border-l-4 border-l-green-500 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setExpandedStatus(expandedStatus === 'approved' ? null : 'approved')}
            >
              <CardContent className="p-4">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Approved</p>
                <p className="text-2xl font-bold mt-1">{approvedLinkedin}</p>
                <p className="text-[11px] text-zinc-400 mt-2">Click to {expandedStatus === 'approved' && activeTab === 'linkedin' ? 'collapse' : 'expand'}</p>
              </CardContent>
            </Card>
            <Card 
              className="border-l-4 border-l-red-500 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setExpandedStatus(expandedStatus === 'rejected' ? null : 'rejected')}
            >
              <CardContent className="p-4">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Rejected</p>
                <p className="text-2xl font-bold mt-1">{rejectedLinkedin}</p>
                <p className="text-[11px] text-zinc-400 mt-2">Click to {expandedStatus === 'rejected' && activeTab === 'linkedin' ? 'collapse' : 'expand'}</p>
              </CardContent>
            </Card>
          </div>

          {expandedStatus && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {expandedStatus === 'pending' && <Clock className="w-5 h-5 text-yellow-500" />}
                  {expandedStatus === 'approved' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                  {expandedStatus === 'rejected' && <Ban className="w-5 h-5 text-red-500" />}
                  <span>LinkedIn {expandedStatus.charAt(0).toUpperCase() + expandedStatus.slice(1)} Tasks</span>
                </CardTitle>
                <CardDescription>
                  {expandedStatus === 'pending' && `Approve or reject ${pendingLinkedin} pending LinkedIn submissions`}
                  {expandedStatus === 'approved' && `${approvedLinkedin} approved LinkedIn submissions`}
                  {expandedStatus === 'rejected' && `${rejectedLinkedin} rejected LinkedIn submissions`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TaskTable tasks={linkedinTasks} status={expandedStatus} tab="linkedin" />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
