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

const app = express();

/* =========================
   CORS CONFIG - PRODUCTION READY
========================= */
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5173',
      'https://fm-4-0.vercel.app',
      'https://fm4-0-ui.vercel.app',
      'https://fleetmaster.vercel.app',
      process.env.FRONTEND_URL,
    ].filter(Boolean);

    // Allow all origins when explicitly enabled (useful for testing / GitHub.dev)
    if (process.env.ALLOW_ALL_ORIGINS === 'true') {
      return callback(null, true);
    }

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-role',
    'x-owner-id',
    'x-fleet-id',
    'x-vehicle-id',
  ],
  maxAge: 86400, // 24 hours
};

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
app.use('/api/sla', slaRoutes);
app.use('/api/gps', gpsBackend);
app.use('/api/fleet', fleetlocation);
app.use(ownerDashboardRoutes);
app.use(liveTrackingRoutes);
app.use(geofenceRoutes);

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
