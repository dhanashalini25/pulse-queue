require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');

const logger = require('../config/logger');
const { apiRateLimiter } = require('./middleware/rateLimiter');
const jobsRouter = require('./routes/jobs');
const queueStatsRouter = require('./routes/queueStats');
const { mainQueue, deadLetterQueue } = require('../queue/queue');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '1mb' }));

// --- Static UI (public/) — the operational dashboard at "/" ---
app.use(express.static(path.join(__dirname, '../../public')));

// --- Monitoring dashboard (Bull Board) with basic auth ---
const dashboardUser = process.env.DASHBOARD_USER || 'admin';
const dashboardPassword = process.env.DASHBOARD_PASSWORD || 'changeme';

function basicAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) {
    res.set('WWW-Authenticate', 'Basic realm="PulseQueue Dashboard"');
    return res.status(401).send('Authentication required');
  }
  const [, encoded] = header.split(' ');
  const [user, pass] = Buffer.from(encoded, 'base64').toString().split(':');
  if (user === dashboardUser && pass === dashboardPassword) return next();
  res.set('WWW-Authenticate', 'Basic realm="PulseQueue Dashboard"');
  return res.status(401).send('Invalid credentials');
}

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');
createBullBoard({
  queues: [new BullMQAdapter(mainQueue), new BullMQAdapter(deadLetterQueue)],
  serverAdapter,
});
app.use('/admin/queues', basicAuth, serverAdapter.getRouter());

// --- API routes ---
app.use('/api/jobs', apiRateLimiter, jobsRouter);
app.use('/api/queue', apiRateLimiter, queueStatsRouter);

// --- Health check (for load balancers / deploy platforms) ---
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'pulse-queue', timestamp: new Date().toISOString() });
});

app.get('/api/info', (req, res) => {
  res.json({
    service: 'PulseQueue',
    description: 'Distributed background job processing platform',
    docs: '/health, /api/jobs, /api/queue/stats, /admin/queues (dashboard)',
  });
});

// --- 404 + error handling ---
app.use((req, res) => {
  res.status(404).json({ error: 'NotFound', message: 'Route not found' });
});

app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.stack || err.message}`);
  res.status(500).json({ error: 'InternalError', message: 'Something went wrong' });
});

app.listen(PORT, () => {
  logger.info(`PulseQueue API listening on port ${PORT}`);
  logger.info(`Dashboard available at http://localhost:${PORT}/admin/queues`);
});

// --- Optional embedded worker ---
// On hosts where only a single (free) service is available, set EMBED_WORKER=true
// to run the BullMQ worker in this same process instead of as a separate service.
// Local dev / docker-compose keep the API and worker as independent processes by
// leaving this unset (see README for details on the tradeoffs).
if (process.env.EMBED_WORKER === 'true') {
  require('../worker/worker');
  logger.info('Embedded worker started in-process (EMBED_WORKER=true)');
}

module.exports = app;