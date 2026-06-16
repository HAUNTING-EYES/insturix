'use client';

/**
 * SourceStrip
 *
 * Provenance lanes for Brand Vault evidence. Live, pending, and not-supplied
 * lanes stay visually distinct so the UI never overclaims backend reach.
 */

import type { SourceLane, SourceLaneStatus } from './brand-vault-types';

interface SourceStripProps {
  lanes: SourceLane[];
}

const STATUS_STYLE: Record<
  SourceLaneStatus,
  { dot: string; text: string; border: string; background: string; label: string; dashed?: boolean }
> = {
  live: {
    dot: '#5EC97E',
    text: '#B5B2A8',
    border: '#1C1B19',
    background: '#0F0F0E',
    label: 'live',
  },
  pending: {
    dot: '#D4A652',
    text: '#B5B2A8',
    border: '#1C1B19',
    background: '#0F0F0E',
    label: 'pending',
  },
  not_provided: {
    dot: 'transparent',
    text: '#7A776E',
    border: '#282724',
    background: '#0F0F0E',
    label: 'not supplied',
    dashed: true,
  },
  failed: {
    dot: '#D46A5C',
    text: '#D46A5C',
    border: 'rgba(212,106,92,0.28)',
    background: 'rgba(212,106,92,0.06)',
    label: 'failed',
  },
};

function statusTag(lane: SourceLane): string {
  if (lane.status === 'live') return `live / ${lane.count}`;
  if (lane.status === 'not_provided') return 'not supplied';
  if (lane.status === 'failed') return 'failed';
  return lane.count > 0 ? `pending / ${lane.count}` : 'pending';
}

export function SourceStrip({ lanes }: SourceStripProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-2.5"
      style={{
        padding: '18px 0',
        borderBottom: '1px solid #1C1B19',
      }}
    >
      <span
        style={{
          marginRight: 4,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: '#5F5E5A',
        }}
      >
        Sources
      </span>
      {lanes.map((lane) => {
        const status = STATUS_STYLE[lane.status];
        return (
          <span
            key={lane.id}
            title={lane.detail}
            className="inline-flex items-center"
            style={{
              gap: 8,
              padding: '7px 12px',
              borderRadius: 7,
              border: `1px ${status.dashed ? 'dashed' : 'solid'} ${status.border}`,
              background: status.background,
              color: status.text,
              fontSize: 12,
              lineHeight: 1,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                flex: '0 0 auto',
                background: status.dot,
                border: lane.status === 'not_provided' ? '1px solid #454340' : 'none',
              }}
            />
            <span>{lane.label}</span>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9,
                fontWeight: 500,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: '#5F5E5A',
              }}
            >
              {statusTag(lane)}
            </span>
          </span>
        );
      })}
    </div>
  );
}
