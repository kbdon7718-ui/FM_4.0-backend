import express from 'express';
import {
  ingestTelemetry,
  getLatestTelemetry,
} from '../controllers/telemetry.controller.js';

const router = express.Router();

router.post('/ingest', ingestTelemetry);
router.get('/latest', getLatestTelemetry);

export default router;
