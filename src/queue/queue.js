const { Queue, QueueEvents } = require('bullmq');
const { createConnection } = require('../config/redis');
const logger = require('../config/logger');

require('dotenv').config();

const MAIN_QUEUE_NAME = 'pulse-jobs';
const DEAD_LETTER_QUEUE_NAME = 'pulse-dead-letter';

const DEFAULT_ATTEMPTS = parseInt(process.env.JOB_DEFAULT_ATTEMPTS || '3', 10);
const BACKOFF_DELAY_MS = parseInt(process.env.JOB_BACKOFF_DELAY_MS || '2000', 10);

// Priority mapping — lower number = higher priority in BullMQ.
const PRIORITY_LEVELS = {
  critical: 1,
  high: 2,
  normal: 3,
  low: 4,
};

const connection = createConnection('queue');

const mainQueue = new Queue(MAIN_QUEUE_NAME, { connection });
const deadLetterQueue = new Queue(DEAD_LETTER_QUEUE_NAME, { connection });

const queueEvents = new QueueEvents(MAIN_QUEUE_NAME, { connection });

/**
 * Enqueue a job onto the main queue.
 * Supports priority, delay (scheduling), custom retry attempts, and backoff.
 */
async function enqueueJob({
  type,
  payload = {},
  priority = 'normal',
  delayMs = 0,
  attempts,
  jobId,
}) {
  const priorityValue = PRIORITY_LEVELS[priority] ?? PRIORITY_LEVELS.normal;

  const job = await mainQueue.add(
    type,
    { type, payload, enqueuedAt: new Date().toISOString() },
    {
      jobId,
      priority: priorityValue,
      delay: delayMs,
      attempts: attempts ?? DEFAULT_ATTEMPTS,
      backoff: { type: 'exponential', delay: BACKOFF_DELAY_MS },
      removeOnComplete: { age: 3600, count: 1000 }, // keep last 1000 / 1hr for stats
      removeOnFail: false, // keep failures around until moved to DLQ or inspected
    }
  );

  logger.info(`Job enqueued: ${job.id} (type=${type}, priority=${priority}, delay=${delayMs}ms)`);
  return job;
}

/**
 * Move a permanently-failed job to the dead-letter queue for later inspection/replay.
 */
async function sendToDeadLetter(job, reason) {
  await deadLetterQueue.add(
    job.name,
    {
      originalId: job.id,
      type: job.name,
      payload: job.data.payload,
      failedReason: reason,
      attemptsMade: job.attemptsMade,
      diedAt: new Date().toISOString(),
    },
    { removeOnComplete: false, removeOnFail: false }
  );
  logger.warn(`Job ${job.id} moved to dead-letter queue: ${reason}`);
}

async function getJobById(id) {
  return mainQueue.getJob(id);
}

async function retryJob(id) {
  const job = await mainQueue.getJob(id);
  if (!job) return null;
  await job.retry();
  logger.info(`Job ${id} manually retried`);
  return job;
}

async function removeJob(id) {
  const job = await mainQueue.getJob(id);
  if (!job) return false;
  await job.remove();
  return true;
}

async function listJobs({ status = 'all', start = 0, end = 19 } = {}) {
  const statusMap = {
    waiting: ['waiting'],
    active: ['active'],
    completed: ['completed'],
    failed: ['failed'],
    delayed: ['delayed'],
    all: ['waiting', 'active', 'completed', 'failed', 'delayed'],
  };
  const states = statusMap[status] || statusMap.all;
  const jobs = await mainQueue.getJobs(states, start, end, true);
  return Promise.all(
    jobs.map(async (job) => ({
      id: job.id,
      type: job.name,
      payload: job.data.payload,
      status: await job.getState(),
      attemptsMade: job.attemptsMade,
      priority: job.opts.priority,
      enqueuedAt: job.data.enqueuedAt,
      failedReason: job.failedReason || null,
    }))
  );
}

async function getQueueStats() {
  const counts = await mainQueue.getJobCounts(
    'waiting',
    'active',
    'completed',
    'failed',
    'delayed',
    'paused'
  );
  const deadLetterCount = await deadLetterQueue.getJobCounts('waiting', 'completed');
  return {
    queue: MAIN_QUEUE_NAME,
    counts,
    deadLetter: {
      total: (deadLetterCount.waiting || 0) + (deadLetterCount.completed || 0),
    },
    isPaused: await mainQueue.isPaused(),
  };
}

async function listDeadLetterJobs(start = 0, end = 49) {
  const jobs = await deadLetterQueue.getJobs(['waiting', 'completed'], start, end, true);
  return jobs.map((job) => ({
    id: job.id,
    originalId: job.data.originalId,
    type: job.data.type,
    payload: job.data.payload,
    failedReason: job.data.failedReason,
    attemptsMade: job.data.attemptsMade,
    diedAt: job.data.diedAt,
  }));
}

/**
 * Replay a dead-letter job back onto the main queue.
 */
async function replayDeadLetterJob(dlqJobId) {
  const dlqJob = await deadLetterQueue.getJob(dlqJobId);
  if (!dlqJob) return null;
  const newJob = await enqueueJob({
    type: dlqJob.data.type,
    payload: dlqJob.data.payload,
    priority: 'normal',
  });
  await dlqJob.remove();
  logger.info(`Dead-letter job ${dlqJobId} replayed as new job ${newJob.id}`);
  return newJob;
}

async function pauseQueue() {
  await mainQueue.pause();
}

async function resumeQueue() {
  await mainQueue.resume();
}

module.exports = {
  MAIN_QUEUE_NAME,
  DEAD_LETTER_QUEUE_NAME,
  PRIORITY_LEVELS,
  mainQueue,
  deadLetterQueue,
  queueEvents,
  enqueueJob,
  sendToDeadLetter,
  getJobById,
  retryJob,
  removeJob,
  listJobs,
  getQueueStats,
  listDeadLetterJobs,
  replayDeadLetterJob,
  pauseQueue,
  resumeQueue,
};
