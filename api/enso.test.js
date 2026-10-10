import test from 'node:test';
import assert from 'node:assert/strict';

import handler from './enso.js';

function mockResponse() {
  return {
    headers: {},
    statusCode: null,
    payload: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.payload = value;
      return this;
    },
  };
}

test('returns the latest NOAA ONI season and distinguishes persistent El Niño-range values', async () => {
  const originalFetch = globalThis.fetch;
  const rows = [
    'JJA 2025  27.10  0.00',
    'JAS 2025  27.20  0.60',
    'ASO 2025  27.30  0.70',
    'SON 2025  27.40  0.80',
    'OND 2025  27.50  0.90',
    'NDJ 2025  27.60  1.00',
  ].join('\n');
  globalThis.fetch = async () => new Response(rows, { status: 200 });
  const response = mockResponse();

  try {
    await handler({ method: 'GET' }, response);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.payload.latest, { season: 'NDJ', year: 2025, oni: 1 });
  assert.equal(response.payload.phase, 'El Niño-range ONI for 5 overlapping seasons');
  assert.equal(response.payload.recent.length, 6);
  assert.match(response.headers['Cache-Control'], /s-maxage=21600/);
});

test('reports non-persistent threshold readings without claiming five-season conditions', async () => {
  const originalFetch = globalThis.fetch;
  const rows = [
    'JJA 2025  27.10  0.00',
    'JAS 2025  27.20  0.10',
    'ASO 2025  27.30  0.20',
    'SON 2025  27.40  0.30',
    'OND 2025  27.50  0.40',
    'NDJ 2025  27.60  0.60',
  ].join('\n');
  globalThis.fetch = async () => new Response(rows, { status: 200 });
  const response = mockResponse();

  try {
    await handler({ method: 'GET' }, response);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(response.payload.phase, 'El Niño-range ONI; persistence not yet met');
});
