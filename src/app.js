import express from 'express';
import cors from 'cors';

// Routes
import slaRoutes from './sla-reports.js';
import liveTrackingRoutes from './livetracking.js';
import ownerDashboardRoutes from './ownerdashboard.js';
import geofenceRoutes from './geofencing.js';
import fleetlocation from './fleetlocation.js';
import gpsBackend from './gps.backend.js';
import fuelRoutes from './fuel.js';
import addVehicleRoutes from './addVehicle.js';
import maintenanceRoutes from './maintenance.js';
import assignDriverRoutes from './assigndriver.js';
import companyRoutes from './companyroutes.js';
import correlationRoutes from './correlation.js';

const app = express();

/* =========================
   CORS CONFIG - PRODUCTION READY
========================= */
const corsOptions = (() => {
  const normalizeOrigin = (value) => String(value || '').trim().replace(/\/$/, '');
  const defaults = ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173',
    'https://fm-4-0-beioxc7b5-azads-projects-d43d3e52.vercel.app', 'https://fm-4-0.vercel.app'];
  const envFrontend = process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [];
  const envList = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean) : [];
  const allowedOrigins = Array.from(new Set([...defaults, ...envFrontend, ...envList].map(normalizeOrigin))).filter(Boolean);

  return {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      const normalized = normalizeOrigin(origin);
      if (allowedOrigins.indexOf(normalized) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-api-key',
      'Accept',
      'x-role',
      'x-owner-id',
      'x-fleet-id',
      'x-vehicle-id',
    ],
  };
})();

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

/* =========================
   MIDDLEWARE
========================= */
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path}`);
  next();
});

/* =========================
   ROUTES
========================= */
app.use('/api', fuelRoutes);
app.use('/api', maintenanceRoutes);
app.use('/api', assignDriverRoutes);
app.use('/api', companyRoutes);
app.use('/api', addVehicleRoutes);
app.use('/api', correlationRoutes);
app.use('/api/sla', slaRoutes);
app.use('/api/gps', gpsBackend);
app.use('/api/fleet', fleetlocation);
app.use('/api', ownerDashboardRoutes);
app.use('/api', liveTrackingRoutes);
app.use('/api', geofenceRoutes);

/* =========================
   HEALTH CHECK
========================= */
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.status(200).json({
    message: '🚀 Fleet Management Backend - API v1.0',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

/* =========================
   ERROR HANDLING
========================= */
// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString(),
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    error: err.name || 'Error',
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    timestamp: new Date().toISOString(),
  });
});

export default app;
