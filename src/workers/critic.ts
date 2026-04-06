import { pino } from 'pino';

const logger = pino({ name: 'critic-worker' });

logger.info('Critic worker — not yet implemented (Phase 3)');

process.on('SIGTERM', () => process.exit(0));
