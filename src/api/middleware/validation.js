const Joi = require('joi');
const { PRIORITY_LEVELS } = require('../../queue/queue');

const createJobSchema = Joi.object({
  type: Joi.string().trim().min(1).max(100).required(),
  payload: Joi.object().unknown(true).default({}),
  priority: Joi.string()
    .valid(...Object.keys(PRIORITY_LEVELS))
    .default('normal'),
  delayMs: Joi.number().integer().min(0).max(1000 * 60 * 60 * 24 * 7).default(0), // max 7 days
  attempts: Joi.number().integer().min(1).max(10),
  jobId: Joi.string().trim().max(200),
});

function validateCreateJob(req, res, next) {
  const { error, value } = createJobSchema.validate(req.body, { abortEarly: false, stripUnknown: false });
  if (error) {
    return res.status(400).json({
      error: 'ValidationError',
      details: error.details.map((d) => d.message),
    });
  }
  req.body = value;
  next();
}

module.exports = { validateCreateJob };
