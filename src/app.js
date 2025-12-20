import express from 'express';
import cors from 'cors';

import fuelRoutes from './fuel.backend.js';
import vehicleRoutes from './vehicles.js';
import slaRoutes from './sla-reports.js';
import liveTrackingRoutes from './livetracking.js';
import ownerDashboardRoutes from './ownerdashboard.js';
import geofenceRoutes from './geofencing.js';



import gpsBackend from './gps.backend.js';

const app = express();

/* =========================
   CORS CONFIG (FIXED)
========================= */


app.use(
  cors({
    origin: [
      'http://localhost:3000',
      'http://localhost:5173',
      'https://fm-4-0-7kgj-98e2cpaje-azads-projects-d43d3e52.vercel.app',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-role',
      'x-fleet-id',
      'x-vehicle-id',
    ],
  })
);

// 🔥 REQUIRED FOR PREFLIGHT
app.options('*', cors());
app.use(express.json());

/* =========================
   ROUTES
========================= */
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/fuel', fuelRoutes);
app.use('/api/sla', slaRoutes);
app.use('/api/gps', gpsBackend);
app.use(ownerDashboardRoutes);
app.use(liveTrackingRoutes);

app.use(geofenceRoutes);


app.get('/', (req, res) => {
  res.send('Fleet Backend Running');
});

export default app;
