import express from 'express';
import { runCorrelation } from '../controllers/correlation.controller.js';

const router = express.Router();

router.post('/run', runCorrelation);

export default router;
