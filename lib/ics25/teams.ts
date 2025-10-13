// Client-side mock data layer for ICS'25 team management using localStorage
// Note: This is a temporary mock; replace with real APIs when backend is ready.

export type Game = 'valorant' | 'bgmi';
export type GameLetter = 'v' | 'b';

export type PlayerProfile = {
  userId: string;
  name: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  instagram?: string;
  discord?: string;
  valorant?: { riotId: string; rank?: string; preferredAgents?: string };
  bgmi?: { ign: string; uid: string; rank?: string };
};

export type Team = {
  id: string; // code
  code: string; // 6-char
  game: Game;
  teamName: string;
  leaderId: string;
  members: string[]; // userIds
  pendingRequests: string[]; // userIds
  createdAt: number;
};

export type Registration = {
  userId: string;
  game: Game;
  teamCode?: string; // set if created team or accepted join
  teamName?: string;
  status: 'pending-team' | 'in-team' | 'solo' | 'paid';
  paidAt?: number;
  paymentRef?: string;
  createdAt: number;
};

const LS_KEYS = {
  teams: 'ics25_teams',
  registrations: 'ics25_registrations',
  profiles: 'ics25_profiles',
} as const;

const get = <T>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};
const set = (key: string, value: any) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
};

export const gameToLetter = (g: Game): GameLetter => (g === 'valorant' ? 'v' : 'b');
export const letterToGame = (l: GameLetter): Game => (l === 'v' ? 'valorant' : 'bgmi');

export const maxTeamSize = (g: Game) => (g === 'bgmi' ? 4 : 5);

export const listTeams = (): Team[] => get<Team[]>(LS_KEYS.teams, []);
export const saveTeams = (teams: Team[]) => set(LS_KEYS.teams, teams);

export const getRegistrations = (): Registration[] => get<Registration[]>(LS_KEYS.registrations, []);
export const saveRegistrations = (regs: Registration[]) => set(LS_KEYS.registrations, regs);

export const getProfiles = (): Record<string, PlayerProfile> => get<Record<string, PlayerProfile>>(LS_KEYS.profiles, {});
export const saveProfiles = (profiles: Record<string, PlayerProfile>) => set(LS_KEYS.profiles, profiles);

export const upsertProfile = (profile: PlayerProfile) => {
  const profiles = getProfiles();
  profiles[profile.userId] = { ...(profiles[profile.userId] || {}), ...profile };
  saveProfiles(profiles);
};

export const findTeamByCode = (code: string): Team | undefined => {
  const teams = listTeams();
  return teams.find((t) => t.code.toLowerCase() === code.toLowerCase());
};

export const createTeam = (params: { code: string; game: Game; teamName: string; leaderId: string }): Team => {
  const { code, game, teamName, leaderId } = params;
  const teams = listTeams();
  if (teams.some((t) => t.code.toLowerCase() === code.toLowerCase())) {
    throw new Error('Team code already exists');
  }
  const team: Team = {
    id: code,
    code,
    game,
    teamName,
    leaderId,
    members: [leaderId],
    pendingRequests: [],
    createdAt: Date.now(),
  };
  teams.push(team);
  saveTeams(teams);
  return team;
};

export const listIncompleteTeams = (game?: Game): Team[] => {
  const teams = listTeams();
  return teams.filter((t) => (!game || t.game === game) && t.members.length < maxTeamSize(t.game));
};

export const submitJoinRequest = (teamCode: string, userId: string) => {
  const teams = listTeams();
  const team = teams.find((t) => t.code.toLowerCase() === teamCode.toLowerCase());
  if (!team) throw new Error('Team not found');
  if (team.members.includes(userId)) return; // already in team
  if (!team.pendingRequests.includes(userId)) team.pendingRequests.push(userId);
  saveTeams(teams);
};

export const acceptRequest = (teamCode: string, userId: string) => {
  const teams = listTeams();
  const team = teams.find((t) => t.code.toLowerCase() === teamCode.toLowerCase());
  if (!team) throw new Error('Team not found');
  team.pendingRequests = team.pendingRequests.filter((u) => u !== userId);
  if (!team.members.includes(userId) && team.members.length < maxTeamSize(team.game)) {
    team.members.push(userId);
  }
  // terminate all other pending requests from this user
  for (const t of teams) {
    if (t.code !== team.code) t.pendingRequests = t.pendingRequests.filter((u) => u !== userId);
  }
  saveTeams(teams);
  // update registration
  const regs = getRegistrations();
  const r = regs.find((x) => x.userId === userId);
  if (r) {
    r.teamCode = team.code;
    r.teamName = team.teamName;
    r.status = 'in-team';
    saveRegistrations(regs);
  }
};

export const denyRequest = (teamCode: string, userId: string) => {
  const teams = listTeams();
  const team = teams.find((t) => t.code.toLowerCase() === teamCode.toLowerCase());
  if (!team) throw new Error('Team not found');
  team.pendingRequests = team.pendingRequests.filter((u) => u !== userId);
  saveTeams(teams);
};

export const ensureRegistration = (reg: Registration) => {
  const regs = getRegistrations();
  const existing = regs.find((x) => x.userId === reg.userId);
  if (existing) {
    Object.assign(existing, reg);
  } else {
    regs.push(reg);
  }
  saveRegistrations(regs);
};

export const markPaid = (userId: string, paymentRef: string) => {
  const regs = getRegistrations();
  const r = regs.find((x) => x.userId === userId);
  if (r) {
    r.status = 'paid';
    r.paidAt = Date.now();
    r.paymentRef = paymentRef;
    saveRegistrations(regs);
  }
};

export const generateCode = (): string => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

// Invite links should open the portal and pre-fill the invite code via dynamic route redirect
export const inviteUrl = (game: Game, code: string): string => {
  const letter = gameToLetter(game);
  // We still generate the short link /ics25/{v|b}/{code}. That route redirects to /ics25/my?code=&game=
  return `https://insturix.com/ics25/${letter}/${code}`;
};

export const getUserRegistration = (userId: string): Registration | undefined => {
  const regs = getRegistrations();
  return regs.find((x) => x.userId === userId);
};

export const getTeamMembersProfiles = (team: Team): PlayerProfile[] => {
  const profiles = getProfiles();
  return team.members.map((uid) => profiles[uid]).filter(Boolean);
};
