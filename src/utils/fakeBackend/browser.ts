import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';
import { seedDemoData } from './db';

export const worker = setupWorker(...handlers);

export async function setupDemoMode(isDemo) {
  if (isDemo) {
    await seedDemoData();
    console.log(
      '%c Demo Mode Active: Network Interception Enabled.',
      'color: #ff9900; font-weight: bold;'
    );
    return worker.start({
      onUnhandledRequest: 'bypass',
      quiet: true,
    });
  } else {
    console.log(
      '%c Demo Mode Deactivated: Normal Network Flow Restored.',
      'color: #00cc66; font-weight: bold;'
    );
    worker.stop();
  }
}
