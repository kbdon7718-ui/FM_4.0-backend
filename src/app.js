import express from 'express';
import cors from 'cors';

import fuelRoutes from './routes/fuel.routes.js';
import telemetryRoutes from './routes/telemetry.routes.js';
import slaRoutes from './routes/sla.routes.js';
import correlationRoutes from './routes/correlation.routes.js';


const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/fuel', fuelRoutes);
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/sla', slaRoutes);
app.use('/api/correlation', correlationRoutes);

app.get('/', (req, res) => {
  res.send('Fleet Backend Running');
});

export default app;
