import express from 'express';
import cors from 'cors';

import fuelRoutes from './fuel.backend.js';
import vehicleRoutes from './vehicles.js';
import slaRoutes from './sla-reports.js';
import gpsBackend from './gps.backend.js';

const app = express();

/* =========================
   CORS CONFIG (FIXED)
========================= */
app.use(
  cors({
    origin: [
      'http://localhost:3000',
      'https://fm-4-0-7kgj-5bzyphxw3-azads-projects-d43d3e52.vercel.app'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-role',
      'x-fleet-id',
      'x-vehicle-id'
    ],
  })
);

// 🔥 THIS LINE IS CRITICAL FOR PREFLIGHT
app.options('*', cors());

app.use(express.json());

/* =========================
   ROUTES
========================= */
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/fuel', fuelRoutes);
app.use('/api/sla', slaRoutes);
app.use('/api/gps', gpsBackend);

app.get('/', (req, res) => {
  res.send('Fleet Backend Running');
});

export default app;
