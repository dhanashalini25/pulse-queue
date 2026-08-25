require('dotenv').config();

const { Worker } = require('bullmq');
const { createConnection } = require('../config/redis');
const logger = require('../config/logger');
const { dispatch } = require('../queue/processors');
const { MAIN_QUEUE_NAME, sendToDeadLetter } = require('../queue/queue');

const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '5', 10);
const connection = createConnection('worker');

const worker = new Worker(
  MAIN_QUEUE_NAME,
  async (job) => {
    const started = Date.now();
    logger.info(`Job ${job.id} (${job.name}) started — attempt ${job.attemptsMade + 1}/${job.opts.attempts}`);
    const result = await dispatch(job);
    logger.info(`Job ${job.id} (${job.name}) completed in ${Date.now() - started}ms`);
    return result;
  },
  {
    connection,
    concurrency: CONCURRENCY,
  }
);

worker.on('completed', (job) => {
  logger.info(`✔ Job ${job.id} (${job.name}) succeeded`);
});

worker.on('failed', async (job, err) => {
  if (!job) return;
  const isFinalAttempt = job.attemptsMade >= job.opts.attempts;
  logger.error(
    `✘ Job ${job.id} (${job.name}) failed attempt ${job.attemptsMade}/${job.opts.attempts}: ${err.message}`
  );

  if (isFinalAttempt) {
    await sendToDeadLetter(job, err.message);
  }
});

worker.on('error', (err) => {
  logger.error(`Worker error: ${err.message}`);
});

logger.info(`PulseQueue worker started — concurrency=${CONCURRENCY}, queue="${MAIN_QUEUE_NAME}"`);

// Graceful shutdown
async function shutdown(signal) {
  logger.warn(`${signal} received — shutting down worker gracefully...`);
  await worker.close();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = worker;
