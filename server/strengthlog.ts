import { createHash } from 'node:crypto';
import { Router } from 'express';
import { addDays, type CivilDate } from '../src/lib/date';
import { parseSessions, unreadCount, type StrengthSession } from '../src/pipeline/strength';
import { requireUser, sessionCookieOptions } from './auth';
import { randomToken } from './crypto';
import { asyncHandler, type Deps } from './http';
import {
  getStrengthLink, newestStrengthDate, saveStrengthLink, storeStrengthSessions, usersWithStrengthLink,
  type StrengthSecrets,
} from './strength-repo';

/**
 * StrengthLog, through its MCP server: the same read-only tools an AI assistant gets, called by
 * this server on the person's behalf once they've signed in to StrengthLog here.
 *
 * Signing in is standard MCP authorization (OAuth 2.1): the MCP server names its authorization
 * server (RFC 9728), that server describes itself (RFC 8414), this install registers itself as a
 * client (RFC 7591) and signs the person in with PKCE. StrengthLog doesn't document this use, so
 * every step reports plainly what it got, and a failure leaves the stored sessions as they were.
 */

export const MCP_URL = process.env.STRENGTHLOG_MCP_URL || 'https://mcp.strengthlog.com/mcp';
const PROTOCOL = '2025-06-18';
const STATE_COOKIE = 'healthier_strengthlog';
const STATE_TTL_MS = 10 * 60 * 1000;
/** get_sessions returns at most this many a call. */
const PAGE = 50;
/** History starts no earlier than this, which is before StrengthLog existed. */
const EARLIEST: CivilDate = '2015-01-01';
/** A sync refetches this many days before the newest stored session: late edits land there. */
const REFETCH_DAYS = 14;
/** How often a background sync runs per person. */
const SYNC_EVERY_MS = 6 * 60 * 60 * 1000;

const today = (): CivilDate => new Date().toISOString().slice(0, 10) as CivilDate;
const callbackUrl = (deps: Deps) => `${deps.config.appUrl}/auth/strengthlog/callback`;

// ─────────────────────────────────────────────────────────── discovery

interface AuthMetadata {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  client_id_metadata_document_supported?: boolean;
}

async function getJson(url: string): Promise<any | null> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } }).catch(() => null);
  if (!res || !res.ok) return null;
  return res.json().catch(() => null);
}

/** Where StrengthLog signs people in, found the way MCP clients find it. */
export async function discover(): Promise<AuthMetadata> {
  const mcp = new URL(MCP_URL);
  const resource =
    (await getJson(`${mcp.origin}/.well-known/oauth-protected-resource${mcp.pathname}`)) ??
    (await getJson(`${mcp.origin}/.well-known/oauth-protected-resource`));
  const issuers: string[] = resource?.authorization_servers?.length ? resource.authorization_servers : [mcp.origin];
  for (const issuer of issuers) {
    const base = issuer.replace(/\/$/, '');
    const issuerUrl = new URL(base);
    const candidates = [
      `${issuerUrl.origin}/.well-known/oauth-authorization-server${issuerUrl.pathname === '/' ? '' : issuerUrl.pathname}`,
      `${base}/.well-known/oauth-authorization-server`,
      `${base}/.well-known/openid-configuration`,
    ];
    for (const url of candidates) {
      const meta = await getJson(url);
      if (meta?.authorization_endpoint && meta?.token_endpoint) return meta as AuthMetadata;
    }
  }
  throw new StrengthError('StrengthLog didn’t say where to sign in (no OAuth metadata found).');
}

export class StrengthError extends Error {}

/** Where this install describes itself as an OAuth client (a Client ID Metadata Document). */
export const clientMetadataUrl = (deps: Deps) => `${deps.config.appUrl}/oauth/strengthlog-client.json`;

/** The client description StrengthLog fetches from this install when someone signs in. */
export const clientMetadata = (deps: Deps) => ({
  client_id: clientMetadataUrl(deps),
  client_name: 'HealthCheck (private dashboard)',
  client_uri: deps.config.appUrl,
  redirect_uris: [callbackUrl(deps)],
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  token_endpoint_auth_method: 'none',
});

/**
 * Identify this install to StrengthLog's authorization server. StrengthLog takes a Client ID
 * Metadata Document: the client id is the address of a JSON description this server publishes, so
 * there's nothing to register. Servers that instead take dynamic registration (RFC 7591) get that.
 */
