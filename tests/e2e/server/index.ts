/**
 * Unified test server for e2e tests.
 *
 * Mirrors the pattern from the main Bruno repo (packages/bruno-tests/src/index.js).
 * Playwright auto-starts this via the webServer config.
 *
 * Endpoints:
 *   GET  /ping                                    - Health check
 *   GET  /headers                                 - Echo request headers
 *   POST /api/echo/json                           - Echo JSON body
 *   *    /api/auth/oauth2/client_credentials/*     - Client credentials flow
 *   *    /api/auth/oauth2/password_credentials/*   - Password credentials flow
 *   *    /api/auth/oauth2/authorization_code/*     - Authorization code flow
 *   *    /api/auth/oauth2/implicit/*               - Implicit flow
 *   GET  /api/auth/oauth2/resource                - Protected resource (all flows)
 *   POST /api/auth/oauth2/refresh                 - Token refresh
 *   POST /api/auth/oauth2/reset                   - Reset all OAuth2 state
 */

import express from 'express';
import cors from 'cors';
import { oauth2Router } from './auth/oauth2';

const app = express();
const port = process.env.PORT || 8081;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Core endpoints ---

app.get('/ping', (_req, res) => {
  res.send('pong');
});

app.get('/headers', (req, res) => {
  res.json(req.headers);
});

// Capture a header so e2e tests can assert (from Node) exactly what the extension SENT — used to
// verify pre-request scripts ran and variables interpolated, without relying on the response UI.
let lastCapturedToken: string | undefined;
app.get('/capture', (req, res) => {
  lastCapturedToken = req.headers['x-token'] as string | undefined;
  res.json({ ok: true });
});
app.get('/last-capture', (_req, res) => {
  res.json({ token: lastCapturedToken ?? null });
});

// Minimal HTML page (with a relative asset) to exercise the HTML response preview's <base href>.
app.get('/htmlpage', (_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send('<html><head><title>t</title></head><body><img src="logo.png"/>hello</body></html>');
});

app.post('/api/echo/json', (req, res) => {
  res.json(req.body);
});

// --- Auth ---

app.use('/api/auth/oauth2', oauth2Router);

// --- Start ---

app.listen(port, () => {
  console.log(`[test-server] Listening on http://127.0.0.1:${port}`);
});
