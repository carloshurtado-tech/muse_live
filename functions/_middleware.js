// Access gate for every request (see _routes.json).
// The password is never stored: PW_HASH = sha256('muse-live:' + password).
// Override per environment with the MUSE_PASSWORD_HASH secret.
const PW_HASH = 'b774222f71346737d53bc90fd0572e8b2f86d34b02b16b1c9704cc18a3f85db0';
const SESSION = 'muse_session';
const HINT = 'muse_authed';
const MAX_AGE = 60 * 60 * 24 * 7;

// Served to signed-out visitors: the login page and what it needs to render.
const PUBLIC_PATHS = new Set(['/', '/index.html', '/manifest.webmanifest', '/robots.txt', '/sitemap.xml', '/favicon.ico']);
const PUBLIC_PREFIXES = ['/assets/brand/', '/css/'];

async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

function json(body, status = 200, extra) {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  if (extra) for (const [k, v] of extra) headers.append(k, v);
  return new Response(JSON.stringify(body), { status, headers });
}

export async function onRequest({ request, next, env }) {
  const url = new URL(request.url);
  const path = url.pathname;
  const pwHash = (env && env.MUSE_PASSWORD_HASH) || PW_HASH;
  const token = await sha256hex('muse-session-v1:' + pwHash);
  const authed = readCookie(request, SESSION) === token;
  const secure = url.protocol === 'https:' ? '; Secure' : '';

  if (path === '/api/ping') return json({ ok: true, authed });

  if (path === '/api/login') {
    if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
    let body = {};
    try { body = await request.json(); } catch (e) { /* empty body */ }
    const password = typeof body.password === 'string' ? body.password : '';
    if (!password || password.length > 256) return json({ ok: false, error: 'Enter the access password.' }, 400);
    if ((await sha256hex('muse-live:' + password)) !== pwHash) {
      return json({ ok: false, error: 'The password you entered is incorrect.' }, 401);
    }
    return json({ ok: true }, 200, [
      ['Set-Cookie', `${SESSION}=${token}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secure}`],
      ['Set-Cookie', `${HINT}=1; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${secure}`],
    ]);
  }

  if (path === '/logout') {
    const headers = new Headers({ Location: '/', 'Cache-Control': 'no-store' });
    headers.append('Set-Cookie', `${SESSION}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`);
    headers.append('Set-Cookie', `${HINT}=; Path=/; Max-Age=0; SameSite=Lax${secure}`);
    return new Response(null, { status: 302, headers });
  }

  if (authed) return next();

  if (PUBLIC_PATHS.has(path) || PUBLIC_PREFIXES.some((p) => path.startsWith(p))) return next();
  if (path.startsWith('/api/')) return json({ ok: false, error: 'Sign in required' }, 401);
  // App scripts are withheld until sign-in; an empty module keeps the login page error-free.
  if (path.endsWith('.js') || path.endsWith('.mjs')) {
    return new Response('/* sign in required */\n', {
      status: 200,
      headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  return new Response('Sign in required', { status: 401, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
