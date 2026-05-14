'use client';

/**
 * ConstellationHero
 *
 * 600px SVG star-field hero that renders org members as glowing constellation
 * nodes connected by animated lines. Owner = large gold star, admin = purple,
 * member = cyan.  Pure CSS animations, no JS animation libraries.
 */

import { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import type { OrgMember } from '@/hooks/useOrganization';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ConstellationHeroProps {
  members: OrgMember[];
  orgName: string;
  onMemberClick?: (member: OrgMember) => void;
}

interface StarPosition {
  x: number;
  y: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 };

const ROLE_CONFIG = {
  owner: {
    size: 100,
    glowSize: 180,
    ringSize: 130,
    outerRingSize: 160,
    borderWidth: '2.5px',
    colorVar: '#D4A652',
    gradientFrom: 'rgba(212,166,82,0.3)',
    gradientTo: 'rgba(212,166,82,0.08)',
    borderColor: 'rgba(212,166,82,0.55)',
    boxShadow: '0 0 30px rgba(212,166,82,0.15), inset 0 0 20px rgba(212,166,82,0.05)',
    glowBg: 'rgba(212,166,82,0.14)',
    ringBorderColor: 'rgba(212,166,82,0.2)',
    outerRingBorderColor: 'rgba(212,166,82,0.08)',
  },
  admin: {
    size: 70,
    glowSize: 130,
    ringSize: 96,
    outerRingSize: 0,
    borderWidth: '2px',
    colorVar: '#9088D4',
    gradientFrom: 'rgba(144,136,212,0.3)',
    gradientTo: 'rgba(144,136,212,0.08)',
    borderColor: 'rgba(144,136,212,0.45)',
    boxShadow: '0 0 22px rgba(144,136,212,0.1), inset 0 0 14px rgba(144,136,212,0.04)',
    glowBg: 'rgba(144,136,212,0.1)',
    ringBorderColor: 'rgba(144,136,212,0.16)',
    outerRingBorderColor: '',
  },
  member: {
    size: 60,
    glowSize: 110,
    ringSize: 82,
    outerRingSize: 0,
    borderWidth: '2px',
    colorVar: '#5CB8CC',
    gradientFrom: 'rgba(92,184,204,0.3)',
    gradientTo: 'rgba(92,184,204,0.08)',
    borderColor: 'rgba(92,184,204,0.4)',
    boxShadow: '0 0 18px rgba(92,184,204,0.08), inset 0 0 12px rgba(92,184,204,0.03)',
    glowBg: 'rgba(92,184,204,0.08)',
    ringBorderColor: 'rgba(92,184,204,0.13)',
    outerRingBorderColor: '',
  },
} as const;

const BG_STAR_COUNT = 120;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getInitials(m: OrgMember): string {
  if (m.username) {
    const parts = m.username.split(' ');
    return parts.length >= 2
      ? parts[0][0] + parts[parts.length - 1][0]
      : m.username[0];
  }
  return m.email[0].toUpperCase();
}

function displayName(m: OrgMember): string {
  return m.username || m.email.split('@')[0];
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

/** 120 tiny pulsing dots scattered behind the constellation. */
function StarField() {
  const stars = useMemo(() => {
    return Array.from({ length: BG_STAR_COUNT }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      dur: `${2.5 + Math.random() * 5}s`,
      delay: `${Math.random() * 6}s`,
      size: `${1 + Math.random() * 2}px`,
      bright: Math.random() > 0.8,
    }));
  }, []);

  return (
    <div className="absolute inset-0 z-0">
      {stars.map((s) => (
        <div
          key={s.id}
          className="absolute rounded-full"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            background: s.bright ? '#7A776E' : '#5F5E5A',
            boxShadow: s.bright ? '0 0 3px rgba(236,233,225,0.15)' : undefined,
            animation: `constellation-twinkle ${s.dur} ease-in-out infinite`,
            animationDelay: s.delay,
          }}
        />
      ))}
    </div>
  );
}