async function identify(deps: Deps, meta: AuthMetadata): Promise<Pick<StrengthSecrets, 'clientId' | 'clientSecret'>> {
  if (meta.client_id_metadata_document_supported) return { clientId: clientMetadataUrl(deps) };
  if (!meta.registration_endpoint) {
    throw new StrengthError('StrengthLog doesn’t let new apps identify themselves (no client metadata or registration).');
  }
  const res = await fetch(meta.registration_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(clientMetadata(deps)),
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || !body.client_id) {
    throw new StrengthError(`StrengthLog refused to register this app (${res.status} ${body.error ?? ''}).`.trim());
  }
  return { clientId: body.client_id, clientSecret: body.client_secret };
}

const pkce = () => {
  const verifier = randomToken(48);
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
};

// ───────────────────────────────────────────────────────────── tokens

async function tokenRequest(secrets: StrengthSecrets, params: Record<string, string>) {
  const body = new URLSearchParams({ ...params, client_id: secrets.clientId, resource: MCP_URL });
  if (secrets.clientSecret) body.set('client_secret', secrets.clientSecret);
  const res = await fetch(secrets.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    const reason = json.error === 'invalid_grant' ? 'StrengthLog ended the sign-in; connect again.' : `token request failed (${res.status} ${json.error ?? ''})`;
    throw new StrengthError(reason.trim());
  }
  return {
    ...secrets,
    accessToken: json.access_token as string,
    // Some servers rotate the refresh token; keep the newest.
    refreshToken: (json.refresh_token as string | undefined) ?? secrets.refreshToken,
    accessTokenExpiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000,
  } satisfies StrengthSecrets;
}

async function freshSecrets(deps: Deps, userId: string, secrets: StrengthSecrets, force = false): Promise<StrengthSecrets> {
  if (!force && secrets.accessToken && (secrets.accessTokenExpiresAt ?? 0) > Date.now() + 60_000) return secrets;
  if (!secrets.refreshToken) throw new StrengthError('StrengthLog gave no lasting sign-in; connect again.');
  const next = await tokenRequest(secrets, { grant_type: 'refresh_token', refresh_token: secrets.refreshToken });
  await saveStrengthLink(deps.db, deps.config.encryptionKey, userId, next, {});
  return next;
}

// ──────────────────────────────────────────────────────────── MCP calls

/** A JSON-RPC reply, from a plain JSON body or from a stream of server-sent events. */
async function readRpc(res: Response, id: number): Promise<any> {
  const type = res.headers.get('content-type') ?? '';
  const text = await res.text();
  if (type.includes('text/event-stream')) {
    for (const block of text.split(/\n\n/)) {
      const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
      if (!data) continue;
      try {
        const msg = JSON.parse(data);
        if (msg.id === id) return msg;
      } catch {
        // Not JSON: a keep-alive or a comment.
      }
    }
    throw new StrengthError('StrengthLog’s reply had no answer in it.');
  }
  return text ? JSON.parse(text) : null;
}

class McpClient {
  private session: string | undefined;
  private nextId = 1;
  constructor(private token: string) {}

