const rateLimit = require('express-rate-limit');

const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const max = parseInt(process.env.RATE_LIMIT_MAX || '100', 10);

const apiRateLimiter = rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RateLimitExceeded', message: 'Too many requests, please slow down.' },
});

module.exports = { apiRateLimiter };