/** SVG connection lines between every pair of member nodes. */
function ConnectionLines({
  positions,
  memberIds,
}: {
  positions: Map<string, StarPosition>;
  memberIds: string[];
}) {
  const lines = useMemo(() => {
    const result: { key: string; x1: number; y1: number; x2: number; y2: number; len: number; delay: string }[] = [];
    let idx = 0;
    for (let i = 0; i < memberIds.length; i++) {
      for (let j = i + 1; j < memberIds.length; j++) {
        const a = positions.get(memberIds[i]);
        const b = positions.get(memberIds[j]);
        if (!a || !b) continue;
        const len = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
        result.push({
          key: `${memberIds[i]}-${memberIds[j]}`,
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          len,
          delay: `${0.6 + idx * 0.18}s`,
        });
        idx++;
      }
    }
    return result;
  }, [positions, memberIds]);

  return (
    <div className="absolute inset-0 z-[2] pointer-events-none">
      <svg className="w-full h-full">
        {lines.map((l) => (
          <line
            key={l.key}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke="#282724"
            strokeWidth={1}
            style={{
              opacity: 0,
              strokeDasharray: l.len,
              strokeDashoffset: l.len,
              animation: `constellation-drawLine 1.8s cubic-bezier(.16,1,.3,1) forwards`,
              animationDelay: l.delay,
            }}
          />
        ))}
      </svg>
    </div>
  );
}

