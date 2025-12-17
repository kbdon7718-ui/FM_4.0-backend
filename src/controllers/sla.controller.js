// backend/src/controllers/sla.controller.js

import { supabase } from '../config/supabase.js';
import { calculateSLAStatus } from '../logic/geofence.logic.js';

/**
 * Process SLA & geofence entry
 * Called on live GPS ingestion
 */
export const processSLA = async (req, res) => {
  try {
    const {
      vehicle_id,
      latitude,
      longitude,
      recorded_at,
    } = req.body;

    if (!vehicle_id || latitude == null || longitude == null) {
      return res.status(400).json({ error: 'Missing SLA input data' });
    }

    // 1️⃣ Active vehicle assignment
    const { data: assignment, error: assignmentError } =
      await supabase
        .from('vehicle_assignments')
        .select('route_id')
        .eq('vehicle_id', vehicle_id)
        .is('end_time', null)
        .single();

    if (assignmentError || !assignment) {
      return res.json({ status: 'NO_ACTIVE_ROUTE' });
    }

    // 2️⃣ Route geofence
    const { data: geofence, error: geofenceError } =
      await supabase
        .from('geofences')
        .select('*')
        .eq('route_id', assignment.route_id)
        .single();

    if (geofenceError || !geofence) {
      return res.json({ status: 'NO_GEOFENCE' });
    }

    // 3️⃣ Already logged?
    const { data: existingLog } = await supabase
      .from('geofence_logs')
      .select('geofence_log_id')
      .eq('vehicle_id', vehicle_id)
      .eq('geofence_id', geofence.geofence_id)
      .maybeSingle();

    if (existingLog) {
      return res.json({ status: 'ALREADY_RECORDED' });
    }

    // 4️⃣ Check geofence entry using PostGIS
    const { data: inside, error: insideError } =
      await supabase.rpc('check_geofence_entry', {
        lat: latitude,
        lng: longitude,
        gf_id: geofence.geofence_id,
      });

    if (insideError || !inside) {
      return res.json({ status: 'OUTSIDE_GEOFENCE' });
    }

    // 5️⃣ SLA calculation
    const { status, delayMinutes } = calculateSLAStatus({
      expectedArrivalTime: geofence.expected_time,
      actualArrivalTime: recorded_at || new Date(),
    });

    // 6️⃣ Save SLA log
    await supabase.from('geofence_logs').insert({
      vehicle_id,
      geofence_id: geofence.geofence_id,
      arrival_time: recorded_at || new Date(),
      delay_minutes: delayMinutes,
      status,
    });

    return res.json({
      success: true,
      status,
      delayMinutes,
    });
  } catch (err) {
    console.error('SLA error:', err.message);
    return res.status(500).json({ error: 'SLA processing failed' });
  }
};
