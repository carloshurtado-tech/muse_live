// @ts-check
// Access gate for every request (see _routes.json).
//
// Sessions are signed tokens carrying the user and role (functions/_lib/session.js).
// Sign-in options, in order of preference:
//   1. SSO (OIDC) when OIDC_ISSUER / OIDC_CLIENT_ID / OIDC_CLIENT_SECRET are set — /api/auth/oidc/start
//   2. Per-user email + password, when accounts exist in KV (functions/api/auth/users.js)
//   3. The shared access password — only while no per-user accounts exist
//      (or ALLOW_SHARED_PASSWORD=true). The password is never stored: PW_HASH = sha256('muse-live:' + password).
// User-facing strings resolve en/es/pt via functions/_lib/strings.js (Accept-Language).
import { json, pwHash, readSession, sha256hex, signSession, sessionCookies, clearCookies, sameOrigin, usingDefaultSecrets } from './_lib/session.js';
import { getUser, hasUsers, normEmail, verifyPassword } from './_lib/users.js';
import { audit } from './_lib/audit.js';
import { resolveLang, t } from './_lib/strings.js';

// Served to signed-out visitors: the login page and what it needs to render.
const PUBLIC_PATHS = new Set(['/', '/index.html', '/about', '/about.html', '/manifest.webmanifest', '/robots.txt', '/sitemap.xml', '/favicon.ico',
  '/api/auth/config', '/api/auth/oidc/start', '/api/auth/oidc/callback',
  // Calendar subscriptions (Google / Outlook) can't send cookies; the handler checks its own token.
  '/api/calendar', '/api/calendar.ics']);
const PUBLIC_PREFIXES = ['/assets/brand/', '/assets/about/', '/css/', '/api/calendar/'];
// Guest demo: anyone can open a read-only 'viewer' session (KV/calendar/telemetry writes refuse it). GUEST_DEMO=off closes it.
const GUEST = { u: 'guest', n: 'Guest reviewer', r: 'viewer' }, GUEST_MAX_AGE = 60 * 60 * 24;
// Pages a signed-out visitor should be sent to the sign-in screen for (instead of a bare 401).
const REDIRECT_PREFIXES = ['/glasses', '/ops'];

// Constant-time dummy: 16 zero-byte salt, 32 zero-byte hash (b64u-encoded). verifyPassword still
// runs PBKDF2 against it so response time doesn't leak whether an email exists.
const DUMMY_USER = { salt: 'AAAAAAAAAAAAAAAAAAAAAA', hash: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', iter: 100000 };

// Login throttle, shared across isolates through MUSE_KV with an in-memory
// fallback (local dev without KV, or a KV outage, keeps throttling per isolate
// instead of failing open). Best-effort coordination: two isolates racing the
// same bucket can each admit one request; the window is short (60 s) and the
// cost of a double-admit is one extra PBKDF2, not a bypass.
const LOGIN_RATE = 10, LOGIN_WINDOW_MS = 60_000, LOGIN_KV_TTL = 120;
const loginBuckets = globalThis.__museLoginBuckets || (globalThis.__museLoginBuckets = new Map());
// Throttle on the client IP (plus the account email when one is given). Never
// on cookie bytes: the caller chooses those, so a fresh cookie per attempt
// would otherwise mint a fresh bucket and make guessing unlimited.
function loginKey(request, email) {
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'local';
  const em = normEmail(email);
  return em ? ip + '|' + em : ip;
}
export async function loginTake(env, key) {
  const now = Date.now();
  let b = loginBuckets.get(key) || { t: LOGIN_RATE, at: now };
  if (env && env.MUSE_KV) {
    try {
      const kv = await env.MUSE_KV.get('login:rl:' + key, 'json');
      if (kv && typeof kv.t === 'number' && typeof kv.at === 'number') b = kv;
    } catch (e) { /* fall through to the memory bucket */ }
  }
  b.t = Math.min(LOGIN_RATE, b.t + (now - b.at) * (LOGIN_RATE / LOGIN_WINDOW_MS)); b.at = now;
  let retry = 0;
  if (b.t < 1) retry = Math.ceil((1 - b.t) * LOGIN_WINDOW_MS / LOGIN_RATE / 1000);
  else b.t -= 1;
  loginBuckets.set(key, b);
  if (env && env.MUSE_KV) {
    try { await env.MUSE_KV.put('login:rl:' + key, JSON.stringify(b), { expirationTtl: LOGIN_KV_TTL }); } catch (e) { /* memory bucket still applies */ }
  }
  return retry;
}

async function login(request, env, secure) {
  const lang = resolveLang(request);
  if (request.method !== 'POST') return json({ ok: false, error: t(lang, 'methodNotAllowed') }, 405);
  if (!sameOrigin(request)) return json({ ok: false, error: t(lang, 'forbiddenOrigin') }, 403);
  let body = {};
  try { body = await request.json(); } catch (e) { /* empty body */ }
  const email = normEmail(body.email);
  const retry = await loginTake(env, loginKey(request, email));
  if (retry) return json({ ok: false, error: t(lang, 'tooManyLogins', { retry }) }, 429);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!password || password.length > 256) return json({ ok: false, error: t(lang, 'enterPassword') }, 400);

  let who = null;
  if (email) {
    const user = await getUser(env, email);
    const active = user && !user.disabled;
    // Always run PBKDF2 so timing doesn't reveal whether the email exists.
    const ok = await verifyPassword(active ? user : DUMMY_USER, password);
    if (active && ok) who = { u: user.email, n: user.name || user.email, r: user.role };
    if (!who) {
      await audit(env, { who: 'anonymous', action: 'login.failed', detail: 'password · ' + (await sha256hex(email)).slice(0, 10) });
      return json({ ok: false, error: t(lang, 'loginMismatch') }, 401);
    }
  } else {
    if ((await hasUsers(env)) && env.ALLOW_SHARED_PASSWORD !== 'true') {
      return json({ ok: false, error: t(lang, 'needEmailLogin'), needEmail: true }, 401);
    }
    if ((await sha256hex('muse-live:' + password)) !== pwHash(env)) {
      await audit(env, { who: 'anonymous', action: 'login.failed', detail: 'shared password' });
      return json({ ok: false, error: t(lang, 'wrongPassword') }, 401);
    }
    who = { u: 'team', n: 'Muse Live team', r: 'admin' };
  }
  await audit(env, { who: who.u, role: who.r, action: 'login', detail: email ? 'password' : 'shared password' });
  return json({ ok: true, user: { email: who.u === 'team' ? null : who.u, name: who.n, role: who.r } }, 200, sessionCookies(await signSession(env, who), secure).map((c) => ['Set-Cookie', c]));
}