/** A single member star node. */
function MemberStar({
  member,
  position,
  index,
  onClick,
}: {
  member: OrgMember;
  position: StarPosition;
  index: number;
  onClick: () => void;
}) {
  const cfg = ROLE_CONFIG[member.role] ?? ROLE_CONFIG.member;
  const initials = getInitials(member);
  const name = displayName(member);

  return (
    <div
      className="absolute flex flex-col items-center gap-2.5 cursor-pointer z-10
                 group"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -50%)',
        opacity: 0,
        animation: `constellation-starAppear 0.9s cubic-bezier(.16,1,.3,1) forwards`,
        animationDelay: `${0.3 + index * 0.18}s`,
      }}
      onClick={onClick}
    >
      {/* Tooltip on hover */}
      <div
        className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2
                   px-3 py-1.5 rounded-lg whitespace-nowrap pointer-events-none
                   opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20"
        style={{
          background: 'rgba(19,19,18,0.92)',
          border: '1px solid #282724',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div className="text-xs font-semibold" style={{ color: '#ECE9E1' }}>
          {name}
        </div>
        <div
          className="text-[9px] tracking-wider uppercase mt-px"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            color: cfg.colorVar,
          }}
        >
          {member.role}
        </div>
        {/* Arrow */}
        <div
          className="absolute top-full left-1/2 -translate-x-1/2"
          style={{
            border: '5px solid transparent',
            borderTopColor: '#282724',
          }}
        />
      </div>

      {/* Star body */}
      <div className="relative flex items-center justify-center">
        {/* Glow */}
        <div
          className="absolute rounded-full -z-10"
          style={{
            width: cfg.glowSize,
            height: cfg.glowSize,
            background: cfg.glowBg,
            filter: 'blur(25px)',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            animation: `constellation-starPulse 4s ease-in-out infinite`,
            animationDelay: `${index * 0.7}s`,
          }}
        />
        {/* Outer ring (owner only) */}
        {member.role === 'owner' && (
          <div
            className="absolute rounded-full z-0"
            style={{
              width: cfg.outerRingSize,
              height: cfg.outerRingSize,
              border: `1px solid ${cfg.outerRingBorderColor}`,
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              animation: 'constellation-ringPulse 5s ease-in-out infinite',
            }}
          />
        )}
        {/* Inner ring */}
        <div
          className="absolute rounded-full z-[1]"
          style={{
            width: cfg.ringSize,
            height: cfg.ringSize,
            border: `1.5px solid ${cfg.ringBorderColor}`,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            animation: `constellation-ringPulse 3.5s ease-in-out infinite`,
            animationDelay: `${index * 0.7}s`,
          }}
        />
        {/* Avatar circle */}
        <div
          className="rounded-full flex items-center justify-center relative z-[2]
                     overflow-hidden transition-transform duration-400
                     group-hover:scale-[1.06]"
          style={{
            width: cfg.size,
            height: cfg.size,
            fontSize: cfg.size === 100 ? 30 : cfg.size === 70 ? 22 : 18,
            fontWeight: 800,
            background: `linear-gradient(135deg, ${cfg.gradientFrom}, ${cfg.gradientTo})`,
            color: cfg.colorVar,
            border: `${cfg.borderWidth} solid ${cfg.borderColor}`,
            boxShadow: cfg.boxShadow,
          }}
        >
          {member.imageUrl ? (
            <img
              src={member.imageUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            initials
          )}
        </div>
      </div>

      {/* Label below */}
      <div className="text-center pointer-events-none">
        <div
          className="text-[13px] font-bold mb-px"
          style={{
            color: '#ECE9E1',
            textShadow: '0 1px 8px rgba(0,0,0,0.6)',
          }}
        >
          {name}
        </div>
        <div
          className="text-[9px] tracking-[1.2px] uppercase"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            color: '#7A776E',
          }}
        >
          {member.role}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function ConstellationHero({
  members,
  orgName,
  onMemberClick,
}: ConstellationHeroProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ w: 0, h: 600 });

  // Measure container on mount + resize
  useEffect(() => {
    function measure() {
      if (containerRef.current) {
        setDimensions({
          w: containerRef.current.offsetWidth,
          h: containerRef.current.offsetHeight,
        });
      }
    }
    measure();
    const timer = setTimeout(measure, 50); // ensure after paint
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', measure);
    };
  }, []);

  // Sort: owner first, then admin, then member
  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => (ROLE_ORDER[a.role] ?? 2) - (ROLE_ORDER[b.role] ?? 2)),
    [members],
  );

  // Compute circular positions
  const { positions, memberIds } = useMemo(() => {
    const { w, h } = dimensions;
    if (w === 0) return { positions: new Map<string, StarPosition>(), memberIds: [] as string[] };

    const cx = w / 2;
    const cy = h / 2 + 10;
    const radius = Math.min(w * 0.3, h * 0.32, 240);
    const n = sortedMembers.length;
    const posMap = new Map<string, StarPosition>();
    const ids: string[] = [];

    sortedMembers.forEach((m, i) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
      posMap.set(m.clerkUserId, {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      });
      ids.push(m.clerkUserId);
    });

    return { positions: posMap, memberIds: ids };
  }, [sortedMembers, dimensions]);

  const handleStarClick = useCallback(
    (member: OrgMember) => {
      onMemberClick?.(member);
    },
    [onMemberClick],
  );

  return (
    <>
      {/* CSS keyframes injected once via <style> */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
@keyframes constellation-twinkle {
  0%, 100% { opacity: 0.1; }
  50% { opacity: 0.65; }
}
@keyframes constellation-drawLine {
  to { stroke-dashoffset: 0; opacity: 0.4; }
}
@keyframes constellation-starAppear {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.2); }
  to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
@keyframes constellation-starPulse {
  0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(1); }
  50%      { opacity: 0.85; transform: translate(-50%, -50%) scale(1.12); }
}
@keyframes constellation-ringPulse {
  0%, 100% { opacity: 0.35; transform: translate(-50%, -50%) scale(1); }
  50%      { opacity: 0.65; transform: translate(-50%, -50%) scale(1.07); }
}
          `,
        }}
      />

      <section
        ref={containerRef}
        className="relative w-full overflow-hidden"
        style={{
          height: 600,
          borderBottom: '1px solid #1C1B19',
          background: `
            radial-gradient(ellipse 80% 60% at 50% 40%, rgba(212,166,82,0.03) 0%, transparent 60%),
            radial-gradient(ellipse 60% 50% at 30% 60%, rgba(144,136,212,0.02) 0%, transparent 50%),
            radial-gradient(ellipse 50% 40% at 70% 50%, rgba(92,184,204,0.02) 0%, transparent 50%),
            #0B0B0A
          `,
        }}
      >
        <StarField />

        {/* Org name overlay */}
        <div className="absolute top-8 left-11 z-20">
          <div
            className="text-[10px] tracking-[2px] uppercase mb-1.5"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              color: '#5F5E5A',
            }}
          >
            Organization
          </div>
          <div
            className="text-[30px] font-extrabold"
            style={{
              background: 'linear-gradient(135deg, #ECE9E1, #D4A652)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {orgName}
          </div>
        </div>

        {/* Connection lines */}
        {dimensions.w > 0 && (
          <ConnectionLines positions={positions} memberIds={memberIds} />
        )}

        {/* Member stars */}
        <div className="absolute inset-0 z-[5]">
          {dimensions.w > 0 &&
            sortedMembers.map((m, i) => {
              const pos = positions.get(m.clerkUserId);
              if (!pos) return null;
              return (
                <MemberStar
                  key={m.clerkUserId}
                  member={m}
                  position={pos}
                  index={i}
                  onClick={() => handleStarClick(m)}
                />
              );
            })}
        </div>
      </section>
    </>
  );
}
