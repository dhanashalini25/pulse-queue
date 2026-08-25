const express = require('express');
const {
  getQueueStats,
  listDeadLetterJobs,
  replayDeadLetterJob,
  pauseQueue,
  resumeQueue,
} = require('../../queue/queue');
const logger = require('../../config/logger');

const router = express.Router();

// GET /api/queue/stats — throughput / counts / worker+queue health
router.get('/stats', async (req, res) => {
  try {
    const stats = await getQueueStats();
    res.json(stats);
  } catch (err) {
    logger.error(`Failed to fetch queue stats: ${err.message}`);
    res.status(500).json({ error: 'InternalError', message: 'Failed to fetch queue stats' });
  }
});

// GET /api/queue/dead-letter — list dead-lettered jobs
router.get('/dead-letter', async (req, res) => {
  try {
    const { start = 0, end = 49 } = req.query;
    const jobs = await listDeadLetterJobs(Number(start), Number(end));
    res.json({ count: jobs.length, jobs });
  } catch (err) {
    logger.error(`Failed to list dead-letter jobs: ${err.message}`);
    res.status(500).json({ error: 'InternalError', message: 'Failed to list dead-letter jobs' });
  }
});

// POST /api/queue/dead-letter/:id/replay — requeue a dead-lettered job
router.post('/dead-letter/:id/replay', async (req, res) => {
  try {
    const job = await replayDeadLetterJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'NotFound', message: 'Dead-letter job not found' });
    res.json({ newJobId: job.id, status: 'requeued' });
  } catch (err) {
    logger.error(`Failed to replay dead-letter job: ${err.message}`);
    res.status(500).json({ error: 'InternalError', message: 'Failed to replay job' });
  }
});

// POST /api/queue/pause — pause processing
router.post('/pause', async (req, res) => {
  await pauseQueue();
  res.json({ status: 'paused' });
});

// POST /api/queue/resume — resume processing
router.post('/resume', async (req, res) => {
  await resumeQueue();
  res.json({ status: 'resumed' });
});

module.exports = router;
