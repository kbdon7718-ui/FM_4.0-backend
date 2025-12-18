import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

/* ==============================
   APP INIT
============================== */
const app = express();
app.use(cors());
app.use(express.json());

/* ==============================
   SUPABASE CLIENT
============================== */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* ==============================
   SIMPLE AUTH (TEMP)
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

/* ==============================
   HEALTH CHECK
============================== */
app.get('/', (req, res) => {
  res.send('✅ Fleet Location Backend Running');
});

/* ==============================
   SAVE LIVE GPS (FLEET)
============================== */
app.post(
  '/api/fleet/location',
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

      res.json({ success: true });
    } catch (err) {
      console.error('GPS insert error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

/* ==============================
   ADD VEHICLE FROM FLEET SETTINGS
============================== */
app.post(
  '/api/fleet/assign-vehicle',
  authenticate,
  requireFleet,
  async (req, res) => {
    try {
      const { vehicle_number, vehicle_type } = req.body;
      const { fleet_id } = req.user;

      if (!fleet_id) {
        return res.status(400).json({
          message: 'fleet_id missing (send x-fleet-id header)',
        });
      }

      if (!vehicle_number) {
        return res.status(400).json({
          message: 'vehicle_number required',
        });
      }

      // ensure fleet user exists
      await supabase.from('fleet_users').upsert([
        { fleet_id },
      ]);

      // check if vehicle exists
      let { data: vehicle, error: findError } = await supabase
        .from('vehicles')
        .select('*')
        .eq('vehicle_number', vehicle_number)
        .single();

      if (findError && findError.code !== 'PGRST116') {
        throw findError;
      }

      // create vehicle if not exists
      if (!vehicle) {
        const { data: newVehicle, error: createError } = await supabase
          .from('vehicles')
          .insert([
            {
              vehicle_number,
              vehicle_type: vehicle_type || 'FLEET',
              status: 'ACTIVE',
            },
          ])
          .select()
          .single();

        if (createError) throw createError;
        vehicle = newVehicle;
      }

      // assign vehicle to fleet
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
   GET DISTANCE COVERED (OWNER)
============================== */
app.get(
  '/api/fleet/distance',
  authenticate,
  requireOwner,
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
      console.error('Distance calc error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

export { app };
