import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLang, t } from '../../functions/_lib/strings.js';

function req(lang) { return { headers: { get: (k) => (k === 'Accept-Language' ? lang : null) } }; }

test('resolveLang maps en/es/pt with fallback', () => {
  assert.equal(resolveLang(req('es-MX,es;q=0.9')), 'es');
  assert.equal(resolveLang(req('pt-BR,pt;q=0.9,en;q=0.8')), 'pt');
  assert.equal(resolveLang(req('en-US,en;q=0.9')), 'en');
  assert.equal(resolveLang(req('fr-FR,fr;q=0.9')), 'en');
  assert.equal(resolveLang(req('')), 'en');
});

test('t covers every key in every locale with English fallback', () => {
  const enKeys = ['signIn', 'adminsOnly', 'readOnly', 'forbiddenOrigin', 'badBody', 'badId', 'badDate', 'methodNotAllowed', 'needD1Transcripts', 'needD1Media', 'needR2Media', 'needAuditBinding', 'showRequired', 'titleRequired', 'transcriptTooBig', 'noSuchTranscript', 'noSuchMedia', 'blobMissing', 'storageWriteFailed', 'emptyUpload', 'fileTooBig', 'invalidKey', 'notBase64', 'fileExceeds8', 'badKind', 'badShowKey', 'enterPassword', 'loginMismatch', 'needEmailLogin', 'wrongPassword', 'tooManyLogins', 'tooManyAttempts', 'guestClosed', 'voiceOffGuest', 'misconfigured'];
  for (const lang of ['en', 'es', 'pt', 'xx']) {
    for (const key of enKeys) {
      const s = t(lang, key);
      assert.ok(typeof s === 'string' && s.length > 0, `${lang}.${key}`);
    }
  }
  assert.equal(t('xx', 'signIn'), t('en', 'signIn'));
  assert.equal(t('es', 'signIn'), 'Inicia sesión para continuar.');
  assert.equal(t('pt', 'signIn'), 'Inicie sessão para continuar.');
});
