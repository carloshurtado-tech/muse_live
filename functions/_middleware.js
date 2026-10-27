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

// Per-IP+session login throttle. shortcut: in-memory per isolate — fine for the demo team; move to MUSE_KV when it bottlenecks.
const LOGIN_RATE = 10, LOGIN_WINDOW_MS = 60_000;
const loginBuckets = globalThis.__museLoginBuckets || (globalThis.__museLoginBuckets = new Map());
function loginKey(request) {
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'local';
  const c = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)muse_session=([^;]+)/);
  return ip + '|' + (c ? c[1].slice(-16) : '-');
}
function loginTake(key) {
  const now = Date.now(), b = loginBuckets.get(key) || { t: LOGIN_RATE, at: now };
  b.t = Math.min(LOGIN_RATE, b.t + (now - b.at) * (LOGIN_RATE / LOGIN_WINDOW_MS)); b.at = now;
  if (b.t < 1) { loginBuckets.set(key, b); return Math.ceil((1 - b.t) * LOGIN_WINDOW_MS / LOGIN_RATE / 1000); }
  b.t -= 1; loginBuckets.set(key, b); return 0;
}

async function login(request, env, secure) {
  const lang = resolveLang(request);
  if (request.method !== 'POST') return json({ ok: false, error: t(lang, 'methodNotAllowed') }, 405);
  if (!sameOrigin(request)) return json({ ok: false, error: t(lang, 'forbiddenOrigin') }, 403);
  const retry = loginTake(loginKey(request));
  if (retry) return json({ ok: false, error: t(lang, 'tooManyLogins', { retry }) }, 429);
  let body = {};
  try { body = await request.json(); } catch (e) { /* empty body */ }
  const password = typeof body.password === 'string' ? body.password : '';
  const email = normEmail(body.email);
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
  const retry = loginTake(loginKey(request));
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
  if (authed && session.u !== 'team' && session.u !== GUEST.u && path.startsWith('/api/') && env.MUSE_KV) {
    const user = await getUser(env, session.u);
    if (!user || user.disabled) authed = false;
    else if (user.role !== session.r) session.r = user.role; // role changes apply immediately
  }
  if (context.data) context.data.user = authed ? session : null;

  if (path === '/api/ping') return json({ ok: true, authed });
  if (path === '/api/login' || path === '/api/auth/login') return login(request, env, secure);
  if (path === '/api/auth/guest') return guestLogin(request, env, secure);
  // Voice transcription spends model credit and has no rate limit of its own: not for read-only sessions.
  if (authed && session.r === 'viewer' && path === '/api/voice') return json({ ok: false, error: t(lang, 'voiceOffGuest') }, 403);
  if (path === '/logout' || path === '/api/auth/logout') {
    if (authed) await audit(env, { who: session.u, role: session.r, action: 'logout' });
    const headers = new Headers({ Location: '/', 'Cache-Control': 'no-store' });
    for (const c of clearCookies(secure)) headers.append('Set-Cookie', c);
    return new Response(null, { status: 302, headers });
  }

  if (authed) return next();

  if (PUBLIC_PATHS.has(path) || PUBLIC_PREFIXES.some((p) => path.startsWith(p)) || path.endsWith('.css')) return next();
  if (path.startsWith('/api/')) return json({ ok: false, error: t(lang, 'signIn') }, 401);
  if (REDIRECT_PREFIXES.some((p) => path === p || path.startsWith(p + '/')) && !/\.(m?js|css|json|map)$/.test(path)) {
    return new Response(null, { status: 302, headers: { Location: '/?next=' + encodeURIComponent(path + url.search), 'Cache-Control': 'no-store' } });
  }
  // App scripts are withheld until sign-in; an empty module keeps the login page error-free.
  if (path.endsWith('.js') || path.endsWith('.mjs')) {
    return new Response('/* sign in required */\n', {
      status: 200,
      headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  return new Response(t(lang, 'signIn'), { status: 401, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
