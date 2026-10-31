import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost, validateTelemetryConfig } from '../../functions/api/telemetry.js';
import { memoryKV, ctx } from './helpers.mjs';

const editor = { u: 'ana@meta.com', n: 'Ana', r: 'engineer' };
const viewer = { u: 'vic@meta.com', n: 'Vic', r: 'viewer' };
const cookie = (s) => ({ Cookie: 'muse_session=' + s });

test('validateTelemetryConfig accepts the documented shape', () => {
  assert.equal(validateTelemetryConfig({}), null);
  assert.equal(validateTelemetryConfig({ aws: {}, mux: {} }), null);
  assert.equal(validateTelemetryConfig({ aws: { region: 'us-east-1', medialiveChannelId: '123', mediaconnectFlowArn: 'arn:x', cloudfrontDistributionId: 'ABC' }, mux: { videoId: 'dQw4w9WgXcQ' } }), null);
  assert.equal(validateTelemetryConfig({ aws: { region: '' } }), null); // empty = absent downstream
});

test('validateTelemetryConfig rejects unknown keys, wrong types and overlong values', () => {
  assert.match(validateTelemetryConfig({ evil: {} }), /Unknown field: evil/);
  assert.match(validateTelemetryConfig({ aws: { region: 'us-east-1', secret: 'x' } }), /Unknown field: aws\.secret/);
  assert.match(validateTelemetryConfig({ mux: { videoId: 42 } }), /must be a string/);
  assert.match(validateTelemetryConfig({ aws: 'us-east-1' }), /must be an object/);
  assert.match(validateTelemetryConfig({ aws: { region: 'x'.repeat(257) } }), /too long/);
  assert.match(validateTelemetryConfig(null), /must be a JSON object/);
  assert.match(validateTelemetryConfig([]), /must be a JSON object/);
});

test('POST enforces schema, roles, origin and size without credentials', async () => {
  const env = { MUSE_KV: memoryKV() };
  const post = (body, headers = {}, user = editor) =>
    onRequestPost(ctx('/api/telemetry', { method: 'POST', body, env, user, headers: { ...cookie('tel-' + Math.random()), ...headers } }));

  const ok = await post({}); // valid but nothing configured → honest errors, no fan-out
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).stages, {});

  assert.equal((await post({ aws: { secret: 'x' } })).status, 400);
  assert.equal((await post({ mux: { videoId: 7 } })).status, 400);
  assert.equal((await post('{oops')).status, 400);
  assert.equal((await post({}, {}, viewer)).status, 403);
  assert.equal((await post({}, { Origin: 'https://evil.example' })).status, 403);
  const big = await post(JSON.stringify({ aws: { region: 'x'.repeat(20000) } }));
  assert.equal(big.status, 413);
});

test('POST is rate limited per session', async () => {
  const env = { MUSE_KV: memoryKV() };
  const ck = 'tel-rate-' + Math.random();
  let last = null;
  for (let i = 0; i < 61; i++) {
    last = await onRequestPost(ctx('/api/telemetry', { method: 'POST', body: {}, env, user: editor, headers: cookie(ck) }));
  }
  assert.equal(last.status, 429);
});
