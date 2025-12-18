import express from 'express';
import { supabase } from './config/supabase.js';

const router = express.Router();

/* ==============================
   SUPERVISOR LIVE TRACKING
   (READ ONLY)
============================== */
router.get('/api/supervisor/live-tracking', async (req, res) => {
  try {
    /* 1️⃣ Latest GPS per vehicle */
    const { data: locations, error } = await supabase.rpc(
      'latest_vehicle_locations'
    );
    if (error) throw error;

    if (!locations || locations.length === 0) {
      return res.json([]);
    }

    const vehicleIds = locations.map(v => v.vehicle_id);

    /* 2️⃣ TODAY distance (based on start_time) */
    const today = new Date().toISOString().slice(0, 10);

    const { data: todayRows, error: todayErr } = await supabase
      .from('distance_logs')
      .select('vehicle_id, distance_km')
      .in('vehicle_id', vehicleIds)
      .gte('start_time', `${today} 00:00:00`)
      .lte('start_time', `${today} 23:59:59`);

    if (todayErr) throw todayErr;

    /* 3️⃣ TOTAL distance */
    const { data: totalRows, error: totalErr } = await supabase
      .from('distance_logs')
      .select('vehicle_id, distance_km')
      .in('vehicle_id', vehicleIds);

    if (totalErr) throw totalErr;

    /* 4️⃣ Build distance maps */
    const todayMap = {};
    todayRows.forEach(r => {
      todayMap[r.vehicle_id] =
        (todayMap[r.vehicle_id] || 0) + Number(r.distance_km || 0);
    });

    const totalMap = {};
    totalRows.forEach(r => {
      totalMap[r.vehicle_id] =
        (totalMap[r.vehicle_id] || 0) + Number(r.distance_km || 0);
    });

    /* 5️⃣ Merge final response */
    const vehicles = locations.map(row => ({
      id: row.vehicle_id,
      number: row.vehicle_number,
      lat: row.latitude,
      lng: row.longitude,
      speed: row.speed,
      today_km: Number(todayMap[row.vehicle_id] || 0).toFixed(2),
      total_km: Number(totalMap[row.vehicle_id] || 0).toFixed(2),
      status: row.speed > 5 ? 'moving' : 'stopped',
      lastUpdated: new Date(row.recorded_at).toLocaleString(),
    }));

    res.json(vehicles);
  } catch (err) {
    console.error('Supervisor live tracking error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
