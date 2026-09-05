import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../app.js';
import { initDb } from '../../db/index.js';
import { mintDashboardToken } from '../helpers/auth.js';
import { applyProxyUrl } from '../../lib/proxy.js';

async function request(app: Express, method: string, path: string, body: any, token: string) {
  const server = app.listen(0, '127.0.0.1');
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', () => resolve()));
  const addr = server.address() as any;
  const res = await fetch(`http://127.0.0.1:${addr.port}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  server.close();
  let json: any = null;
  try { json = JSON.parse(raw); } catch {}
  return { status: res.status, body: json };
}

// PUT /api/settings/proxy is the only place a proxy URL is validated, so the
// scheme allow-list here is what actually decides whether a user can save
// `socks5h://` from the dashboard (#630).
// Ambient proxy env vars (upper- and lower-case spellings) that resolveProxySource
// falls back to when the dashboard setting is empty. A host or CI environment that
// exports one of these (e.g. behind a corporate/sandbox proxy) would otherwise leak
// through and break the "clears the proxy" case below, so they're stripped for the
// duration of this suite and restored afterward.
const ENV_PROXY_VARS = ['PROXY_URL', 'ALL_PROXY', 'all_proxy', 'HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'];

describe('PUT /api/settings/proxy scheme validation', () => {
  let app: Express;
  let token: string;
  let savedEnv: Record<string, string | undefined>;

  beforeAll(() => {
    savedEnv = Object.fromEntries(ENV_PROXY_VARS.map(name => [name, process.env[name]]));
    for (const name of ENV_PROXY_VARS) delete process.env[name];
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    app = createApp();
    token = mintDashboardToken();
  });

  afterAll(() => {
    applyProxyUrl('');
    for (const name of ENV_PROXY_VARS) {
      if (savedEnv[name] === undefined) delete process.env[name];
      else process.env[name] = savedEnv[name];
    }
  });

  const accepted = [
    'http://proxy.corp.com:8080',
    'https://proxy.corp.com:8443',
    'socks5://127.0.0.1:1080',
    'socks5h://127.0.0.1:1080',
    'socks4://127.0.0.1:1080',
    'socks4a://127.0.0.1:1080',
  ];

  for (const proxyUrl of accepted) {
    it(`accepts ${proxyUrl}`, async () => {
      const { status, body } = await request(app, 'PUT', '/api/settings/proxy', { proxyUrl }, token);
      expect(status).toBe(200);
      expect(body.proxyUrl).toBe(proxyUrl);
    });
  }

  it('accepts socks5h with credentials', async () => {
    const proxyUrl = 'socks5h://user:pass@127.0.0.1:1080';
    const { status, body } = await request(app, 'PUT', '/api/settings/proxy', { proxyUrl }, token);
    expect(status).toBe(200);
    expect(body.proxyUrl).toBe(proxyUrl);
  });

  it('rejects an unsupported scheme', async () => {
    const { status, body } = await request(app, 'PUT', '/api/settings/proxy', { proxyUrl: 'ftp://proxy:21' }, token);
    expect(status).toBe(400);
    expect(body.error.message).toMatch(/socks5h/);
  });

  it('rejects a malformed URL', async () => {
    const { status, body } = await request(app, 'PUT', '/api/settings/proxy', { proxyUrl: 'not a url' }, token);
    expect(status).toBe(400);
    expect(body.error.type).toBe('invalid_request_error');
  });

  it('clears the proxy on an empty string', async () => {
    const { status, body } = await request(app, 'PUT', '/api/settings/proxy', { proxyUrl: '' }, token);
    expect(status).toBe(200);
    expect(body.proxyUrl).toBe('');
  });
});
