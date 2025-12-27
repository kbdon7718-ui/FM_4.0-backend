import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

/* ==============================
   ROUTER INIT (FIX)
============================== */
const router = express.Router();

router.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (origin.startsWith('http://localhost')) return callback(null, true);
      if (origin.endsWith('.vercel.app')) return callback(null, true);
      if (origin.endsWith('.onrender.com')) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-role',
      'x-vehicle-id',
      'x-fleet-id',
    ],
  })
);

// 🔥 REQUIRED FOR PREFLIGHT
router.options('*', cors());
router.use(express.json());

/* ==============================
   SUPABASE CLIENT
============================== */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* ==============================
   SIMPLE AUTH (UNCHANGED)
============================== */
function authenticate(req, res, next) {
  const role = req.headers['x-role'];
  const vehicleId = req.headers['x-vehicle-id'];
  const fleetId = req.headers['x-fleet-id'];

  if (!role) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  req.user = {
    role,
    vehicle_id: vehicleId || null,
    fleet_id: fleetId || null,
  };

  next();
}

function requireFleet(req, res, next) {
  if (req.user.role !== 'FLEET') {
    return res.status(403).json({ message: 'Fleet only access' });
  }
  next();
}

function requireOwner(req, res, next) {
  if (req.user.role !== 'OWNER') {
    return res.status(403).json({ message: 'Owner only access' });
  }
  next();
}

function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


