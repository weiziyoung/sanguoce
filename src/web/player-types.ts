import type { MatchReward } from './match-reward.ts';

/** Public player data. Authentication cookies and blog emails never enter this contract. */
export interface PlayerProfile {
  id: string;
  nickname: string;
  avatar: string | null;
  kind: 'guest' | 'member';
  points: number;
}

export interface PlayerSession {
  player: PlayerProfile;
  auth: 'signed-in' | 'guest' | 'unavailable';
  loginAvailable: boolean;
  claimableGames: number;
  claimableGuestId: string | null;
}

export interface PersonalGame {
  id: string;
  finishedAt: string;
  mode: 'duel' | 'identity';
  general: string;
  result: 'win' | 'loss' | 'draw';
  turn: number;
  source: 'browser';
  earnedPoints: number;
  reward: MatchReward | null;
}

export interface PlayerHistory {
  total: number;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  games: PersonalGame[];
  nextCursor: string | null;
}

/** Public cumulative score board; never includes blog IDs, credentials or match journals. */
export interface LeaderboardEntry {
  rank: number;
  id: string;
  nickname: string;
  kind: 'guest' | 'member';
  points: number;
}
export interface PlayerLeaderboard { entries: LeaderboardEntry[]; }
