const IORedis = require('ioredis');
const logger = require('./logger');

require('dotenv').config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

/**
 * BullMQ requires maxRetriesPerRequest to be null on the connection
 * it manages internally for blocking commands.
 */
function createConnection(label = 'redis') {
  const connection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  connection.on('connect', () => logger.info(`[${label}] Redis connecting...`));
  connection.on('ready', () => logger.info(`[${label}] Redis connection ready`));
  connection.on('error', (err) => logger.error(`[${label}] Redis error: ${err.message}`));
  connection.on('close', () => logger.warn(`[${label}] Redis connection closed`));

  return connection;
}

module.exports = { createConnection, REDIS_URL };
