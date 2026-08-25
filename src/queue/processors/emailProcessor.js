const logger = require('../../config/logger');

/**
 * Simulated email-sending job.
 * Replace with a real provider (SES, SendGrid, etc.) in production.
 */
module.exports = async function emailProcessor(job) {
  const { to, subject } = job.data.payload || {};

  if (!to) {
    throw new Error('emailProcessor: "to" address is required in payload');
  }

  logger.info(`[email] Sending "${subject || '(no subject)'}" to ${to} (job ${job.id})`);

  // Simulate network latency / provider call
  await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 700));

  // Simulate occasional transient failure to exercise the retry path
  if (Math.random() < 0.1) {
    throw new Error('Simulated transient email provider timeout');
  }

  return { delivered: true, to, subject, sentAt: new Date().toISOString() };
};
