// AWS Signature V4 — official test-suite vectors (used by the CloudWatch telemetry adapter).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

const file = path.join(ROOT, 'functions/api/telemetry.js');
const mod = fs.existsSync(file) ? await import(file) : {};
const creds = { service: 'service', region: 'us-east-1', accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', amzDate: '20150830T123600Z' };

test('get-vanilla', { skip: !mod.sigv4Sign && 'telemetry adapter not present' }, async () => {
  const h = await mod.sigv4Sign({ method: 'GET', url: 'https://example.amazonaws.com/', ...creds });
  assert.equal(h.authorization, 'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31');
});
test('get-vanilla-query-order-key-case', { skip: !mod.sigv4Sign && 'telemetry adapter not present' }, async () => {
  const h = await mod.sigv4Sign({ method: 'GET', url: 'https://example.amazonaws.com/?Param2=value2&Param1=value1', ...creds });
  assert.equal(h.authorization.split('Signature=')[1], 'b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500');
});
