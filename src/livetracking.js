import express from 'express';
import { supabase } from './config/supabase.js';
import { ensureMillitrackSynced, syncMillitrackNow } from './millitrackSync.js';

const router = express.Router();

function extractLatLng(location) {
  if (!location) return null;
  const coords = location?.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  if (typeof location === 'string') {
    const match = location.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
    if (match) {
      const lng = Number(match[1]);
      const lat = Number(match[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
  }

  return null;
}

async function loadLatestFromGpsLogs() {
  const { data, error } = await supabase
    .from('gps_logs')
    .select('vehicle_id, location, speed, recorded_at')
    .order('recorded_at', { ascending: false })
    .limit(5000);

  if (error) throw error;

  const byVehicle = new Map();
  for (const row of data || []) {
    if (!row?.vehicle_id) continue;
    if (byVehicle.has(row.vehicle_id)) continue;
    const ll = extractLatLng(row.location);
    if (!ll) continue;
    byVehicle.set(row.vehicle_id, {
      vehicle_id: row.vehicle_id,
      lat: ll.lat,
      lng: ll.lng,
      speed: Number(row.speed || 0),
      recorded_at: row.recorded_at,
    });
  }

  const vehicleIds = Array.from(byVehicle.keys());
  if (vehicleIds.length === 0) return [];

  const { data: vehicles, error: vErr } = await supabase
    .from('vehicles')
    .select('vehicle_id, vehicle_number')
    .in('vehicle_id', vehicleIds);

  if (vErr) throw vErr;
  const numberById = new Map((vehicles || []).map(v => [v.vehicle_id, v.vehicle_number]));

  return vehicleIds.map((id) => {
    const base = byVehicle.get(id);
    return {
      vehicle_id: id,
      vehicle_number: numberById.get(id) || null,
      lat: base.lat,
      lng: base.lng,
      speed: base.speed,
      recorded_at: base.recorded_at,
    };
  });
}

router.get('/millitrack/status', async (req, res) => {
  try {
    const force = String(req.query.force || '').trim();
    const enabledRaw = String(process.env.MILLITRACK_ENABLED || '').trim();
    const intervalRaw = String(process.env.MILLITRACK_SYNC_MIN_INTERVAL_MS || '').trim();
    const autoCreateRaw = String(process.env.MILLITRACK_AUTO_CREATE_VEHICLES || '').trim();
    const hasDeviceInfoUrl = Boolean(String(process.env.MILLITRACK_DEVICE_INFO_URL || '').trim());
    const hasBaseUrl = Boolean(String(process.env.MILLITRACK_BASE_URL || '').trim());
    const hasAccessToken = Boolean(String(process.env.MILLITRACK_ACCESS_TOKEN || '').trim());
    const hasDefaultOwnerId = Boolean(String(process.env.MILLITRACK_DEFAULT_OWNER_ID || '').trim());
    const result = force === '1' || force.toLowerCase() === 'true'
      ? await syncMillitrackNow()
      : await ensureMillitrackSynced();

    res.json({
      ok: true,
      force: Boolean(force),
      env: {
        MILLITRACK_ENABLED: enabledRaw,
        MILLITRACK_SYNC_MIN_INTERVAL_MS: intervalRaw,
        MILLITRACK_AUTO_CREATE_VEHICLES: autoCreateRaw,
        hasDeviceInfoUrl,
        hasBaseUrl,
        hasAccessToken,
        hasDefaultOwnerId,
      },
      result,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ==============================
   SUPERVISOR LIVE TRACKING
   (READ ONLY) ✅ REAL GPS
============================== */
router.get('/supervisor/live-tracking', async (req, res) => {
  try {
    await ensureMillitrackSynced().catch((e) => {
      console.warn('Millitrack sync failed:', e?.message || e);
    });
    const today = new Date().toISOString().slice(0, 10);

    // Fetch live positions
    let liveData = [];
    try {
      const { data, error } = await supabase
        .from('live_vehicle_positions')
        .select('vehicle_id, vehicle_number, lat, lng, speed, recorded_at')
        .order('recorded_at', { ascending: false });
      if (error) throw error;
      liveData = Array.isArray(data) ? data : [];
    } catch (e) {
      liveData = [];
    }

    if (!liveData.length) {
      liveData = await loadLatestFromGpsLogs();
    }

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
        Number(v.speed || 0) >= 5 ? 'moving' :
        Number(v.speed || 0) > 0 ? 'idling' :
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
    await ensureMillitrackSynced().catch((e) => {
      console.warn('Millitrack sync failed:', e?.message || e);
    });
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
    await ensureMillitrackSynced().catch((e) => {
      console.warn('Millitrack sync failed:', e?.message || e);
    });
    let data = [];
    try {
      const resLive = await supabase
        .from('live_vehicle_positions')
        .select('vehicle_id, vehicle_number, lat, lng, speed, recorded_at')
        .order('recorded_at', { ascending: false });
      if (resLive.error) throw resLive.error;
      data = Array.isArray(resLive.data) ? resLive.data : [];
    } catch (e) {
      data = [];
    }

    if (!data.length) {
      data = await loadLatestFromGpsLogs();
    }

    const today = new Date().toISOString().slice(0, 10);
    const vehicleIds = Array.from(new Set(data.map(d => d.vehicle_id))).filter(Boolean);
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

    const vehicles = data.map(v => ({
      id: v.vehicle_id,
      number: v.vehicle_number,
      lat: Number(v.lat),
      lng: Number(v.lng),
      speed: Number(v.speed || 0),
      today_km: Number(distanceMap[v.vehicle_id] || 0),
      status:
        Number(v.speed || 0) >= 5 ? 'moving' :
        Number(v.speed || 0) > 0 ? 'idling' :
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
    await ensureMillitrackSynced().catch((e) => {
      console.warn('Millitrack sync failed:', e?.message || e);
    });
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