async function guestLogin(request, env, secure) {
  const lang = resolveLang(request);
  if (request.method !== 'POST') return json({ ok: false, error: t(lang, 'methodNotAllowed') }, 405);
  if (!sameOrigin(request)) return json({ ok: false, error: t(lang, 'forbiddenOrigin') }, 403);
  if (env.GUEST_DEMO === 'off') return json({ ok: false, error: t(lang, 'guestClosed') }, 403);
  const retry = await loginTake(env, loginKey(request));
  if (retry) return json({ ok: false, error: t(lang, 'tooManyAttempts', { retry }) }, 429);
  await audit(env, { who: GUEST.u, role: GUEST.r, action: 'login', detail: 'guest demo' });
  return json({ ok: true, user: { email: null, name: GUEST.n, role: GUEST.r } }, 200,
    sessionCookies(await signSession(env, GUEST, GUEST_MAX_AGE), secure, GUEST_MAX_AGE).map((c) => ['Set-Cookie', c]));
}

export async function onRequest(context) {
  const { request, next, env } = context;
  const lang = resolveLang(request);
  const url = new URL(request.url);
  const path = url.pathname;
  // The router ignores case and a trailing slash, so every gate below compares
  // this one normalised path; otherwise /API/… or /api/voice/ would skip checks.
  const p = path.toLowerCase().replace(/\/+$/, '') || '/';
  const secure = url.protocol === 'https:';
  // Refuse to run on https without a deployment-specific signing secret: otherwise session HMAC
  // keys derive from DEFAULT_PW_HASH (a public constant) and tokens can be forged offline.
  if (secure && usingDefaultSecrets(env)) {
    return new Response(t(lang, 'misconfigured'),
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  const session = await readSession(request, env);
  let authed = !!session;
  if (authed && session.u === GUEST.u && env.GUEST_DEMO === 'off') authed = false;

  // Accounts disabled after sign-in lose API access immediately (checked on API calls only,
  // so static assets don't cost a KV read each).
  if (authed && session.u !== 'team' && session.u !== GUEST.u && p.startsWith('/api/') && env.MUSE_KV) {
    const user = await getUser(env, session.u);
    if (!user || user.disabled) authed = false;
    else if (user.role !== session.r) session.r = user.role; // role changes apply immediately
  }
  if (context.data) context.data.user = authed ? session : null;

  if (p === '/api/ping') return json({ ok: true, authed });
  if (p === '/api/login' || p === '/api/auth/login') return login(request, env, secure);
  if (p === '/api/auth/guest') return guestLogin(request, env, secure);
  // Voice transcription spends model credit and has no rate limit of its own: not for read-only sessions.
  if (authed && session.r === 'viewer' && p === '/api/voice') return json({ ok: false, error: t(lang, 'voiceOffGuest') }, 403);
  if (p === '/logout' || p === '/api/auth/logout') {
    if (authed) await audit(env, { who: session.u, role: session.r, action: 'logout' });
    const headers = new Headers({ Location: '/', 'Cache-Control': 'no-store' });
    for (const c of clearCookies(secure)) headers.append('Set-Cookie', c);
    return new Response(null, { status: 302, headers });
  }

  if (authed) return next();

  if (PUBLIC_PATHS.has(p) || PUBLIC_PREFIXES.some((x) => p.startsWith(x)) || p.endsWith('.css')) return next();
  if (p.startsWith('/api/')) return json({ ok: false, error: t(lang, 'signIn') }, 401);
  if (REDIRECT_PREFIXES.some((x) => p === x || p.startsWith(x + '/')) && !/\.(m?js|css|json|map)$/.test(p)) {
    return new Response(null, { status: 302, headers: { Location: '/?next=' + encodeURIComponent(path + url.search), 'Cache-Control': 'no-store' } });
  }
  // App scripts are withheld until sign-in; an empty module keeps the login page error-free.
  if (p.endsWith('.js') || p.endsWith('.mjs')) {
    return new Response('/* sign in required */\n', {
      status: 200,
      headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  return new Response(t(lang, 'signIn'), { status: 401, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
