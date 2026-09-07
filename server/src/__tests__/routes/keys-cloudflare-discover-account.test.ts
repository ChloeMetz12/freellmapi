import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../app.js';
import { initDb } from '../../db/index.js';
import { mintDashboardToken } from '../helpers/auth.js';

// #cloudflare-api-token-auth: the Add-key form's Cloudflare pane pairs each
// token with an account id that most users have to dig out of a dashboard
// URL. POST /api/keys/cloudflare/discover-account calls Cloudflare's own
// GET /accounts with the pasted token so the form can fill it in instead.

const realFetch = globalThis.fetch;

let dashToken = '';

async function post(app: Express, path: string, body: unknown) {
  const server = app.listen(0, '127.0.0.1');
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', () => resolve()));
  const addr = server.address() as { port: number };
  const res = await realFetch(`http://127.0.0.1:${addr.port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dashToken}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  server.close();
  return { status: res.status, body: json as any };
}

describe('POST /api/keys/cloudflare/discover-account', () => {
  let app: Express;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    app = createApp();
    dashToken = mintDashboardToken();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('returns the accounts the token can see', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        result: [{ id: 'acc-1', name: 'My Account' }],
      }),
    } as any));

    const { status, body } = await post(app, '/api/keys/cloudflare/discover-account', { token: 'my-token' });
    expect(status).toBe(200);
    expect(body.accounts).toEqual([{ id: 'acc-1', name: 'My Account' }]);
  });

  it('surfaces a 403 from a Workers-AI-scoped token as a clean error, not a 500', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async () => ({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: () => Promise.resolve({ success: false, errors: [{ code: 9109, message: 'Unauthorized to access requested resource' }] }),
    } as any));

    const { status, body } = await post(app, '/api/keys/cloudflare/discover-account', { token: 'my-token' });
    expect(status).toBe(403);
    expect(body.error.message).toContain('Unauthorized to access requested resource');
  });

  it('400s on a missing token', async () => {
    const { status, body } = await post(app, '/api/keys/cloudflare/discover-account', {});
    expect(status).toBe(400);
    expect(body.error.message).toBeTruthy();
  });

  it('requires dashboard auth', async () => {
    const server = app.listen(0, '127.0.0.1');
    if (!server.listening) await new Promise<void>(resolve => server.once('listening', () => resolve()));
    const addr = server.address() as { port: number };
    const res = await realFetch(`http://127.0.0.1:${addr.port}/api/keys/cloudflare/discover-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'my-token' }),
    });
    server.close();
    expect(res.status).toBe(401);
  });
});
