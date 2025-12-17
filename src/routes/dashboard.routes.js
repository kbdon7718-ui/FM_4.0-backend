import express from 'express';
import { getOwnerOverview } from '../controllers/dashboard.controller.js';

const router = express.Router();

router.get('/overview', getOwnerOverview);

export default router;
