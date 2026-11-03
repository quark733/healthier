import type { CivilDate } from '../src/lib/date';
import { sessionKeys, type StrengthSession } from '../src/pipeline/strength';
import { decrypt, encrypt } from './crypto';
import { withTransaction, type Db } from './db';

/**
 * Storage for strength training from StrengthLog. Kept apart from repo.ts, which mirrors Google
 * Health, so the two never touch each other's rows.
 */

/** What the link to StrengthLog last did, shown on the Training page. Never holds a secret. */
export interface StrengthStatus {
  /** When the person last connected, and whether the link still works. */
  connectedAt?: string;
  connected?: boolean;
  lastSyncAt?: string;
  /** Plain words for what went wrong, or absent when the last sync worked. */
  lastError?: string | null;
  /** Sets the parser couldn't read in the last sync: a sign StrengthLog changed its format. */
  unread?: number;
  /** How the last sessions arrived: by the sync, or pasted in. */
  via?: 'sync' | 'paste';
}

/** The OAuth client and tokens for StrengthLog's MCP server. Stored encrypted, whole. */
export interface StrengthSecrets {
  clientId: string;
  clientSecret?: string;
  tokenEndpoint: string;
  refreshToken?: string;
  accessToken?: string;
  /** Epoch ms. */
  accessTokenExpiresAt?: number;
  /** The MCP session id the server last handed out, reused while it lasts. */
  mcpSession?: string;
}

/**
 * Store sessions. With a range, the stored sessions inside it are replaced by these, so a session
 * deleted in StrengthLog goes here too; without one, these are added or updated and nothing else
 * changes.
 */
export async function storeStrengthSessions(
  db: Db,
  userId: string,
  sessions: StrengthSession[],
  replace?: { from: CivilDate; to: CivilDate },
): Promise<void> {
  const keys = sessionKeys(sessions);
  await withTransaction(db, async (client) => {
    if (replace) {
      await client.query('DELETE FROM strength_sessions WHERE user_id = $1 AND date BETWEEN $2 AND $3', [userId, replace.from, replace.to]);
    }
    for (let i = 0; i < sessions.length; i++) {
      await client.query(
        `INSERT INTO strength_sessions (user_id, key, date, value) VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (user_id, key) DO UPDATE SET date = EXCLUDED.date, value = EXCLUDED.value, imported_at = now()`,
        [userId, keys[i], sessions[i].date, JSON.stringify(sessions[i])],
      );
    }
  });
}

/** Every stored session, oldest first. */
export async function getStrengthSessions(db: Db, userId: string): Promise<StrengthSession[]> {
  const { rows } = await db.query<{ value: StrengthSession }>(
    'SELECT value FROM strength_sessions WHERE user_id = $1 ORDER BY date, key',
    [userId],
  );
  return rows.map((r) => r.value);
}

export async function newestStrengthDate(db: Db, userId: string): Promise<CivilDate | null> {
  const { rows } = await db.query<{ d: string | null }>(
    "SELECT to_char(max(date), 'YYYY-MM-DD') AS d FROM strength_sessions WHERE user_id = $1",
    [userId],
  );
  return (rows[0]?.d as CivilDate | null) ?? null;
}

export async function getStrengthLink(
  db: Db,
  key: Buffer,
  userId: string,
): Promise<{ secrets: StrengthSecrets | null; status: StrengthStatus } | null> {
  const { rows } = await db.query<{ secrets: Buffer | null; status: StrengthStatus }>(
    'SELECT secrets, status FROM strength_links WHERE user_id = $1',
    [userId],
  );
  if (!rows[0]) return null;
  const secrets = rows[0].secrets ? (JSON.parse(decrypt(key, rows[0].secrets)) as StrengthSecrets) : null;
  return { secrets, status: rows[0].status ?? {} };
}

/** Save the secrets (null forgets them, undefined keeps what's there) and merge the status. */
export async function saveStrengthLink(
  db: Db,
  key: Buffer,
  userId: string,
  secrets: StrengthSecrets | null | undefined,
  status: StrengthStatus,
): Promise<void> {
  const blob = secrets ? encrypt(key, JSON.stringify(secrets)) : null;
  await db.query(
    `INSERT INTO strength_links (user_id, secrets, status) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (user_id) DO UPDATE SET
       secrets = CASE WHEN $4 THEN EXCLUDED.secrets ELSE strength_links.secrets END,
       status = strength_links.status || EXCLUDED.status,
       updated_at = now()`,
    [userId, blob, JSON.stringify(status), secrets !== undefined],
  );
}

/** Disconnect StrengthLog: forget the tokens and every stored session. */
export async function deleteStrength(db: Db, userId: string): Promise<void> {
  await withTransaction(db, async (client) => {
    await client.query('DELETE FROM strength_links WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM strength_sessions WHERE user_id = $1', [userId]);
  });
}

/** Everyone with a working link, for the scheduled syncs. */
export async function usersWithStrengthLink(db: Db): Promise<string[]> {
  const { rows } = await db.query<{ user_id: string }>(
    "SELECT user_id FROM strength_links WHERE secrets IS NOT NULL AND coalesce((status->>'connected')::boolean, false)",
  );
  return rows.map((r) => r.user_id);
}
