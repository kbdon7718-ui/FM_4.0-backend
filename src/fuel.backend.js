import express from 'express';
import { supabase } from './config/supabase.js';

/* ======================================================
   ROUTER
====================================================== */
const router = express.Router();

/* ======================================================
   AUTH HELPERS (SIMPLE, PLUG YOUR JWT LATER)
====================================================== */
function authenticate(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function requireSupervisor(req, res, next) {
  if (req.user.role !== 'SUPERVISOR') {
    return res.status(403).json({ error: 'Supervisor access required' });
  }
  next();
}

function requireOwner(req, res, next) {
  if (req.user.role !== 'OWNER') {
    return res.status(403).json({ error: 'Owner access required' });
  }
  next();
}

/* ======================================================
   SUPERVISOR – CREATE FUEL ENTRY (BASE)
====================================================== */
router.post('/entries', authenticate, requireSupervisor, async (req, res) => {
  try {
    const {
      vehicle_id,
      fuel_date,
      fuel_quantity,
      fuel_station
    } = req.body;

    if (!vehicle_id || !fuel_date || !fuel_quantity) {
      return res.status(400).json({
        error: 'vehicle_id, fuel_date, fuel_quantity are required'
      });
    }

    const { data, error } = await supabase
      .from('fuel_entries')
      .insert([
        {
          vehicle_id,
          fuel_date,
          fuel_quantity,
          fuel_station: fuel_station || null,
          entered_by: req.user.id // supervisor id from JWT
        }
      ])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Fuel entry saved',
      data
    });

  } catch (err) {
    console.error('Fuel entry error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ======================================================
   OWNER – VIEW FUEL ENTRIES (READ ONLY)
====================================================== */
router.get('/entries', authenticate, requireOwner, async (req, res) => {
  try {
    const { vehicle_id, start_date, end_date } = req.query;

    let query = supabase
      .from('fuel_entries')
      .select(`
        fuel_entry_id,
        vehicle_id,
        fuel_date,
        fuel_quantity,
        fuel_station,
        entered_by,
        created_at,
        vehicles:vehicle_id (
          vehicle_number
        )
      `)
      .order('fuel_date', { ascending: false });

    if (vehicle_id) {
      query = query.eq('vehicle_id', vehicle_id);
    }

    if (start_date) {
      query = query.gte('fuel_date', start_date);
    }

    if (end_date) {
      query = query.lte('fuel_date', end_date);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data
    });

  } catch (err) {
    console.error('Fetch fuel entries error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ======================================================
   EXPORT ROUTER
====================================================== */
export default router;
