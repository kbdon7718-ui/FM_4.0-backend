import express from 'express';
import cors from 'cors';

//simport fuelRoutes from './fuel.js';
//import vehicleRoutes from './vehicles.js';
import slaRoutes from './sla-reports.js';
import liveTrackingRoutes from './livetracking.js';
import ownerDashboardRoutes from './ownerdashboard.js';
import geofenceRoutes from './geofencing.js';
import fleetlocation from './fleetlocation.js';
import gpsBackend from './gps.backend.js';
import fuelRoutes from "./fuel.js";
import addVehicleRoutes from './addVehicle.js';
import maintenanceRoutes from './maintenance.js';
import assignDriverRoutes from './assigndriver.js';
import companyRoutes from './companyroutes.js';


const app = express();

/* =========================
   CORS CONFIG
========================= */
app.use(
  cors({
    origin: [
      'http://localhost:3000',
      'http://localhost:5173',
      'https://fm-4-0.vercel.app',
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

app.options('*', cors());
app.use(express.json());

/* =========================
   ROUTES
========================= */
//app.use('/api/vehicles', vehicleRoutes);
app.use('/api',fuelRoutes);
app.use('/api', maintenanceRoutes);
app.use('/api', assignDriverRoutes);
app.use('/api', companyRoutes);
app.use('/api/sla', slaRoutes);
app.use('/api/gps', gpsBackend);
app.use(ownerDashboardRoutes);
app.use(liveTrackingRoutes);
app.use('/api/fleet', fleetlocation);
app.use(geofenceRoutes);

app.use('/api',addVehicleRoutes);


app.get('/', (req, res) => {
  res.send('Fleet Backend Running');
});

export default app;
