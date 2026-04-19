/**
 * Health check route — GET /health
 * Returns SQLite + Postgres connectivity status.
 */
import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import { SupabaseClient } from '@supabase/supabase-js';

export function healthRouter(db: Database.Database, supabase: SupabaseClient | null): Router {
  const router = Router();

  router.get('/', async (_req: Request, res: Response) => {
    let sqliteOk = false;
    let postgresOk = false;
    let sqliteError: string | null = null;
    let postgresError: string | null = null;

    // Check SQLite
    try {
      db.prepare('SELECT 1').get();
      sqliteOk = true;
    } catch (err) {
      sqliteError = err instanceof Error ? err.message : String(err);
    }

    // Check Postgres
    if (supabase) {
      try {
        const { error } = await supabase.from('coi_account_mapping').select('key').limit(1);
        postgresOk = !error;
        if (error) postgresError = error.message;
      } catch (err) {
        postgresError = err instanceof Error ? err.message : String(err);
      }
    }

    const ok = sqliteOk && (supabase ? postgresOk : true);
    res.status(ok ? 200 : 503).json({
      ok,
      service: 'ssepi-coi-bridge',
      sqlite: sqliteOk ? 'connected' : `error: ${sqliteError}`,
      postgres: supabase ? (postgresOk ? 'connected' : `error: ${postgresError}`) : 'not configured',
      version: '2.0.0-node',
    });
  });

  return router;
}