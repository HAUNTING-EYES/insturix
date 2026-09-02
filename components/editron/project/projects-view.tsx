'use client';

/**
 * ProjectsView — clean "your projects" browser for Editron.
 *
 * The "Projects" / "View all" destination from the New Project flow. Just the projects grid
 * (open + delete), in the studio-console language — NONE of the old dashboard console (monitor,
 * from-script, VU meters, oscilloscope). Cards wrap into rows so every project is visible.
 * CSS scoped under `.epv`; --ef tokens mirrored locally so the cards render standalone.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Trash2, ArrowLeft } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/editron/use-toast';
import { getUserFriendlyErrorMessage } from '@/lib/editron/utils/error-handling';

interface Project {
  projectId: string;
  projectRevision?: number;
  name: string;
  thumbnail?: string;
  updatedAt: string;
  durationInFrames: number;
  aspectRatio: string;
}

function formatDuration(frames: number): string {
  const totalSec = Math.floor(frames / 30);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s > 0 ? s + 's' : ''}`.trim();
}

const CSS = `
.epv{--bg:#0B0B0A;--surface:#0F0F0E;--raised:#131312;--well:#1B1A18;--border:#1C1B19;--borderL:#282724;
  --text:#ECE9E1;--soft:#B5B2A8;--muted:#7A776E;--dim:#5F5E5A;--faint:#454340;--gold:#D4A652;--green:#5EC97E;--red:#E05252;--ease:cubic-bezier(0.16,1,0.3,1);
  min-height:100vh;background:var(--bg);color:var(--text);font-family:'Plus Jakarta Sans',system-ui,sans-serif;padding:26px clamp(20px,4vw,40px) 60px}
.epv *{box-sizing:border-box}
.epv .head{display:flex;align-items:center;justify-content:space-between;margin-bottom:26px}
.epv .back{display:inline-flex;align-items:center;gap:7px;background:transparent;border:1px solid var(--border);border-radius:7px;padding:8px 13px;color:var(--soft);font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;transition:border-color .2s var(--ease),color .2s var(--ease)}
.epv .back:hover{border-color:rgba(212,166,82,.4);color:var(--text)}
.epv .title{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--gold)}
.epv .count{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim)}
.epv .grid{display:flex;flex-wrap:wrap;gap:18px}
.epv .card{width:240px;min-width:240px;flex-shrink:0;background:var(--raised);border:1px solid var(--border);border-radius:4px;overflow:hidden;cursor:pointer;position:relative;transition:border-color .3s var(--ease),transform .3s var(--ease),box-shadow .3s var(--ease)}
.epv .card:hover{border-color:rgba(212,166,82,.3);transform:translateY(-2px);box-shadow:0 8px 32px rgba(0,0,0,.3),0 0 24px rgba(212,166,82,.12)}
.epv .thumb{position:relative;height:140px;overflow:hidden;background:#050505}
.epv .thumb img{width:100%;height:100%;object-fit:cover;display:block}
.epv .scan{position:absolute;inset:0;background:repeating-linear-gradient(to bottom,transparent 0,transparent 1px,rgba(0,0,0,.08) 1px,rgba(0,0,0,.08) 2px)}
.epv .live{position:absolute;top:8px;right:8px;width:5px;height:5px;border-radius:50%;background:var(--green);z-index:2}
.epv .info{padding:10px 12px}
.epv .nm{font-size:13px;font-weight:500;color:var(--text);margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.epv .meta{display:flex;align-items:center;gap:8px}
.epv .meta span{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--dim)}
.epv .ago{font-family:'JetBrains Mono',monospace;font-size:8px;color:var(--faint);margin-top:4px}
.epv .del{position:absolute;top:8px;left:8px;width:22px;height:22px;border-radius:3px;border:1px solid var(--border);background:rgba(11,11,10,.8);display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:.4;transition:all .3s var(--ease);z-index:3;color:var(--dim)}
.epv .del:hover{opacity:1;border-color:var(--red);color:var(--red)}
.epv .skel{width:240px;min-width:240px;flex-shrink:0;background:var(--raised);border:1px solid var(--border);border-radius:4px;overflow:hidden}
.epv .empty{padding:64px 20px;text-align:center;border:1px solid var(--border);border-radius:4px;background:var(--surface);width:100%}
.epv .empty .t{font-size:14px;font-weight:500;color:var(--soft);margin-bottom:4px}
.epv .empty .s{font-size:12px;color:var(--dim)}
.epv .empty .go{margin-top:16px;display:inline-flex;background:var(--gold);color:#11100e;font-weight:800;font-size:13px;border:none;border-radius:8px;padding:10px 18px;cursor:pointer}
`;

export default function ProjectsView() {
  const router = useRouter();
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/services/editron/projects/list');
      const data = res.ok ? await res.json() : { projects: [] };
      setProjects(Array.isArray(data?.projects) ? data.projects : []);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const remove = useCallback(async (id: string) => {
    try {
      const project = projects.find((candidate) => candidate.projectId === id);
      if (!project) throw new Error('Project revision is unavailable. Reload and try again.');
      const res = await fetch(`/api/services/editron/projects/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: {
            schemaVersion: 1,
            value: project.projectRevision ?? 0,
            compatibilityUpdatedAt: new Date(project.updatedAt).toISOString(),
          },
        }),
      });
      if (!res.ok) {
        const failure = await res.json().catch(() => null) as { error?: unknown } | null;
        throw new Error(typeof failure?.error === 'string' ? failure.error : 'Delete failed');
      }
      setProjects((prev) => prev.filter((p) => p.projectId !== id));
      toast({ title: 'Project deleted' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: getUserFriendlyErrorMessage(e) });
    } finally {
      setDeleteId(null);
    }
  }, [projects, toast]);

  return (
    <div className="epv">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="head">
        <button type="button" className="back" onClick={() => router.push('/dashboard/editron')}>
          <ArrowLeft size={13} /> New project
        </button>
        <span className="title">Projects</span>
        <span className="count">{loading ? '—' : `${projects.length} total`}</span>
      </div>

      {loading ? (
        <div className="grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skel">
              <div className="thumb"><div className="scan" /></div>
              <div className="info">
                <div style={{ height: 14, background: 'var(--well)', borderRadius: 2, marginBottom: 8, width: '70%' }} />
                <div style={{ height: 10, background: 'var(--well)', borderRadius: 2, width: '40%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="empty">
          <div className="t">No projects yet</div>
          <div className="s">Start one from the New project screen.</div>
          <button type="button" className="go" onClick={() => router.push('/dashboard/editron')}>New project</button>
        </div>
      ) : (
        <div className="grid">
          {projects.map((p) => (
            <div key={p.projectId} className="card" onClick={() => router.push(`/dashboard/editron/project/${p.projectId}`)}>
              <button
                type="button"
                className="del"
                aria-label={`Delete ${p.name}`}
                onClick={(e) => { e.stopPropagation(); setDeleteId(p.projectId); }}
              >
                <Trash2 size={11} />
              </button>
              <div className="thumb">
                {p.thumbnail ? <img src={p.thumbnail} alt={p.name} /> : <div className="scan" />}
                <div className="live" />
              </div>
              <div className="info">
                <div className="nm">{p.name || 'Untitled'}</div>
                <div className="meta">
                  <span>{formatDuration(p.durationInFrames)}</span>
                  <span>{p.aspectRatio}</span>
                </div>
                <div className="ago">{formatDistanceToNow(new Date(p.updatedAt), { addSuffix: true })}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the project and all
              associated data including checkpoints and chat history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && remove(deleteId)} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
