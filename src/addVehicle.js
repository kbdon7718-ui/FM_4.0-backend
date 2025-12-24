import express from 'express';
import { createClient } from '@supabase/supabase-js';

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
  const ownerId = req.headers['x-owner-id'];

  if (role !== 'OWNER') {
    return res.status(403).json({ error: 'Owner access only' });
  }

  if (!ownerId) {
    return res.status(400).json({ error: 'x-owner-id header required' });
  }

  req.owner_id = ownerId;
  next();
}

/* ===============================
   ADD VEHICLE (OWNER ONLY)
=============================== */
router.post('/vehicles', requireOwner, async (req, res) => {
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
router.get('/vehicles', requireOwner, async (req, res) => {
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

export default router;
