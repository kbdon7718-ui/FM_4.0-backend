import express from 'express';
import { supabase } from './config/supabase.js';

const router = express.Router();

/* ==============================
   SUPERVISOR LIVE TRACKING
   (READ ONLY) ✅ REAL GPS
============================== */
router.get('/supervisor/live-tracking', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // Fetch live positions
    const { data: liveData, error: liveErr } = await supabase
      .from('live_vehicle_positions')
      .select('vehicle_id, vehicle_number, lat, lng, speed, recorded_at')
      .order('recorded_at', { ascending: false });

    if (liveErr) throw liveErr;

    // collect vehicle ids and fetch today's daily distances in one query
    const vehicleIds = Array.from(new Set(liveData.map(d => d.vehicle_id))).filter(Boolean);

    let distanceMap = {};
    if (vehicleIds.length > 0) {
      const { data: distances } = await supabase
        .from('vehicle_daily_distance')
        .select('vehicle_id, distance_km, date')
        .in('vehicle_id', vehicleIds)
        .eq('date', today);

      if (distances && distances.length) {
        for (const row of distances) {
          distanceMap[row.vehicle_id] = Number(row.distance_km || 0);
        }
      }
    }

    const vehicles = liveData.map(v => ({
      id: v.vehicle_id,
      number: v.vehicle_number,
      lat: Number(v.lat),
      lng: Number(v.lng),
      speed: Number(v.speed || 0),
      today_km: Number(distanceMap[v.vehicle_id] || 0),
      status:
        v.speed >= 5 ? 'moving' :
        v.speed > 0 ? 'idling' :
        'stopped',
      lastUpdated: v.recorded_at
    }));

    res.json(vehicles);
  } catch (err) {
    console.error('Supervisor live tracking error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ==============================
   GPS LOGS FOR ROUTE TRACING
   (BY VEHICLE AND DATE) ✅ REAL GPS
============================== */
router.get('/gps-logs', async (req, res) => {
  try {
    const { vehicle_id, date } = req.query;

    if (!vehicle_id || !date) {
      return res.status(400).json({ error: 'vehicle_id and date are required' });
    }

    const start = new Date(date);
    start.setHours(0, 0, 0, 0);

    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from('gps_logs')
      .select('vehicle_id, location, speed, ignition, recorded_at')
      .eq('vehicle_id', vehicle_id)
      .gte('recorded_at', start.toISOString())
      .lte('recorded_at', end.toISOString())
      .order('recorded_at', { ascending: true });

    if (error) throw error;

    const parsedLogs = data.map(log => ({
      vehicle_id: log.vehicle_id,
      latitude: log.location.coordinates[1],
      longitude: log.location.coordinates[0],
      speed: Number(log.speed || 0),
      ignition: log.ignition || false,
      recorded_at: log.recorded_at
    }));

    res.json(parsedLogs);
  } catch (err) {
    console.error('GPS logs error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ==============================
   OWNER LIVE TRACKING
   (READ ONLY) ✅ SAME REAL DATA
============================== */
router.get('/owner/live-tracking', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('live_vehicle_positions')
      .select('vehicle_id, vehicle_number, lat, lng, speed, recorded_at')
      .order('recorded_at', { ascending: false });

    if (error) throw error;

    const vehicles = data.map(v => ({
      id: v.vehicle_id,
      number: v.vehicle_number,
      lat: Number(v.lat),
      lng: Number(v.lng),
      speed: Number(v.speed || 0),
      status:
        v.speed >= 5 ? 'moving' :
        v.speed > 0 ? 'idling' :
        'stopped',
      lastUpdated: v.recorded_at
    }));

    res.json(vehicles);
  } catch (err) {
    console.error('Owner live tracking error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ==============================
   OWNER ROUTE TRACING
   (REAL GPS + REAL STOPS)
============================== */
router.get('/owner/route-history', async (req, res) => {
  try {
    const { vehicle_id, date } = req.query;

    if (!vehicle_id || !date) {
      return res.status(400).json({ error: 'vehicle_id and date are required' });
    }

    const start = new Date(date);
    start.setHours(0, 0, 0, 0);

    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from('gps_logs')
      .select('location, speed, ignition, recorded_at')
      .eq('vehicle_id', vehicle_id)
      .gte('recorded_at', start.toISOString())
      .lte('recorded_at', end.toISOString())
      .order('recorded_at', { ascending: true });

    if (error) throw error;

    const route = data.map(p => ({
      latitude: p.location.coordinates[1],
      longitude: p.location.coordinates[0],
      speed: Number(p.speed || 0),
      ignition: p.ignition || false,
      timestamp: p.recorded_at
    }));

    res.json({ route, vehicle_id, date });
  } catch (err) {
    console.error('Route history error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
