import express from 'express';
import { supabase } from './config/supabase.js';

const router = express.Router();

/* ==============================
   SUPERVISOR LIVE TRACKING
   (READ ONLY) ✅ REAL GPS
============================== */
router.get('/api/supervisor/live-tracking', async (req, res) => {
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
  today_km: Number(v.vehicle_daily_distance?.distance_km || 0),
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
router.get('/api/gps-logs', async (req, res) => {
  try {
    const { vehicle_id, date } = req.query;

    if (!vehicle_id || !date) {
      return res.status(400).json({ error: 'vehicle_id and date are required' });
    }

    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);
const today = new Date().toISOString().slice(0, 10);

const { data, error } = await supabase
  .from('live_vehicle_positions')
  .select(`
    vehicle_id,
    vehicle_number,
    lat,
    lng,
    speed,
    recorded_at,
    vehicle_daily_distance!left(distance_km)
  `)
  .eq('vehicle_daily_distance.date', today)
  .order('recorded_at', { ascending: false });

    if (error) throw error;

    const parsedLogs = logs
      .filter(l => l.location?.coordinates)
      .map(log => ({
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
router.get('/api/owner/live-tracking', async (req, res) => {
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
router.get('/api/owner/route-history', async (req, res) => {
  try {
    const { vehicle_id, date } = req.query;

    if (!vehicle_id || !date) {
      return res.status(400).json({ error: 'vehicle_id and date are required' });
    }

    const start = new Date(date);
    start.setHours(0, 0, 0, 0);

    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

   const today = new Date().toISOString().slice(0, 10);

const { data, error } = await supabase
  .from('live_vehicle_positions')
  .select(`
    vehicle_id,
    vehicle_number,
    lat,
    lng,
    speed,
    recorded_at,
    vehicle_daily_distance!left(distance_km)
  `)
  .eq('vehicle_daily_distance.date', today)
  .order('recorded_at', { ascending: false });


    if (error) throw error;

    const route = data
      .filter(p => p.location?.coordinates)
      .map(p => ({
        latitude: p.location.coordinates[1],
        longitude: p.location.coordinates[0],
        speed: Number(p.speed || 0),
        ignition: p.ignition || false,
        timestamp: p.recorded_at
      }));

    const stops = [];
    let stop = null;

    route.forEach((p, i) => {
      if (p.speed < 5) {
        if (!stop) {
          stop = { ...p, arrival_time: p.timestamp };
        }
      } else if (stop) {
        stop.departure_time = route[i - 1]?.timestamp;
        stops.push(stop);
        stop = null;
      }
    });

    res.json({
      route,
      stops,
      vehicle_id,
      date
    });
  } catch (err) {
    console.error('Route history error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