/* ==============================
   SAVE LIVE GPS (FLEET)
============================== */
router.post(
  '/location',
  authenticate,
  requireFleet,
  async (req, res) => {
    try {
      const { latitude, longitude, speed, ignition } = req.body;
      const { vehicle_id } = req.user;

      if (!vehicle_id || latitude == null || longitude == null) {
        return res.status(400).json({
          message: 'vehicle_id, latitude, longitude required',
        });
      }

      if (
        latitude < -90 || latitude > 90 ||
        longitude < -180 || longitude > 180
      ) {
        return res.status(400).json({
          message: 'Invalid GPS coordinates',
        });
      }

      if (speed != null && (speed < 0 || speed > 180)) {
        return res.status(400).json({
          message: 'Invalid speed value',
        });
      }

      const { data: last } = await supabase
        .from('gps_logs')
        .select('recorded_at')
        .eq('vehicle_id', vehicle_id)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .single();

      if (last) {
        const diffMs = Date.now() - new Date(last.recorded_at).getTime();
        if (diffMs < 3000) return res.json({ ignored: true });
      }

      const { error } = await supabase.from('gps_logs').insert([
        {
          vehicle_id,
          location: `POINT(${longitude} ${latitude})`,
          speed: speed || 0,
          ignition: ignition ?? true,
          recorded_at: new Date().toISOString(),
        },
      ]);

      if (error) throw error;


      

      // ==============================
// UPDATE DAILY DISTANCE
// ==============================
/* ==============================
   STEP 2: UPDATE DAILY DISTANCE
============================== */
const today = new Date().toISOString().slice(0, 10);

// fetch previous GPS point (second-last record)
const { data: prev } = await supabase
  .from('gps_logs')
  .select('location')
  .eq('vehicle_id', vehicle_id)
  .order('recorded_at', { ascending: false })
  .range(1, 1)
  .single();

if (prev?.location?.coordinates) {
  const [prevLng, prevLat] = prev.location.coordinates;

  const meters = getDistanceMeters(
    prevLat,
    prevLng,
    latitude,
    longitude
  );

  // safety: ignore GPS jumps (>2km)
  if (meters > 0 && meters < 2000) {
    const km = meters / 1000;

    const { data: daily } = await supabase
      .from('vehicle_daily_distance')
      .select('*')
      .eq('vehicle_id', vehicle_id)
      .eq('date', today)
      .single();

    if (daily) {
      await supabase
        .from('vehicle_daily_distance')
        .update({
          distance_km: daily.distance_km + km,
          last_lat: latitude,
          last_lng: longitude,
          updated_at: new Date(),
        })
        .eq('vehicle_id', vehicle_id)
        .eq('date', today);
    } else {
      await supabase
        .from('vehicle_daily_distance')
        .insert([{
          vehicle_id,
          date: today,
          distance_km: km,
          last_lat: latitude,
          last_lng: longitude,
        }]);
    }
  }
}


      res.json({ success: true });
    } catch (err) {
      console.error('GPS insert error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);
/* ==============================
   GET DISTANCE (FLEET)
============================== */
router.get(
  '/distance',
  authenticate,
  requireFleet,
  async (req, res) => {
    try {
      const { vehicle_id, start, end } = req.query;

      if (!vehicle_id || !start || !end) {
        return res.status(400).json({
          message: 'vehicle_id, start, end required',
        });
      }

      const { data, error } = await supabase.rpc(
        'calculate_distance_km',
        {
          v_id: vehicle_id,
          start_time: start,
          end_time: end,
        }
      );

      if (error) throw error;

      res.json({
        vehicle_id,
        distance_km: data || 0,
      });
    } catch (err) {
      console.error('Fleet distance error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);


// GET LAST LOCATION OF VEHICLE
router.get(
  '/last-location/:vehicle_id',
  authenticate,
  requireFleet,
  async (req, res) => {
    const { vehicle_id } = req.params;

    const { data, error } = await supabase
      .from('gps_logs')
      .select('location, speed, recorded_at')
      .eq('vehicle_id', vehicle_id)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return res.status(404).json({ message: 'No GPS data' });
    }

    // extract POINT(lng lat)
    const match = data.location.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
    if (!match) {
      return res.status(500).json({ message: 'Invalid GPS format' });
    }

    res.json({
      latitude: parseFloat(match[2]),
      longitude: parseFloat(match[1]),
      speed: data.speed,
      recorded_at: data.recorded_at,
    });
  }
);

/* ==============================
   ADD / ASSIGN VEHICLE (FLEET)
============================== */
router.post(
  '/assign-vehicle',
  authenticate,
  requireFleet,
  async (req, res) => {
    try {
      const { vehicle_number, vehicle_type } = req.body;
      const { fleet_id } = req.user;

      if (!fleet_id) {
        return res.status(400).json({
          message: 'fleet_id missing (x-fleet-id header)',
        });
      }

      if (!vehicle_number) {
        return res.status(400).json({
          message: 'vehicle_number required',
        });
      }

      await supabase.from('fleet_users').upsert([{ fleet_id }]);

      let { data: vehicle, error: findError } = await supabase
        .from('vehicles')
        .select('*')
        .eq('vehicle_number', vehicle_number)
        .single();

      if (findError && findError.code !== 'PGRST116') throw findError;

      if (!vehicle) {
        const { data: newVehicle, error: createError } =
          await supabase
            .from('vehicles')
            .insert([{
              vehicle_number,
              vehicle_type: vehicle_type || 'FLEET',
              status: 'ACTIVE',
            }])
            .select()
            .single();

        if (createError) throw createError;
        vehicle = newVehicle;
      }

      const { error: updateError } = await supabase
        .from('fleet_users')
        .update({ assigned_vehicle_id: vehicle.vehicle_id })
        .eq('fleet_id', fleet_id);

      if (updateError) throw updateError;

      res.json({
        success: true,
        vehicle_id: vehicle.vehicle_id,
        vehicle_number: vehicle.vehicle_number,
      });
    } catch (err) {
      console.error('Assign vehicle error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);


/* ==============================
   FLEET ROUTE (TODAY)
============================== */
router.get(
  '/route',
  authenticate,
  requireFleet,
  async (req, res) => {
    try {
      const { vehicle_id, date } = req.query;

      if (!vehicle_id || !date) {
        return res.status(400).json({
          message: 'vehicle_id and date required',
        });
      }

      const start = new Date(date);
      start.setHours(0, 0, 0, 0);

      const end = new Date(date);
      end.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from('gps_logs')
        .select('location, speed, recorded_at')
        .eq('vehicle_id', vehicle_id)
        .gte('recorded_at', start.toISOString())
        .lte('recorded_at', end.toISOString())
        .order('recorded_at', { ascending: true });

      if (error) throw error;

      const route = data
        .filter(p => p.location)
        .map(p => ({
          lat: p.location.coordinates[1],
          lng: p.location.coordinates[0],
          speed: p.speed,
          time: p.recorded_at,
        }));

      res.json({ route });
    } catch (err) {
      console.error('Fleet route error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

/* ==============================
   GET DISTANCE (OWNER)
============================== */
router.get(
  '/distance-today',
  authenticate,
  requireFleet,
  async (req, res) => {
    const { vehicle_id } = req.query;
    const today = new Date().toISOString().slice(0, 10);

    const { data } = await supabase
      .from('vehicle_daily_distance')
      .select('distance_km')
      .eq('vehicle_id', vehicle_id)
      .eq('date', today)
      .single();

    res.json({
      vehicle_id,
      date: today,
      distance_km: data?.distance_km || 0,
    });
  }
);

export default router;
