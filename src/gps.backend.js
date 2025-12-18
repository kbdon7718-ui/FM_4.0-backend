import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* ================= AUTH ================= */
function authenticate(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function requireFleet(req, res, next) {
  if (req.user.role !== 'FLEET') {
    return res.status(403).json({ error: 'Fleet access only' });
  }
  next();
}

/* ================= GPS INGEST ================= */
/**
 * Fleet sends live location
 */
router.post('/log', authenticate, requireFleet, async (req, res) => {
  try {
    const { latitude, longitude, speed } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Latitude & longitude required' });
    }

    const vehicle_id = req.user.vehicle_id;

    const { error } = await supabase.from('gps_logs').insert([
      {
        vehicle_id,
        location: `POINT(${longitude} ${latitude})`,
        speed: speed || 0,
        ignition: true,
        recorded_at: new Date().toISOString()
      }
    ]);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error('GPS log error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
