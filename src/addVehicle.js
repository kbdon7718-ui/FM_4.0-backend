import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { listMillitrackDevices } from './millitrackSync.js';

const router = express.Router();

/* ===============================
   SUPABASE CLIENT (SERVER ONLY)
=============================== */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* ===============================
   SIMPLE ROLE CHECK
=============================== */
function requireOwner(req, res, next) {
  const role = req.headers['x-role'];
  const ownerIdRaw = req.headers['x-owner-id'];
  const ownerId = String(ownerIdRaw || '').trim();

  if (role !== 'OWNER') {
    return res.status(403).json({ error: 'Owner access only' });
  }

  if (!ownerId || ownerId === 'undefined' || ownerId === 'null') {
    return res.status(400).json({ error: 'x-owner-id header required' });
  }

  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidLike.test(ownerId)) {
    return res.status(400).json({ error: 'x-owner-id must be a valid UUID' });
  }

  req.owner_id = ownerId;
  next();
}

router.get('/integrations/millitrack/devices', requireOwner, async (req, res) => {
  try {
    const devices = await listMillitrackDevices();
    res.json({ success: true, data: devices });
  } catch (err) {
    console.error('Millitrack devices list error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ===============================
   ADD VEHICLE (OWNER ONLY)
=============================== */
router.post('/owner/vehicles', requireOwner, async (req, res) => {
  try {
    const {
      vehicle_number,
      vehicle_type,
      manufacturer,
      model,
      manufacturing_year,
      fuel_type,
      tank_capacity,
      expected_mileage,
      gps_provider,
      gps_device_id,
      registration_state,
    } = req.body;

    if (!vehicle_type) {
      return res.status(400).json({
        error: 'vehicle_type is required',
      });
    }

    // ❌ Do NOT auto-generate in production
    const finalVehicleNumber =
  vehicle_number && vehicle_number.trim() !== ''
    ? vehicle_number.toUpperCase()
    : `TEMP-${Date.now()}`;


    const { data, error } = await supabase
      .from('vehicles')
      .insert([
        {
          owner_id: req.owner_id, // 🔥 REQUIRED
         vehicle_number: finalVehicleNumber,
          vehicle_type,
          manufacturer: manufacturer || null,
          model: model || null,
          manufacturing_year: manufacturing_year || null,
          registration_state: registration_state || null,
          fuel_type: fuel_type || null,
          tank_capacity: tank_capacity || null,
          expected_mileage: expected_mileage || null,
          gps_provider: gps_provider || null,
          gps_device_id: gps_device_id || null,
          status: 'ACTIVE',
        },
      ])
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({
      success: true,
      vehicle: data,
    });
  } catch (err) {
    console.error('Add vehicle error:', err);
    res.status(500).json({ error: 'Failed to add vehicle' });
  }
});

/* ===============================
   GET VEHICLES (OWNER ONLY)
=============================== */
router.get('/owner/vehicles', requireOwner, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('owner_id', req.owner_id)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(data);
  } catch (err) {
    console.error('Fetch vehicles error:', err);
    res.status(500).json({ error: 'Failed to fetch vehicles' });
  }
});

router.put('/owner/vehicles/:vehicle_id', requireOwner, async (req, res) => {
  try {
    const { vehicle_id } = req.params;

    const {
      vehicle_number,
      vehicle_type,
      manufacturer,
      model,
      manufacturing_year,
      fuel_type,
      tank_capacity,
      expected_mileage,
      gps_provider,
      gps_device_id,
      registration_state,
      status,
    } = req.body;

    const updateFields = {};
    if (vehicle_number !== undefined) {
      updateFields.vehicle_number = vehicle_number ? vehicle_number.toUpperCase() : null;
    }
    if (vehicle_type !== undefined) updateFields.vehicle_type = vehicle_type;
    if (manufacturer !== undefined) updateFields.manufacturer = manufacturer;
    if (model !== undefined) updateFields.model = model;
    if (manufacturing_year !== undefined) updateFields.manufacturing_year = manufacturing_year;
    if (registration_state !== undefined) updateFields.registration_state = registration_state;
    if (fuel_type !== undefined) updateFields.fuel_type = fuel_type;
    if (tank_capacity !== undefined) updateFields.tank_capacity = tank_capacity;
    if (expected_mileage !== undefined) updateFields.expected_mileage = expected_mileage;
    if (gps_provider !== undefined) updateFields.gps_provider = gps_provider;
    if (gps_device_id !== undefined) updateFields.gps_device_id = gps_device_id;
    if (status !== undefined) updateFields.status = status;

    const { data, error } = await supabase
      .from('vehicles')
      .update(updateFields)
      .eq('vehicle_id', vehicle_id)
      .eq('owner_id', req.owner_id)
      .select();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    res.json({
      success: true,
      vehicle: data[0],
    });
  } catch (err) {
    console.error('Update vehicle error:', err);
    res.status(500).json({ error: 'Failed to update vehicle' });
  }
});

router.delete('/owner/vehicles/:vehicle_id', requireOwner, async (req, res) => {
  try {
    const { vehicle_id } = req.params;

    const { data, error } = await supabase
      .from('vehicles')
      .delete()
      .eq('vehicle_id', vehicle_id)
      .eq('owner_id', req.owner_id)
      .select();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Delete vehicle error:', err);
    res.status(500).json({ error: 'Failed to delete vehicle' });
  }
});

export default router;
