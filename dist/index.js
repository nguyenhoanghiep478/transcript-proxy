import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { transcriptRouter } from './routes/transcript.js';
const app = new Hono();
// ─── Middleware ──────────────────────────────────────────────────────
app.use('*', logger());
app.use('*', cors({
    origin: (origin) => {
        // Allow configured origins + localhost for dev
        const allowed = (process.env.ALLOWED_ORIGINS || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        // Always allow localhost in dev
        if (!origin)
            return '*';
        if (allowed.includes(origin))
            return origin;
        if (origin.includes('localhost') || origin.includes('127.0.0.1'))
            return origin;
        return '';
    },
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    maxAge: 86400,
}));
// ─── API Key Auth (optional — set PROXY_API_KEY env to enable) ─────
app.use('/api/*', async (c, next) => {
    const apiKey = process.env.PROXY_API_KEY;
    if (!apiKey)
        return next(); // No key configured → open access
    const provided = c.req.header('X-API-Key') || c.req.query('apiKey');
    if (provided !== apiKey) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    return next();
});
// ─── Routes ─────────────────────────────────────────────────────────
app.get('/', (c) => c.json({
    service: 'transcript-proxy',
    version: '1.0.0',
    status: 'ok',
    endpoints: {
        health: 'GET /health',
        transcript: 'GET /api/transcript?videoId=VIDEO_ID',
        manualParse: 'POST /api/transcript/parse',
    },
}));
app.get('/health', (c) => c.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() }));
app.route('/api', transcriptRouter);
// ─── Start server ───────────────────────────────────────────────────
const port = Number(process.env.PORT) || 3001;
serve({ fetch: app.fetch, port }, (info) => {
    console.log(`🎙️  Transcript Proxy running on http://localhost:${info.port}`);
});
//# sourceMappingURL=index.js.map