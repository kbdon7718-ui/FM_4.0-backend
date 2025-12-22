import express from 'express';
import { supabase } from './config/supabase.js';

const router = express.Router();

/* ============================
   UTILS
============================ */
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

/* ============================
   IN-MEMORY STATE
============================ */
const vehicleGeofenceState = {}; // vehicle_id -> geofence_id -> INSIDE/OUTSIDE

/* ============================
   1️⃣ CREATE COMPANY
============================ */
router.post('/api/companies', async (req, res) => {
  try {
    const {
      company_name,
      address,
      center_lat,
      center_lng,
      radius_meters,
    } = req.body;

    if (!company_name || !center_lat || !center_lng || !radius_meters) {
      return res.status(400).json({ message: 'Invalid payload' });
    }

    const { error } = await supabase.from('companies').insert([
      {
        company_name,
        address,
        center: `POINT(${center_lng} ${center_lat})`,
        radius_meters,
      },
    ]);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ============================
   2️⃣ CREATE GEOFENCE (COMPANY BASED)
============================ */
router.post('/api/geofences', async (req, res) => {
  try {
    const {
      company_id,
      location_name,
      center_lat,
      center_lng,
      radius_meters,
     
    } = req.body;

    const { error } = await supabase.from('geofences').insert([
      {
        company_id,
        location_name,
        center: `POINT(${center_lng} ${center_lat})`,
        radius_meters,
        },
    ]);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ============================
   3️⃣ GPS INGESTION + GEOFENCE ENTRY
============================ */
router.post('/api/gps/update', async (req, res) => {
  try {
    const { vehicle_id, latitude, longitude } = req.body;
    if (!vehicle_id || !latitude || !longitude) {
      return res.status(400).json({ message: 'Invalid GPS payload' });
    }

    const { data: geofences } = await supabase
      .from('geofences')
      .select('geofence_id, center, radius_meters')
      .eq('is_active', true);

    if (!vehicleGeofenceState[vehicle_id]) {
      vehicleGeofenceState[vehicle_id] = {};
    }

    for (const g of geofences) {
      const match = g.center
        .toString()
        .match(/POINT\(([-\d.]+) ([-\d.]+)\)/);

      if (!match) continue;

      const geoLng = parseFloat(match[1]);
      const geoLat = parseFloat(match[2]);

      const distance = getDistanceMeters(
        geoLat,
        geoLng,
        latitude,
        longitude
      );

      const prev =
        vehicleGeofenceState[vehicle_id][g.geofence_id] || 'OUTSIDE';

      if (distance <= g.radius_meters && prev === 'OUTSIDE') {
        await supabase.from('geofence_logs').insert([
          {
            vehicle_id,
            geofence_id: g.geofence_id,
            arrival_time: new Date(),
          },
        ]);

        vehicleGeofenceState[vehicle_id][g.geofence_id] = 'INSIDE';
      }

      if (distance > g.radius_meters) {
        vehicleGeofenceState[vehicle_id][g.geofence_id] = 'OUTSIDE';
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ============================
   4️⃣ SUPERVISOR ALERTS (POLLING)
============================ */
router.get('/api/supervisor/arrival-alerts', async (req, res) => {
  const { data, error } = await supabase
    .from('arrival_logs')
    .select(`
      arrival_log_id,
      status,
      delay_minutes,
      scheduled_time,
      actual_arrival_time,
      vehicles ( vehicle_number ),
      companies ( company_name ),
      company_shifts ( shift_name )
    `)
    .gte('created_at', new Date().toISOString().slice(0, 10))
    .order('status', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

/* ============================
   5️⃣ SUPERVISOR ACTIONS
============================ */

/* Add Note */
router.post('/api/supervisor/arrival-note', async (req, res) => {
  const { arrival_log_id, supervisor_note, action_taken } = req.body;

  const { error } = await supabase
    .from('arrival_logs')
    .update({
      supervisor_note,
      action_taken,
      action_at: new Date(),
    })
    .eq('arrival_log_id', arrival_log_id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

/* Mark Vehicle Under Maintenance */
router.post('/api/supervisor/vehicle-maintenance', async (req, res) => {
  const { vehicle_id } = req.body;

  const { error } = await supabase
    .from('vehicles')
    .update({ status: 'UNDER_MAINTENANCE' })
    .eq('vehicle_id', vehicle_id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

/* Assign Backup Bus */
router.post('/api/supervisor/assign-backup', async (req, res) => {
  const {
    company_id,
    old_vehicle_id,
    backup_vehicle_id,
    arrival_log_id,
  } = req.body;

  await supabase.from('vehicles')
    .update({ status: 'UNDER_MAINTENANCE' })
    .eq('vehicle_id', old_vehicle_id);

  await supabase.from('vehicles')
    .update({ status: 'IN_USE_BACKUP' })
    .eq('vehicle_id', backup_vehicle_id);

  await supabase.from('company_vehicle_assignments').insert([
    {
      company_id,
      vehicle_id: backup_vehicle_id,
      is_primary: false,
      status: 'ACTIVE',
      reason: 'Backup assigned by supervisor',
    },
  ]);

  await supabase.from('arrival_logs')
    .update({
      action_taken: 'BACKUP_ASSIGNED',
      action_at: new Date(),
    })
    .eq('arrival_log_id', arrival_log_id);

  res.json({ success: true });
});


/* ============================
   GET COMPANIES (FOR FRONTEND)
============================ */
router.get('/api/companies', async (req, res) => {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});
/* ============================
   GET COMPANY SHIFTS (FRONTEND)
============================ */


/* ============================
   UPDATE GEOFENCE
============================ */
router.put('/api/geofences/:id', async (req, res) => {
  const { id } = req.params;
  const { company_name, center_lat, center_lng, radius_meters } = req.body;

  const { error } = await supabase
    .from('companies')
    .update({
      company_name,
      center: `POINT(${center_lng} ${center_lat})`,
      radius_meters,
    })
    .eq('company_id', id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

/* ============================
   DELETE GEOFENCE
============================ */
router.delete('/api/geofences/:id', async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from('companies')
    .delete()
    .eq('company_id', id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});


 //for[ ✏️ ] [ 🗑️ ] [ ➕ Assign Vehicle ]
router.post('/api/geofence-assignments', async (req, res) => {
  const {
    geofence_id,
    vehicle_id,
    expected_entry_time,
    grace_minutes,
  } = req.body;

  if (!geofence_id || !vehicle_id || !expected_entry_time) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const { error } = await supabase
    .from('geofence_assignments')
    .insert([{
      geofence_id,
      vehicle_id,
      expected_entry_time,
      grace_minutes: grace_minutes || 0,
    }]);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ success: true });
});


export default router;
