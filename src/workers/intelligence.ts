import { pino } from 'pino';

const logger = pino({ name: 'intelligence-worker' });

logger.info('Intelligence worker — not yet implemented (Phase 3)');

process.on('SIGTERM', () => process.exit(0));
