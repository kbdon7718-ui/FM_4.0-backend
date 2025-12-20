import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* =========================
   OWNER DASHBOARD SUMMARY
========================= */
router.get('/api/owner/dashboard', async (req, res) => {
  try {
    const [{ count: totalVehicles }, { count: onTimeCount }] =
      await Promise.all([
        supabase
          .from('vehicles')
          .select('*', { count: 'exact', head: true }),

        supabase
          .from('geofence_logs')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'ON_TIME'),
      ]);

    res.json({
      totalVehicles: totalVehicles || 0,
      onTimeArrivals: onTimeCount || 0,
    });
  } catch (err) {
    console.error('Owner dashboard error', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
