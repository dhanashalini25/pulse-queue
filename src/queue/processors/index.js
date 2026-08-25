const emailProcessor = require('./emailProcessor');
const reportProcessor = require('./reportProcessor');

/**
 * Registry mapping job "type" -> handler function.
 * Add new job types here as the platform grows.
 */
const registry = {
  email: emailProcessor,
  report: reportProcessor,
};

/**
 * Generic fallback processor for unknown/demo job types —
 * keeps the platform usable out of the box without extra setup.
 */
async function genericProcessor(job) {
  await new Promise((resolve) => setTimeout(resolve, 200));
  return { echoed: job.data.payload, processedAt: new Date().toISOString() };
}

async function dispatch(job) {
  const handler = registry[job.name] || genericProcessor;
  return handler(job);
}

module.exports = { dispatch, registry };
