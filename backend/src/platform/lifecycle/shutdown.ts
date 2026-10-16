import { logger } from '../logging/logger.js';

/**
 * Shared graceful-shutdown wiring for all 4 entrypoints
 * (ARCHITECTURE.md §1). Each `main.*.ts` passes its own cleanup steps;
 * SIGTERM/SIGINT run them once, in order, then exit.
 */
export function registerShutdown(processName: string, cleanup: () => Promise<void>): void {
  let shuttingDown = false;

  const handle = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal, processName }, 'Shutting down');
    cleanup()
      .then(() => {
        logger.info({ processName }, 'Shutdown complete');
        process.exit(0);
      })
      .catch((err: unknown) => {
        logger.error({ err, processName }, 'Error during shutdown');
        process.exit(1);
      });
  };

  process.on('SIGTERM', () => {
    handle('SIGTERM');
  });
  process.on('SIGINT', () => {
    handle('SIGINT');
  });
}
