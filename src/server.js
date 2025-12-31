// 🔥 MUST BE FIRST
import './env.js';

import app from './app.js';
import { ensureMillitrackSynced } from './millitrackSync.js';

const PORT = process.env.PORT || 5002;
const HOST = process.env.HOST || '0.0.0.0';

const isMillitrackEnabled = (() => {
  const raw = String(process.env.MILLITRACK_ENABLED || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
})();

const millitrackSyncIntervalMs = (() => {
  const v = Number(process.env.MILLITRACK_SYNC_MIN_INTERVAL_MS || 15000);
  return Number.isFinite(v) ? v : 15000;
})();

console.log(`Millitrack enabled: ${isMillitrackEnabled} (intervalMs=${millitrackSyncIntervalMs})`);

// Global error handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 Backend running on http://${HOST}:${PORT}`);
});

if (isMillitrackEnabled) {
  ensureMillitrackSynced().catch((e) => {
    console.warn('Millitrack initial sync failed:', e?.message || e);
  });

  setInterval(() => {
    ensureMillitrackSynced().catch((e) => {
      console.warn('Millitrack background sync failed:', e?.message || e);
    });
  }, millitrackSyncIntervalMs);
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
