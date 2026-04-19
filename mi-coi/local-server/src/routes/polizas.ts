/**
 * Polizas routes — GET /polizas, GET /polizas/:id
 * Query local SQLite for COI dashboard.
 */
import { Router, Request, Response } from 'express';
import { CoiService } from '../services/coi-service';

export function polizasRouter(coiService: CoiService): Router {
  const router = Router();

  // GET /polizas — List polizas with optional filters
  router.get('/', (req: Request, res: Response) => {
    const filters = {
      tipo: req.query.tipo as string | undefined,
      fechaDesde: req.query.fechaDesde as string | undefined,
      fechaHasta: req.query.fechaHasta as string | undefined,
      estatus: req.query.estatus as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 100,
    };

    try {
      const polizas = coiService.buscarPolizas(filters);
      res.json({ ok: true, data: polizas, count: polizas.length });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /polizas/:id — Get single poliza with movements
  router.get('/:id', (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ ok: false, error: 'Invalid poliza id' });
      return;
    }

    try {
      const poliza = coiService.obtenerPoliza(id);
      if (!poliza) {
        res.status(404).json({ ok: false, error: 'Poliza not found' });
        return;
      }
      res.json({ ok: true, data: poliza });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // POST /polizas/:id/afectar — Affectar (post) a poliza
  router.post('/:id/afectar', (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ ok: false, error: 'Invalid poliza id' });
      return;
    }

    try {
      const result = coiService.afectarPoliza(id, req.body?.usuario);
      res.json(result);
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}