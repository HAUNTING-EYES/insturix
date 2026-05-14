'use client';

/**
 * MemberTable
 *
 * Searchable, sortable member table with role badges, inline actions,
 * and staggered row-entry animations.  Matches the Insturix dark theme.
 */

import {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from 'react';
import type { OrgMember } from '@/hooks/useOrganization';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface MemberTableHandle {
  scrollToMember: (clerkUserId: string) => void;
}

interface MemberTableProps {
  members: OrgMember[];
  orgId: string;
  canManage: boolean;
  onRoleChange?: (memberId: string, newRole: 'admin' | 'member') => void;
  onRemove?: (memberId: string) => void;
}

type SortField = 'name' | 'role' | 'joined';
type SortDir = 'asc' | 'desc';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 };

const ROLE_BADGE: Record<string, { bg: string; color: string; border: string; icon: string }> = {
  owner: {
    bg: 'rgba(212,166,82,0.1)',
    color: '#D4A652',
    border: 'rgba(212,166,82,0.2)',
    icon: '★', // star
  },
  admin: {
    bg: 'rgba(144,136,212,0.1)',
    color: '#9088D4',
    border: 'rgba(144,136,212,0.2)',
    icon: '◆', // diamond
  },
  member: {
    bg: 'rgba(92,184,204,0.1)',
    color: '#5CB8CC',
    border: 'rgba(92,184,204,0.2)',
    icon: '●', // circle
  },
};

const AVATAR_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  owner: {
    bg: 'linear-gradient(135deg, rgba(212,166,82,0.2), rgba(212,166,82,0.05))',
    color: '#D4A652',
    border: '1.5px solid rgba(212,166,82,0.3)',
  },
  admin: {
    bg: 'linear-gradient(135deg, rgba(144,136,212,0.2), rgba(144,136,212,0.05))',
    color: '#9088D4',
    border: '1.5px solid rgba(144,136,212,0.3)',
  },
  member: {
    bg: 'linear-gradient(135deg, rgba(92,184,204,0.2), rgba(92,184,204,0.05))',
    color: '#5CB8CC',
    border: '1.5px solid rgba(92,184,204,0.3)',
  },
};

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

