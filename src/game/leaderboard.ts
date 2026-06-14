import type { CampaignRunSummary } from "./session";

const KEY = "echo-shift-leaderboard-v1";
const MAX_ENTRIES = 10;
const MAX_NICKNAME_LENGTH = 16;

export type LeaderboardEntry = {
  id: string;
  nickname: string;
  score: number;
  frames: number;
  deaths: number;
  cores: number;
  levels: number;
  completedAt: string;
};

export type LeaderboardSaveResult =
  | { ok: true; entries: LeaderboardEntry[] }
  | { ok: false; entries: LeaderboardEntry[]; message: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const finiteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const nonNegativeInteger = (value: unknown): number => (finiteNumber(value) ? Math.max(0, Math.round(value)) : 0);

export const sanitizeLeaderboardNickname = (value: string): string => {
  const trimmed = value
    .replace(/\s+/g, " ")
    .replace(/[^\w .-]/g, "")
    .trim();
  return (trimmed || "Runner").slice(0, MAX_NICKNAME_LENGTH);
};

const normalizeEntry = (value: unknown): LeaderboardEntry | null => {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.nickname !== "string" || typeof value.completedAt !== "string") return null;
  if (
    !finiteNumber(value.score) ||
    !finiteNumber(value.frames) ||
    !finiteNumber(value.deaths) ||
    !finiteNumber(value.cores) ||
    !finiteNumber(value.levels)
  ) {
    return null;
  }
  return {
    id: value.id,
    nickname: sanitizeLeaderboardNickname(value.nickname),
    score: nonNegativeInteger(value.score),
    frames: nonNegativeInteger(value.frames),
    deaths: nonNegativeInteger(value.deaths),
    cores: nonNegativeInteger(value.cores),
    levels: nonNegativeInteger(value.levels),
    completedAt: value.completedAt
  };
};

const sortEntries = (entries: LeaderboardEntry[]): LeaderboardEntry[] =>
  entries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.frames !== b.frames) return a.frames - b.frames;
    if (a.deaths !== b.deaths) return a.deaths - b.deaths;
    if (b.cores !== a.cores) return b.cores - a.cores;
    return b.completedAt.localeCompare(a.completedAt);
  });

const readLocalLeaderboard = (): LeaderboardSaveResult => {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ok: true, entries: [] };
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return { ok: false, entries: [], message: "Local leaderboard data is damaged." };
    }
    const entries = parsed.map(normalizeEntry);
    if (entries.some((entry) => entry === null)) {
      return { ok: false, entries: [], message: "Local leaderboard data is damaged." };
    }
    const normalizedEntries = entries.filter((entry): entry is LeaderboardEntry => entry !== null);
    return { ok: true, entries: sortEntries(normalizedEntries).slice(0, MAX_ENTRIES) };
  } catch {
    return { ok: false, entries: [], message: "Local leaderboard data is damaged." };
  }
};

export const getLocalLeaderboardState = (): LeaderboardSaveResult => readLocalLeaderboard();

export const getLocalLeaderboard = (): LeaderboardEntry[] => getLocalLeaderboardState().entries;

const writeLocalLeaderboard = (entries: LeaderboardEntry[]): boolean => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
    return true;
  } catch {
    return false;
  }
};

const entryId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const addLocalLeaderboardEntry = (nickname: string, summary: CampaignRunSummary): LeaderboardSaveResult => {
  const existing = readLocalLeaderboard();
  if (!existing.ok) return existing;
  const entry: LeaderboardEntry = {
    id: entryId(),
    nickname: sanitizeLeaderboardNickname(nickname),
    score: summary.score,
    frames: summary.frames,
    deaths: summary.deaths,
    cores: summary.cores,
    levels: summary.levels,
    completedAt: new Date().toISOString()
  };
  const entries = sortEntries([entry, ...existing.entries]).slice(0, MAX_ENTRIES);
  if (!writeLocalLeaderboard(entries)) {
    return {
      ok: false,
      entries: existing.entries,
      message: "Could not save to local leaderboard."
    };
  }
  return { ok: true, entries };
};
