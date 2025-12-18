import express from 'express';
import cors from 'cors';

import fuelRoutes from './fuel.backend.js';
import vehicleRoutes from './vehicles.js';
import slaRoutes from './sla-reports.js';
import gpsBackend from './gps.backend.js';


const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/vehicles', vehicleRoutes);
app.use('/api/fuel', fuelRoutes);
app.use('/api/sla', slaRoutes);
app.use('/api/gps', gpsBackend);

app.get('/', (req, res) => {
  res.send('Fleet Backend Running');
});

export default app;
