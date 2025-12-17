import express from 'express';
import { processSLA } from '../controllers/sla.controller.js';

const router = express.Router();

router.post('/process', processSLA);

export default router;
