import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

/* ===============================
   SUPABASE CLIENT
=============================== */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // backend only
);

/* ===============================
   ADD VEHICLE (NO LOGIN REQUIRED)
=============================== */
router.post('/vehicles', async (req, res) => {
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

    // ✅ Vehicle number optional – auto-generate if missing
    const finalVehicleNumber =
      vehicle_number && vehicle_number.trim() !== ''
        ? vehicle_number
        : `TEMP-${Date.now()}`;

    const { data, error } = await supabase
      .from('vehicles')
      .insert([
        {
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
    console.error(err);
    res.status(500).json({ error: 'Failed to add vehicle' });
  }
});

/* ===============================
   GET ALL VEHICLES (NO LOGIN)
=============================== */
router.get('/vehicles', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch vehicles' });
  }
});

export default router;
