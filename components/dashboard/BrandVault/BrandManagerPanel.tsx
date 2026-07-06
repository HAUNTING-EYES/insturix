'use client';

/**
 * BrandManagerPanel
 *
 * The agency/brand manager surface for Brand Vault: switch between client brands,
 * rescan the selected brand, start a scan for a brand-new client, and review the
 * selected brand's recent scan history (status, website, date, evidence counts).
 *
 * Purely presentational — the parent (BrandVaultReview) owns all data + query
 * hooks and passes results down, so this file never fetches. No raw job/profile
 * ids are shown; "Open" reloads a scan by its job id under the hood.
 */

import { useState } from 'react';
import { AlertTriangle, Check, ExternalLink, Loader2, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import type {
  BrandVaultAcceptedBrandSummary,
  BrandVaultBrandScanSummary,
} from './brand-vault-types';

export interface BrandManagerBrandOption {
  brandId: string;
  name: string;
}

interface BrandManagerPanelProps {
  brands: BrandManagerBrandOption[];
  acceptedSummaries: BrandVaultAcceptedBrandSummary[];
  activeBrandId: string | null;
  scans: BrandVaultBrandScanSummary[];
  scansLoading: boolean;
  scansError: string | null;
  busy: boolean;
  canRescan: boolean;
  onSelectBrand: (brandId: string) => void;
  onRescan: () => void;
  onScanNew: () => void;
  onOpenScan: (jobId: string) => void;
  onDeleteScan: (jobId: string) => void;
  deletingJobId: string | null;
}

type ScanTone = 'good' | 'gold' | 'muted' | 'risk';

export function BrandManagerPanel({
  brands,
  acceptedSummaries,
  activeBrandId,
  scans,
  scansLoading,
  scansError,
  busy,
  canRescan,
  onSelectBrand,
  onRescan,
  onScanNew,
  onOpenScan,
  onDeleteScan,
  deletingJobId,
}: BrandManagerPanelProps) {
  const [confirmingDeleteJobId, setConfirmingDeleteJobId] = useState<string | null>(null);
  if (brands.length === 0) return null;

  const acceptedByBrand = new Map(acceptedSummaries.map((summary) => [summary.brandId, summary]));

  return (
    <section className="bv-c1-manager" aria-label="Brand manager">
      <div className="bv-c1-manager-head">
        <span className="bv-c1-mono">Your brands / clients</span>
        <span className="bv-c1-manager-count">{brands.length}</span>
        <span className="flex-1" />
        <button type="button" className="bv-c1-primary" disabled={busy} onClick={onScanNew}>
          <Plus size={14} /> Scan new client
        </button>
      </div>

      <div className="bv-c1-brand-list">
        {brands.map((brand) => {
          const isActive = brand.brandId === activeBrandId;
          const accepted = acceptedByBrand.get(brand.brandId);
          return (
            <div key={brand.brandId} className={`bv-c1-brand-row ${isActive ? 'is-active' : ''}`}>
              <button
                type="button"
                className="bv-c1-brand-open"
                disabled={busy && !isActive}
                onClick={() => onSelectBrand(brand.brandId)}
                aria-current={isActive}
              >
                <span className="bv-c1-brand-name">{brand.name}</span>
                <span className="bv-c1-brand-meta">
                  {accepted
                    ? `Accepted brand memory · ${formatRelative(accepted.acceptedAt ?? accepted.updatedAt)}`
                    : 'Draft in review — not accepted yet'}
                </span>
              </button>
              {isActive ? (
                <button
                  type="button"
                  className="bv-c1-button"
                  disabled={!canRescan}
                  onClick={onRescan}
                  title={canRescan ? 'Scan this brand again for a new review draft' : 'Add a website before rescanning'}
                >
                  <RefreshCw size={13} /> Rescan
                </button>
              ) : (
                <span className="bv-c1-brand-switch">Open</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="bv-c1-manager-head" style={{ marginTop: 6 }}>
        <span className="bv-c1-mono">Recent scans</span>
        {scansLoading && <Loader2 size={13} className="animate-spin" style={{ color: '#7A776E' }} />}
      </div>

      {scansError ? (
        <div className="bv-c1-manager-empty">{scansError}</div>
      ) : scans.length === 0 ? (
        <div className="bv-c1-manager-empty">
          {scansLoading ? 'Loading scan history…' : 'No scans yet for this brand. Rescan or scan a new client to start one.'}
        </div>
      ) : (
        <div className="bv-c1-scan-list">
          {scans.map((scan) => {
            const meta = scanStatusMeta(scan.status);
            return (
              <div key={scan.jobId} className="bv-c1-scan-row">
                <span className={`bv-c1-scan-status ${meta.tone}`}>{meta.label}</span>
                <span className="bv-c1-scan-site" title={scan.websiteUrl ?? undefined}>
                  {displayWebsite(scan) || 'No website on this scan'}
                </span>
                <span className="bv-c1-scan-counts">
                  {scan.candidateCount} signal{scan.candidateCount === 1 ? '' : 's'}
                  {scan.warningCount > 0 && (
                    <span className="bv-c1-scan-warn">
                      <AlertTriangle size={11} /> {scan.warningCount}
                    </span>
                  )}
                </span>
                <span className="bv-c1-scan-time">{formatRelative(scan.updatedAt)}</span>
                <span className="bv-c1-scan-actions">
                  {confirmingDeleteJobId === scan.jobId ? (
                    <>
                      <button
                        type="button"
                        className="bv-c1-button danger"
                        disabled={deletingJobId === scan.jobId}
                        onClick={() => onDeleteScan(scan.jobId)}
                        title="Permanently delete this scan from history"
                      >
                        {deletingJobId === scan.jobId ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Delete
                      </button>
                      <button
                        type="button"
                        className="bv-c1-icon-button"
                        onClick={() => setConfirmingDeleteJobId(null)}
                        aria-label="Cancel delete"
                      >
                        <X size={13} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="bv-c1-button"
                        disabled={busy}
                        onClick={() => onOpenScan(scan.jobId)}
                        title="Reload this scan's draft for review"
                      >
                        {scan.status === 'accepted' ? <Check size={13} /> : <ExternalLink size={13} />} Open
                      </button>
                      <button
                        type="button"
                        className="bv-c1-icon-button"
                        disabled={deletingJobId === scan.jobId}
                        onClick={() => setConfirmingDeleteJobId(scan.jobId)}
                        aria-label="Delete this scan from history"
                        title="Delete this scan from history"
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function displayWebsite(scan: BrandVaultBrandScanSummary): string {
  const raw = scan.websiteUrl ?? scan.normalizedUrl ?? '';
  if (!raw) return '';
  return raw.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

function scanStatusMeta(status: BrandVaultBrandScanSummary['status']): { label: string; tone: ScanTone } {
  switch (status) {
    case 'accepted':
      return { label: 'Accepted', tone: 'good' };
    case 'needs_review':
      return { label: 'Ready to review', tone: 'gold' };
    case 'queued':
      return { label: 'Queued', tone: 'muted' };
    case 'running':
      return { label: 'Scanning', tone: 'muted' };
    case 'failed':
      return { label: 'Failed', tone: 'risk' };
    case 'rejected':
      return { label: 'Rejected', tone: 'risk' };
    default:
      return { label: status, tone: 'muted' };
  }
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';
  const diffMinutes = Math.round((Date.now() - then) / 60_000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(then).toLocaleDateString();
}
