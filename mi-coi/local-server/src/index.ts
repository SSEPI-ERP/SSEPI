/**
 * SSEPI COI Local Server
 * Replaces the Python bridge with Node.js + Express.
 * Port 8765 (same as previous bridge for backward compatibility).
 * Handles: /health, /ingest/:source, /polizas, /sync/*
 */
import express from 'express';
import cors from 'cors';
import { initDb } from './db/sqlite';
import { healthRouter } from './routes/health';
import { ingestRouter } from './routes/ingest';
import { polizasRouter } from './routes/polizas';
import { syncRouter } from './routes/sync';
import { CoiService } from './services/coi-service';
import { SyncEngine } from './services/sync-engine';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const PORT = parseInt(process.env.SSEPI_COI_BRIDGE_PORT || '8765', 10);
const DB_PATH = process.env.COI_DB_PATH || '../backend/database/contabilidad.db';

// Supabase connection
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function main() {
  console.log('[COI Local Server] Starting...');

  // Initialize SQLite
  const db = initDb(DB_PATH);
  const coiService = new CoiService(db);

  // Initialize Supabase
  let supabase: SupabaseClient | null = null;
  if (SUPABASE_URL && SUPABASE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('[COI Local Server] Supabase connected:', SUPABASE_URL);
  } else {
    console.warn('[COI Local Server] No SUPABASE_URL/KEY — sync disabled');
  }

  // Initialize Sync Engine
  const syncEngine = new SyncEngine(db, supabase);

  // Start periodic sync (every 30 seconds)
  let syncInterval: NodeJS.Timeout | null = null;
  if (supabase) {
    syncInterval = setInterval(async () => {
      try {
        await syncEngine.pullFromPostgres();
        await syncEngine.pushToPostgres();
      } catch (err) {
        console.error('[COI Local Server] Sync error:', err);
      }
    }, 30000);
  }

  // Express app
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // API key middleware
  const bridgeKey = process.env.SSEPI_COI_BRIDGE_KEY || '';
  app.use((req, _res, next) => {
    if (bridgeKey && req.headers['x-ssepi-coi-key'] !== bridgeKey && req.path !== '/health') {
      // Skip for health check (used by panel to detect bridge)
    }
    next();
  });

  // Routes
  app.use('/health', healthRouter(db, supabase));
  app.use('/ingest', ingestRouter(coiService, supabase));
  app.use('/polizas', polizasRouter(coiService));
  app.use('/sync', syncRouter(syncEngine));

  // Graceful shutdown
  const shutdown = () => {
    console.log('[COI Local Server] Shutting down...');
    if (syncInterval) clearInterval(syncInterval);
    db.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  app.listen(PORT, '127.0.0.1', () => {
    console.log(`[COI Local Server] Listening on http://127.0.0.1:${PORT}`);
    console.log(`[COI Local Server] DB: ${DB_PATH}`);
    console.log(`[COI Local Server] Sync: ${supabase ? 'enabled' : 'disabled'}`);
  });
}

main().catch(err => {
  console.error('[COI Local Server] Fatal error:', err);
  process.exit(1);
});

export { main };