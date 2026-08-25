require('dotenv').config();
const { enqueueJob } = require('../queue/queue');

async function seed() {
  console.log('Seeding PulseQueue with demo jobs...');

  await enqueueJob({ type: 'email', payload: { to: 'user@example.com', subject: 'Welcome!' }, priority: 'high' });
  await enqueueJob({ type: 'report', payload: { reportType: 'weekly-sales' }, priority: 'normal' });
  await enqueueJob({ type: 'email', payload: { to: 'ops@example.com', subject: 'Nightly digest' }, priority: 'low', delayMs: 5000 });
  await enqueueJob({ type: 'report', payload: { reportType: 'audit-log' }, priority: 'critical' });

  console.log('Seed complete. Check /api/queue/stats or /admin/queues.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
