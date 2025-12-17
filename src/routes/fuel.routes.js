import express from 'express';
import { runDailyFuelAnalysis } from '../controllers/fuel.controller.js';

const router = express.Router();

router.post('/analyze', runDailyFuelAnalysis);

export default router;
