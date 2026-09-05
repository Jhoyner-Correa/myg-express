import { Router } from 'express';

import { PERMISSIONS } from '../../core/constants/permissions';
import { verificarToken } from '../../core/middlewares/authMiddleware';
import { requirePermission } from '../../core/middlewares/permissionMiddleware';
import {
  authenticatePrintAgent,
  cancelPrintJob,
  claimPrintJob,
  completePrintJob,
  createPrintJob,
  listPrintJobs,
  listPrintSites,
  listPrintAgents,
  createPrintPairing,
  pairPrintAgent,
  selectPrintAgentPrinter,
  removePrintAgent,
  downloadPrintConnector,
  printAgentHeartbeat,
  retryPrintJob,
} from './printingController';

const router = Router();

router.post('/agent/pair', pairPrintAgent);
router.post('/agent/heartbeat', authenticatePrintAgent, printAgentHeartbeat);
router.post('/agent/claim', authenticatePrintAgent, claimPrintJob);
router.post('/agent/jobs/:id/complete', authenticatePrintAgent, completePrintJob);

router.use(verificarToken);
router.use(requirePermission(PERMISSIONS.PRINTING_VIEW));
router.get('/sites', listPrintSites);
router.get('/agents', listPrintAgents);
router.get('/connector/download', downloadPrintConnector);
router.post('/pairings', requirePermission(PERMISSIONS.PRINTING_MANAGE), createPrintPairing);
router.patch('/agents/:id/printer', requirePermission(PERMISSIONS.PRINTING_MANAGE), selectPrintAgentPrinter);
router.delete('/agents/:id', requirePermission(PERMISSIONS.PRINTING_MANAGE), removePrintAgent);
router.get('/jobs', listPrintJobs);
router.post('/jobs', requirePermission(PERMISSIONS.PRINTING_MANAGE), createPrintJob);
router.post('/jobs/:id/cancel', requirePermission(PERMISSIONS.PRINTING_MANAGE), cancelPrintJob);
router.post('/jobs/:id/retry', requirePermission(PERMISSIONS.PRINTING_MANAGE), retryPrintJob);

export default router;
