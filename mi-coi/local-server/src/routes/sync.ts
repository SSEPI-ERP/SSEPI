/**
 * Sync routes — POST /sync/push, GET /sync/pull, GET /sync/status
 * Bidirectional sync between Postgres (Supabase) and SQLite (local COI).
 */
import { Router, Request, Response } from 'express';
import { SyncEngine } from '../services/sync-engine';

export function syncRouter(syncEngine: SyncEngine): Router {
  const router = Router();

  // GET /sync/status — Current sync status
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const status = await syncEngine.getSyncStatus();
      res.json({ ok: true, data: status });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /sync/pull — Pull polizas from Postgres → SQLite
  router.get('/pull', async (_req: Request, res: Response) => {
    try {
      const result = await syncEngine.pullFromPostgres();
      res.json({ ok: true, data: result });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // POST /sync/push — Push local polizas from SQLite → Postgres
  router.post('/push', async (_req: Request, res: Response) => {
    try {
      const result = await syncEngine.pushToPostgres();
      res.json({ ok: true, data: result });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}