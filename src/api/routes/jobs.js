const express = require('express');
const {
  enqueueJob,
  getJobById,
  retryJob,
  removeJob,
  listJobs,
} = require('../../queue/queue');
const { validateCreateJob } = require('../middleware/validation');
const logger = require('../../config/logger');

const router = express.Router();

// POST /api/jobs — enqueue a new job
router.post('/', validateCreateJob, async (req, res) => {
  try {
    const job = await enqueueJob(req.body);
    res.status(201).json({
      id: job.id,
      type: job.name,
      status: 'queued',
      priority: req.body.priority,
      delayMs: req.body.delayMs,
    });
  } catch (err) {
    logger.error(`Failed to enqueue job: ${err.message}`);
    res.status(500).json({ error: 'InternalError', message: 'Failed to enqueue job' });
  }
});

// GET /api/jobs — list jobs, optionally filtered by status
router.get('/', async (req, res) => {
  try {
    const { status = 'all', start = 0, end = 19 } = req.query;
    const jobs = await listJobs({ status, start: Number(start), end: Number(end) });
    res.json({ status, count: jobs.length, jobs });
  } catch (err) {
    logger.error(`Failed to list jobs: ${err.message}`);
    res.status(500).json({ error: 'InternalError', message: 'Failed to list jobs' });
  }
});

// GET /api/jobs/:id — get single job status + result
router.get('/:id', async (req, res) => {
  try {
    const job = await getJobById(req.params.id);
    if (!job) return res.status(404).json({ error: 'NotFound', message: 'Job not found' });

    const state = await job.getState();
    res.json({
      id: job.id,
      type: job.name,
      status: state,
      payload: job.data.payload,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts,
      priority: job.opts.priority,
      progress: job.progress,
      returnValue: job.returnvalue,
      failedReason: job.failedReason || null,
      enqueuedAt: job.data.enqueuedAt,
      finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    });
  } catch (err) {
    logger.error(`Failed to fetch job ${req.params.id}: ${err.message}`);
    res.status(500).json({ error: 'InternalError', message: 'Failed to fetch job' });
  }
});

// POST /api/jobs/:id/retry — manually retry a failed job
router.post('/:id/retry', async (req, res) => {
  try {
    const job = await retryJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'NotFound', message: 'Job not found' });
    res.json({ id: job.id, status: 'retrying' });
  } catch (err) {
    logger.error(`Failed to retry job ${req.params.id}: ${err.message}`);
    res.status(500).json({ error: 'InternalError', message: 'Failed to retry job' });
  }
});

// DELETE /api/jobs/:id — remove a job
router.delete('/:id', async (req, res) => {
  try {
    const removed = await removeJob(req.params.id);
    if (!removed) return res.status(404).json({ error: 'NotFound', message: 'Job not found' });
    res.status(204).send();
  } catch (err) {
    logger.error(`Failed to remove job ${req.params.id}: ${err.message}`);
    res.status(500).json({ error: 'InternalError', message: 'Failed to remove job' });
  }
});

module.exports = router;
