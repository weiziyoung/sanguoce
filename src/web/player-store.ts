import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { PersonalGame, PlayerHistory, PlayerProfile, PlayerLeaderboard } from './player-types.ts';
import type { MatchReward } from './match-reward.ts';

export const tokenHash = (token: string): string => createHash('sha256').update(token).digest('hex');
export const newToken = (): string => randomBytes(32).toString('base64url');
const GUEST_LIFETIME = 365 * 24 * 60 * 60 * 1000;
interface PlayerRow {
  id: string; blog_id: string | null; nickname: string; custom_name: number;
  avatar: string | null; merged_into: string | null;
}
export interface MatchRow {
  id: string; player_id: string; mode: 'duel' | 'identity'; seed: number;
  expires_at: number; document_hash: string | null;
}

/** One private SQLite database; all identity changes and history merges are transactional. */
export class PlayerStore {
  private db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY, blog_id TEXT UNIQUE, nickname TEXT NOT NULL,
        custom_name INTEGER NOT NULL DEFAULT 0, avatar TEXT, created_at INTEGER NOT NULL,
        merged_into TEXT REFERENCES players(id));
      CREATE TABLE IF NOT EXISTS guest_sessions (
        token_hash TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id), expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, player_id TEXT NOT NULL REFERENCES players(id),
        mode TEXT NOT NULL, seed INTEGER NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
        document_hash TEXT, finished_at TEXT, result TEXT, summary TEXT);
      CREATE INDEX IF NOT EXISTS matches_player ON matches(player_id, finished_at, id);
      CREATE TABLE IF NOT EXISTS player_merges (
        guest_id TEXT PRIMARY KEY REFERENCES players(id), member_id TEXT NOT NULL REFERENCES players(id), created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS match_rewards (
        match_id TEXT PRIMARY KEY REFERENCES matches(id), points INTEGER NOT NULL CHECK(points>=0), breakdown TEXT NOT NULL);
      PRAGMA user_version=2;`);
  }
  close(): void { this.db.close(); }

  private row(id: string): PlayerRow {
    const row = this.db.prepare('SELECT * FROM players WHERE id=?').get(id) as unknown as PlayerRow | undefined;
    if (!row) throw new Error('玩家不存在');
    return row;
  }
  canonical(id: string): string {
    const row = this.row(id);
    return row.merged_into ?? row.id;
  }
  profile(id: string): PlayerProfile {
    const row = this.row(this.canonical(id));
    const points = Number(this.db.prepare(`SELECT coalesce(sum(r.points),0) AS points FROM match_rewards r
      JOIN matches m ON m.id=r.match_id WHERE m.player_id=?`).get(row.id)!.points);
    return { id: row.id, nickname: row.nickname, avatar: row.avatar, kind: row.blog_id ? 'member' : 'guest', points };
  }
  private createGuest(): PlayerProfile {
    const id = randomUUID();
    const nickname = `游侠·${randomBytes(3).toString('hex').toUpperCase()}`;
    this.db.prepare('INSERT INTO players(id,nickname,created_at) VALUES(?,?,?)').run(id, nickname, Date.now());
    return this.profile(id);
  }
  guest(token: string | undefined): PlayerProfile | null {
    if (!token || !/^[\w-]{43}$/.test(token)) return null;
    const row = this.db.prepare('SELECT player_id FROM guest_sessions WHERE token_hash=? AND expires_at>?')
      .get(tokenHash(token), Date.now()) as { player_id: string } | undefined;
    if (!row) return null;
    const player = this.profile(row.player_id);
    return player.kind === 'guest' ? player : null;
  }
  issueGuest(): { player: PlayerProfile; token: string } {
    return this.transaction(() => {
      this.db.prepare('DELETE FROM guest_sessions WHERE expires_at<=?').run(Date.now());
      const player = this.createGuest(), token = newToken();
      this.db.prepare('INSERT INTO guest_sessions VALUES(?,?,?)').run(tokenHash(token), player.id, Date.now() + GUEST_LIFETIME);
      return { player, token };
    });
  }
  member(blog: { id: string; name?: string; image?: string }): PlayerProfile {
    const existing = this.db.prepare('SELECT id FROM players WHERE blog_id=?').get(blog.id) as { id: string } | undefined;
    const name = (blog.name || '三国游侠').slice(0, 24);
    const avatar = blog.image && /^https:\/\//i.test(blog.image) ? blog.image.slice(0, 2048) : null;
    if (existing) {
      this.db.prepare('UPDATE players SET avatar=?, nickname=CASE WHEN custom_name=0 THEN ? ELSE nickname END WHERE id=?')
        .run(avatar, name, existing.id);
      return this.profile(existing.id);
    }
    const id = randomUUID();
    this.db.prepare('INSERT INTO players(id,blog_id,nickname,avatar,created_at) VALUES(?,?,?,?,?)')
      .run(id, blog.id, name, avatar, Date.now());
    return this.profile(id);
  }
  rename(id: string, nickname: string): PlayerProfile {
    this.db.prepare('UPDATE players SET nickname=?,custom_name=1 WHERE id=?').run(nickname, this.canonical(id));
    return this.profile(id);
  }
  count(id: string): number {
    return Number(this.db.prepare('SELECT count(*) AS n FROM matches WHERE player_id=? AND summary IS NOT NULL')
      .get(this.canonical(id))!.n);
  }
  claim(guestId: string, memberId: string): number {
    return this.transaction(() => {
      const guest = this.row(guestId), member = this.row(memberId);
      if (guest.blog_id || guest.merged_into || !member.blog_id) throw new Error('游客记录不可认领');
      const count = this.count(guestId);
      this.db.prepare('UPDATE matches SET player_id=? WHERE player_id=?').run(memberId, guestId);
      this.db.prepare('UPDATE players SET merged_into=? WHERE id=?').run(memberId, guestId);
      this.db.prepare('INSERT INTO player_merges VALUES(?,?,?)').run(guestId, memberId, Date.now());
      this.db.prepare('DELETE FROM guest_sessions WHERE player_id=?').run(guestId);
      return count;
    });
  }
  start(id: string, mode: 'duel' | 'identity', seed: number): string {
    const token = newToken();
    this.db.prepare(`INSERT INTO matches(id,token_hash,player_id,mode,seed,created_at,expires_at)
      VALUES(?,?,?,?,?,?,?)`).run(randomUUID(), tokenHash(token), id, mode, seed, Date.now(), Date.now() + 7 * 86400_000);
    return token;
  }
  match(token: string): MatchRow | null {
    if (!/^[\w-]{43}$/.test(token)) return null;
    return this.db.prepare('SELECT * FROM matches WHERE token_hash=?').get(tokenHash(token)) as unknown as MatchRow | undefined ?? null;
  }
  finish(id: string, hash: string, summary: PersonalGame): void {
    if (!summary.reward || summary.earnedPoints !== summary.reward.total || !Number.isSafeInteger(summary.earnedPoints) || summary.earnedPoints < 0)
      throw new Error('无效的积分记录');
    this.transaction(() => {
      const updated = this.db.prepare(`UPDATE matches SET document_hash=?,finished_at=?,result=?,summary=?
        WHERE id=? AND document_hash IS NULL`).run(hash, summary.finishedAt, summary.result, JSON.stringify(summary), id);
      if (updated.changes) this.db.prepare('INSERT INTO match_rewards VALUES(?,?,?)')
        .run(id, summary.earnedPoints, JSON.stringify(summary.reward));
    });
  }
  history(id: string, cursor: string | null = null): PlayerHistory {
    const playerId = this.canonical(id);
    const totals = this.db.prepare(`SELECT count(*) AS total,
      coalesce(sum(m.result='win'),0) AS wins, coalesce(sum(m.result='loss'),0) AS losses,
      coalesce(sum(m.result='draw'),0) AS draws, coalesce(sum(r.points),0) AS points
      FROM matches m LEFT JOIN match_rewards r ON r.match_id=m.id WHERE m.player_id=? AND m.summary IS NOT NULL`)
      .get(playerId) as unknown as Pick<PlayerHistory, 'total' | 'wins' | 'losses' | 'draws' | 'points'>;
    const anchor = cursor ? this.db.prepare('SELECT finished_at,id FROM matches WHERE id=? AND player_id=? AND summary IS NOT NULL')
      .get(cursor, playerId) as { finished_at: string; id: string } | undefined : undefined;
    // An invalid or foreign cursor cannot expose another player's games.
    if (cursor && !anchor) return { ...totals, games: [], nextCursor: null };
    const rows = (anchor
      ? this.db.prepare(`SELECT summary FROM matches WHERE player_id=? AND summary IS NOT NULL
        AND (finished_at<? OR (finished_at=? AND id<?)) ORDER BY finished_at DESC,id DESC LIMIT 21`)
        .all(playerId, anchor.finished_at, anchor.finished_at, anchor.id)
      : this.db.prepare(`SELECT summary FROM matches WHERE player_id=? AND summary IS NOT NULL
        ORDER BY finished_at DESC,id DESC LIMIT 21`).all(playerId)) as { summary: string }[];
    // Pre-reward history has no ledger entry; keep it readable without retroactive awards.
    const games = rows.slice(0, 20).map(row => ({ earnedPoints: 0, reward: null, ...JSON.parse(row.summary) }) as PersonalGame);
    return { ...totals, games, nextCursor: rows.length > 20 ? games.at(-1)!.id : null };
  }
  receipt(matchId: string, playerId: string): { earnedPoints: number; totalPoints: number; reward: MatchReward | null } {
    const row = this.db.prepare('SELECT points,breakdown FROM match_rewards WHERE match_id=?')
      .get(matchId) as { points: number; breakdown: string } | undefined;
    return { earnedPoints: row?.points ?? 0, reward: row ? JSON.parse(row.breakdown) as MatchReward : null,
      totalPoints: this.profile(playerId).points };
  }
  leaderboard(): PlayerLeaderboard {
    const rows = this.db.prepare(`SELECT p.id,p.nickname,p.blog_id IS NOT NULL AS member,sum(r.points) AS points
      FROM players p JOIN matches m ON m.player_id=p.id JOIN match_rewards r ON r.match_id=m.id
      WHERE p.merged_into IS NULL AND m.summary IS NOT NULL
      GROUP BY p.id HAVING sum(r.points)>0
      ORDER BY points DESC,p.created_at ASC,p.id ASC LIMIT 10`)
      .all() as unknown as { id: string; nickname: string; member: number; points: number }[];
    return { entries: rows.map((row, index) => ({ rank: index + 1, id: row.id, nickname: row.nickname,
      kind: row.member ? 'member' : 'guest', points: row.points })) };
  }
  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = work(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}
