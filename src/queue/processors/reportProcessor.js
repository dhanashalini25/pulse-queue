const logger = require('../../config/logger');

/**
 * Simulated long-running report generation job.
 * Demonstrates progress reporting via job.updateProgress.
 */
module.exports = async function reportProcessor(job) {
  const { reportType = 'generic' } = job.data.payload || {};
  const steps = 5;

  logger.info(`[report] Generating "${reportType}" report (job ${job.id})`);

  for (let i = 1; i <= steps; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    await job.updateProgress(Math.round((i / steps) * 100));
  }

  return { reportType, generatedAt: new Date().toISOString(), rows: Math.floor(Math.random() * 1000) };
};