function formatJoined(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const MemberTable = forwardRef<MemberTableHandle, MemberTableProps>(
  function MemberTable({ members, orgId, canManage, onRoleChange, onRemove }, ref) {
    const [search, setSearch] = useState('');
    const [sortField, setSortField] = useState<SortField>('joined');
    const [sortDir, setSortDir] = useState<SortDir>('asc');
    const [roleDropdownFor, setRoleDropdownFor] = useState<string | null>(null);
    const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
    const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // Debounced search (300ms)
    useEffect(() => {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        setDebouncedSearch(search);
      }, 300);
      return () => clearTimeout(searchTimerRef.current);
    }, [search]);

    // Expose scrollToMember
    useImperativeHandle(ref, () => ({
      scrollToMember(clerkUserId: string) {
        const row = rowRefs.current.get(clerkUserId);
        if (row) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          row.style.background = 'rgba(212,166,82,0.08)';
          setTimeout(() => {
            row.style.background = '';
          }, 1500);
        }
      },
    }));

    // Close dropdown on outside click
    useEffect(() => {
      if (!roleDropdownFor) return;
      function handleClick(e: MouseEvent) {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-role-dropdown]') && !target.closest('[data-role-trigger]')) {
          setRoleDropdownFor(null);
        }
      }
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }, [roleDropdownFor]);

    // Sort + filter
    const processed = useMemo(() => {
      let list = [...members];

      // Filter
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        list = list.filter(
          (m) =>
            displayName(m).toLowerCase().includes(q) ||
            m.email.toLowerCase().includes(q),
        );
      }

      // Sort
      list.sort((a, b) => {
        let cmp = 0;
        if (sortField === 'name') {
          cmp = displayName(a).localeCompare(displayName(b));
        } else if (sortField === 'role') {
          cmp = (ROLE_ORDER[a.role] ?? 2) - (ROLE_ORDER[b.role] ?? 2);
        } else {
          cmp = new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
        }
        return sortDir === 'asc' ? cmp : -cmp;
      });

      return list;
    }, [members, debouncedSearch, sortField, sortDir]);

    const handleSort = useCallback(
      (field: SortField) => {
        if (sortField === field) {
          setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
          setSortField(field);
          setSortDir('asc');
        }
      },
      [sortField],
    );

    const handleRoleChange = useCallback(
      (memberId: string, newRole: 'admin' | 'member') => {
        onRoleChange?.(memberId, newRole);
        setRoleDropdownFor(null);
      },
      [onRoleChange],
    );

    const handleRemove = useCallback(
      (memberId: string, name: string) => {
        if (window.confirm(`Remove ${name} from the organization?`)) {
          onRemove?.(memberId);
        }
      },
      [onRemove],
    );

    const sortArrow = (field: SortField) => {
      if (sortField !== field) return '↕'; // up-down arrow
      return sortDir === 'asc' ? '↑' : '↓';
    };

    return (
      <>
        {/* Keyframes for row animation */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
@keyframes memberTable-rowSlide {
  from { opacity: 0; transform: translateX(-16px); }
  to   { opacity: 1; transform: translateX(0); }
}`,
          }}
        />

        <div className="max-w-[1100px] mx-auto px-10">
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span
                className="text-[11px] font-semibold tracking-[2px] uppercase"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  color: '#7A776E',
                }}
              >
                Members
              </span>
              <span
                className="text-[11px] px-2.5 py-0.5 rounded-md"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  background: '#1B1A18',
                  border: '1px solid #1C1B19',
                  color: '#7A776E',
                }}
              >
                {processed.length} member{processed.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <input
                type="text"
                placeholder="Search members..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="py-2 pl-9 pr-3.5 rounded-lg text-[13px] outline-none transition-all duration-200"
                style={{
                  background: '#0F0F0E',
                  border: '1px solid #1C1B19',
                  color: '#ECE9E1',
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  width: search ? 280 : 220,
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='%235F5E5A' viewBox='0 0 24 24'%3E%3Ccircle cx='11' cy='11' r='7' stroke='%235F5E5A' stroke-width='2' fill='none'/%3E%3Cline x1='16.5' y1='16.5' x2='21' y2='21' stroke='%235F5E5A' stroke-width='2'/%3E%3C/svg%3E\")",
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: '12px center',
                }}
              />
            </div>
          </div>

          {/* Table */}
          <div
            className="rounded-[14px] overflow-hidden"
            style={{
              background: '#0F0F0E',
              border: '1px solid #1C1B19',
            }}
          >
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {(['name', 'role', 'joined'] as SortField[]).map((field) => (
                    <th
                      key={field}
                      onClick={() => handleSort(field)}
                      className="text-left cursor-pointer select-none transition-colors duration-200 hover:text-[#7A776E]"
                      style={{
                        padding: '14px 20px',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: '1.5px',
                        textTransform: 'uppercase',
                        color: sortField === field ? '#D4A652' : '#5F5E5A',
                        borderBottom: '1px solid #1C1B19',
                        background: '#131312',
                      }}
                    >
                      {field === 'name' ? 'Member' : field}{' '}
                      <span className="text-[10px] ml-1 opacity-50">
                        {sortArrow(field)}
                      </span>
                    </th>
                  ))}
                  <th
                    style={{
                      padding: '14px 20px',
                      borderBottom: '1px solid #1C1B19',
                      background: '#131312',
                    }}
                  />
                </tr>
              </thead>
              <tbody>
                {processed.map((m, i) => {
                  const badge = ROLE_BADGE[m.role] ?? ROLE_BADGE.member;
                  const avatar = AVATAR_STYLE[m.role] ?? AVATAR_STYLE.member;
                  const name = displayName(m);

                  return (
                    <tr
                      key={m.clerkUserId}
                      ref={(el) => {
                        if (el) rowRefs.current.set(m.clerkUserId, el);
                      }}
                      className="group transition-colors duration-200"
                      style={{
                        borderBottom: i < processed.length - 1 ? '1px solid #1C1B19' : 'none',
                        opacity: 0,
                        animation: `memberTable-rowSlide 0.5s cubic-bezier(.16,1,.3,1) forwards`,
                        animationDelay: `${0.25 + i * 0.1}s`,
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background = '#131312';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = '';
                      }}
                    >
                      {/* Member cell */}
                      <td style={{ padding: '14px 20px', fontSize: 14, verticalAlign: 'middle' }}>
                        <div className="flex items-center gap-3.5">
                          <div
                            className="w-10 h-10 rounded-[10px] flex items-center justify-center
                                       flex-shrink-0 overflow-hidden text-sm font-bold"
                            style={{
                              background: avatar.bg,
                              color: avatar.color,
                              border: avatar.border,
                            }}
                          >
                            {m.imageUrl ? (
                              <img src={m.imageUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              getInitials(m)
                            )}
                          </div>
                          <div>
                            <div className="font-semibold" style={{ color: '#ECE9E1', marginBottom: 2 }}>
                              {name}
                            </div>
                            <div
                              className="text-[11px]"
                              style={{
                                fontFamily: "'JetBrains Mono', monospace",
                                color: '#7A776E',
                              }}
                            >
                              {m.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role badge */}
                      <td style={{ padding: '14px 20px', verticalAlign: 'middle' }}>
                        <span
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold tracking-[0.5px]"
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            background: badge.bg,
                            color: badge.color,
                            border: `1px solid ${badge.border}`,
                          }}
                        >
                          <span className="text-xs">{badge.icon}</span>
                          {m.role.charAt(0).toUpperCase() + m.role.slice(1)}
                        </span>
                      </td>

                      {/* Joined date */}
                      <td style={{ padding: '14px 20px', verticalAlign: 'middle' }}>
                        <span
                          className="text-xs"
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            color: '#7A776E',
                          }}
                        >
                          {formatJoined(m.joinedAt)}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '14px 20px', verticalAlign: 'middle' }}>
                        {m.role !== 'owner' && canManage && (
                          <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            {/* Role change */}
                            <div className="relative">
                              <button
                                data-role-trigger
                                onClick={() =>
                                  setRoleDropdownFor((prev) =>
                                    prev === m.clerkUserId ? null : m.clerkUserId,
                                  )
                                }
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-[13px]
                                           transition-all duration-150 cursor-pointer"
                                style={{
                                  background: '#1B1A18',
                                  border: '1px solid #1C1B19',
                                  color: '#7A776E',
                                }}
                                title="Change role"
                                onMouseEnter={(e) => {
                                  (e.currentTarget as HTMLElement).style.background = '#131312';
                                  (e.currentTarget as HTMLElement).style.color = '#ECE9E1';
                                  (e.currentTarget as HTMLElement).style.borderColor = '#282724';
                                }}
                                onMouseLeave={(e) => {
                                  (e.currentTarget as HTMLElement).style.background = '#1B1A18';
                                  (e.currentTarget as HTMLElement).style.color = '#7A776E';
                                  (e.currentTarget as HTMLElement).style.borderColor = '#1C1B19';
                                }}
                              >
                                &#8645;
                              </button>
                              {/* Dropdown */}
                              {roleDropdownFor === m.clerkUserId && (
                                <div
                                  data-role-dropdown
                                  className="absolute right-0 top-full mt-1.5 z-50 rounded-[10px] p-1.5 min-w-[140px]"
                                  style={{
                                    background: '#131312',
                                    border: '1px solid #282724',
                                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                                  }}
                                >
                                  {(['admin', 'member'] as const).map((role) => (
                                    <button
                                      key={role}
                                      onClick={() => handleRoleChange(m.clerkUserId, role)}
                                      className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-md text-xs
                                                 font-medium transition-all duration-150 cursor-pointer"
                                      style={{
                                        color: m.role === role ? '#D4A652' : '#B5B2A8',
                                        background: m.role === role ? 'rgba(212,166,82,0.06)' : 'transparent',
                                        border: 'none',
                                      }}
                                      onMouseEnter={(e) => {
                                        if (m.role !== role) {
                                          (e.currentTarget as HTMLElement).style.background = '#1B1A18';
                                          (e.currentTarget as HTMLElement).style.color = '#ECE9E1';
                                        }
                                      }}
                                      onMouseLeave={(e) => {
                                        if (m.role !== role) {
                                          (e.currentTarget as HTMLElement).style.background = 'transparent';
                                          (e.currentTarget as HTMLElement).style.color = '#B5B2A8';
                                        }
                                      }}
                                    >
                                      <span style={{ color: ROLE_BADGE[role].color }}>
                                        {ROLE_BADGE[role].icon}
                                      </span>
                                      {role.charAt(0).toUpperCase() + role.slice(1)}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Remove */}
                            <button
                              onClick={() => handleRemove(m.clerkUserId, name)}
                              className="w-8 h-8 flex items-center justify-center rounded-lg text-[13px]
                                         transition-all duration-150 cursor-pointer"
                              style={{
                                background: '#1B1A18',
                                border: '1px solid #1C1B19',
                                color: '#7A776E',
                              }}
                              title="Remove member"
                              onMouseEnter={(e) => {
                                (e.currentTarget as HTMLElement).style.background = 'rgba(212,80,80,0.08)';
                                (e.currentTarget as HTMLElement).style.color = '#D45050';
                                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(212,80,80,0.2)';
                              }}
                              onMouseLeave={(e) => {
                                (e.currentTarget as HTMLElement).style.background = '#1B1A18';
                                (e.currentTarget as HTMLElement).style.color = '#7A776E';
                                (e.currentTarget as HTMLElement).style.borderColor = '#1C1B19';
                              }}
                            >
                              &#10005;
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {processed.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="text-center py-12 text-sm"
                      style={{ color: '#5F5E5A' }}
                    >
                      {debouncedSearch ? 'No members match your search' : 'No members'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </>
    );
  },
);
