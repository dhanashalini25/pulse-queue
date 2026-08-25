const test = require('node:test');
const assert = require('node:assert');

// We test the Joi schema logic in isolation by re-requiring the module.
// (Requires the queue module, which needs Redis config but not a live connection
// for schema validation itself.)
const { validateCreateJob } = require('../src/api/middleware/validation');

function runMiddleware(body) {
  const req = { body };
  let statusCode = null;
  let jsonBody = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      jsonBody = payload;
      return this;
    },
  };
  let nextCalled = false;
  const next = () => {
    nextCalled = true;
  };
  validateCreateJob(req, res, next);
  return { req, statusCode, jsonBody, nextCalled };
}

test('accepts a valid job body and fills defaults', () => {
  const { nextCalled, req } = runMiddleware({ type: 'email', payload: { to: 'a@b.com' } });
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(req.body.priority, 'normal');
  assert.strictEqual(req.body.delayMs, 0);
});

test('rejects a job body missing "type"', () => {
  const { statusCode, jsonBody, nextCalled } = runMiddleware({ payload: {} });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(statusCode, 400);
  assert.strictEqual(jsonBody.error, 'ValidationError');
});

test('rejects an invalid priority level', () => {
  const { statusCode, nextCalled } = runMiddleware({ type: 'email', priority: 'urgentish' });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(statusCode, 400);
});