  private async post(body: object, expectReply: boolean): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${this.token}`,
      'MCP-Protocol-Version': PROTOCOL,
    };
    if (this.session) headers['Mcp-Session-Id'] = this.session;
    const res = await fetch(MCP_URL, { method: 'POST', headers, body: JSON.stringify(body) });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok && res.status !== 202) throw new StrengthError(`StrengthLog answered ${res.status}.`);
    this.session = res.headers.get('mcp-session-id') ?? this.session;
    return expectReply ? readRpc(res, (body as any).id) : null;
  }

  async initialize() {
    const id = this.nextId++;
    const reply = await this.post(
      { jsonrpc: '2.0', id, method: 'initialize', params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'healthcheck', version: '1' } } },
      true,
    );
    if (reply?.error) throw new StrengthError(`StrengthLog wouldn’t start a session: ${reply.error.message ?? 'unknown error'}`);
    await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' }, false);
  }

  /** Call a tool and return the text it wrote. */
  async tool(name: string, args: Record<string, unknown>): Promise<string> {
    const id = this.nextId++;
    const reply = await this.post({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }, true);
    if (reply?.error) throw new StrengthError(`${name} failed: ${reply.error.message ?? 'unknown error'}`);
    const content: any[] = reply?.result?.content ?? [];
    if (reply?.result?.isError) throw new StrengthError(`${name} failed: ${content.map((c) => c.text).join(' ')}`);
    return content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  }
}

class UnauthorizedError extends StrengthError {
  constructor() {
    super('StrengthLog no longer accepts this sign-in.');
  }
}

/** Run `fn` with a signed-in MCP client, refreshing the sign-in once if StrengthLog asks. */
async function withMcp<T>(deps: Deps, userId: string, fn: (mcp: McpClient) => Promise<T>): Promise<T> {
  const link = await getStrengthLink(deps.db, deps.config.encryptionKey, userId);
  if (!link?.secrets?.refreshToken && !link?.secrets?.accessToken) throw new StrengthError('StrengthLog isn’t connected.');
  let secrets = await freshSecrets(deps, userId, link.secrets);
  for (let attempt = 0; ; attempt++) {
    const mcp = new McpClient(secrets.accessToken!);
    try {
      await mcp.initialize();
      return await fn(mcp);
    } catch (err) {
      if (!(err instanceof UnauthorizedError) || attempt > 0) throw err;
      secrets = await freshSecrets(deps, userId, secrets, true);
    }
  }
}

// ───────────────────────────────────────────────────────────── syncing

/**
 * Every session between two dates. get_sessions returns at most 50 a call and says how many
 * matched, so a range with more is split in half until each part fits.
 */
async function sessionsBetween(mcp: McpClient, from: CivilDate, to: CivilDate): Promise<StrengthSession[]> {
  const parsed = parseSessions(await mcp.tool('get_sessions', { from, to, limit: PAGE }));
  if (!parsed.kilograms) throw new StrengthError('StrengthLog reports weights in pounds; switch it to kilograms.');
  if (parsed.total === null || parsed.shown === null || parsed.total <= parsed.shown) return parsed.sessions;
  if (from === to) return parsed.sessions; // more than 50 in one day: keep what came
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
  const mid = addDays(from, Math.floor(days / 2));
  return [...(await sessionsBetween(mcp, from, mid)), ...(await sessionsBetween(mcp, addDays(mid, 1), to))];
}

const running = new Set<string>();

/** Whether a sync for this person is under way. */
export const isSyncingStrength = (userId: string) => running.has(userId);

/**
 * Bring stored sessions up to date. The first time, the whole history, a year at a time back to
 * the first year with nothing in it; after that, the last couple of weeks, replaced whole so edits
 * and deletions in StrengthLog come through.
 */
export async function syncStrength(deps: Deps, userId: string): Promise<{ sessions: number }> {
  if (running.has(userId)) return { sessions: 0 };
  running.add(userId);
  try {
    const newest = await newestStrengthDate(deps.db, userId);
    const end = today();
    let count = 0;
    let unread = 0;
    await withMcp(deps, userId, async (mcp) => {
      if (newest) {
        const from = addDays(newest, -REFETCH_DAYS);
        const sessions = await sessionsBetween(mcp, from, end);
        await storeStrengthSessions(deps.db, userId, sessions, { from, to: end });
        count = sessions.length;
        unread = sessions.reduce((n, s) => n + unreadCount(s), 0);
        return;
      }
      let to = end;
      let emptyYears = 0;
      while (to > EARLIEST && emptyYears < 2) {
        const from = addDays(to, -364);
        const sessions = await sessionsBetween(mcp, from, to);
        await storeStrengthSessions(deps.db, userId, sessions, { from, to });
        count += sessions.length;
        unread += sessions.reduce((n, s) => n + unreadCount(s), 0);
        emptyYears = sessions.length ? 0 : emptyYears + 1;
        to = addDays(from, -1);
      }
    });
    await saveStrengthLink(deps.db, deps.config.encryptionKey, userId, undefined, {
      connected: true, lastSyncAt: new Date().toISOString(), lastError: null, unread, via: 'sync',
    });
    return { sessions: count };
  } catch (err) {
    const message = err instanceof StrengthError ? err.message : 'The sync failed; it will try again.';
    if (!(err instanceof StrengthError)) console.error('StrengthLog sync failed:', err);
    const signedOut = err instanceof UnauthorizedError || /connect again/.test(message);
    await saveStrengthLink(deps.db, deps.config.encryptionKey, userId, undefined, {
      lastError: message, ...(signedOut ? { connected: false } : {}),
    });
    throw err;
  } finally {
    running.delete(userId);
  }
}

/** Sync everyone linked, one at a time, every few hours. */
export function startStrengthScheduler(deps: Deps): void {
  const tick = async () => {
    const users = await usersWithStrengthLink(deps.db).catch(() => []);
    for (const userId of users) {
      const link = await getStrengthLink(deps.db, deps.config.encryptionKey, userId).catch(() => null);
      const last = link?.status.lastSyncAt ? Date.parse(link.status.lastSyncAt) : 0;
      if (Date.now() - last < SYNC_EVERY_MS) continue;
      await syncStrength(deps, userId).catch(() => {});
    }
  };
  setTimeout(() => void tick(), 30_000);
  setInterval(() => void tick(), 30 * 60 * 1000);
}

// ────────────────────────────────────────────────────────────── routes

/** Connecting: /auth/strengthlog sends the person to StrengthLog, the callback stores the sign-in. */
export function strengthAuthRoutes(deps: Deps): Router {
  const router = Router();
  const back = (code: string) => `/?strength=${encodeURIComponent(code)}`;

  // Public on purpose: StrengthLog's authorization server reads it to learn who is asking.
  router.get('/oauth/strengthlog-client.json', (req, res) => {
    res.set('Cache-Control', 'public, max-age=3600').json(clientMetadata(deps));
  });

  router.get(
    '/auth/strengthlog',
    requireUser(deps),
    asyncHandler(async (req, res) => {
      const userId: string = res.locals.userId;
      try {
        const meta = await discover();
        const link = await getStrengthLink(deps.db, deps.config.encryptionKey, userId);
        let secrets = link?.secrets;
        const wanted = meta.client_id_metadata_document_supported ? clientMetadataUrl(deps) : null;
        if (!secrets?.clientId || secrets.tokenEndpoint !== meta.token_endpoint || (wanted && secrets.clientId !== wanted)) {
          secrets = { ...(await identify(deps, meta)), tokenEndpoint: meta.token_endpoint };
          await saveStrengthLink(deps.db, deps.config.encryptionKey, userId, secrets, {});
        }
        const state = randomToken(16);
        const { verifier, challenge } = pkce();
        res.cookie(STATE_COOKIE, `${state}.${verifier}`, { ...sessionCookieOptions(deps, STATE_TTL_MS), path: '/auth/strengthlog' });
        const url = new URL(meta.authorization_endpoint);
        url.search = new URLSearchParams({
          response_type: 'code',
          client_id: secrets.clientId,
          redirect_uri: callbackUrl(deps),
          state,
          code_challenge: challenge,
          code_challenge_method: 'S256',
          resource: MCP_URL,
          ...(meta.scopes_supported?.length ? { scope: meta.scopes_supported.join(' ') } : {}),
        }).toString();
        res.redirect(url.toString());
      } catch (err) {
        const message = err instanceof StrengthError ? err.message : 'Couldn’t reach StrengthLog.';
        if (!(err instanceof StrengthError)) console.error('StrengthLog connect failed:', err);
        await saveStrengthLink(deps.db, deps.config.encryptionKey, userId, undefined, { lastError: message });
        res.redirect(back('connect_failed'));
      }
    }),
  );

  router.get(
    '/auth/strengthlog/callback',
    requireUser(deps),
    asyncHandler(async (req, res) => {
      const userId: string = res.locals.userId;
      const [expected, verifier] = String(req.cookies[STATE_COOKIE] ?? '').split('.');
      res.clearCookie(STATE_COOKIE, { ...sessionCookieOptions(deps), path: '/auth/strengthlog' });
      const { code, state, error } = req.query;
      if (typeof error === 'string') return res.redirect(back(error));
      if (typeof code !== 'string' || state !== expected || !verifier) return res.redirect(back('invalid_state'));
      try {
        const link = await getStrengthLink(deps.db, deps.config.encryptionKey, userId);
        if (!link?.secrets) throw new StrengthError('The sign-in started without a registered app; try again.');
        const secrets = await tokenRequest(link.secrets, {
          grant_type: 'authorization_code', code, redirect_uri: callbackUrl(deps), code_verifier: verifier,
        });
        await saveStrengthLink(deps.db, deps.config.encryptionKey, userId, secrets, {
          connected: true, connectedAt: new Date().toISOString(), lastError: null,
        });
        // The first sync reads the whole history; the page shows it as it lands.
        void syncStrength(deps, userId).catch(() => {});
        res.redirect(back('connected'));
      } catch (err) {
        const message = err instanceof StrengthError ? err.message : 'Signing in to StrengthLog failed.';
        if (!(err instanceof StrengthError)) console.error('StrengthLog callback failed:', err);
        await saveStrengthLink(deps.db, deps.config.encryptionKey, userId, undefined, { lastError: message, connected: false });
        res.redirect(back('callback_failed'));
      }
    }),
  );

  return router;
}
