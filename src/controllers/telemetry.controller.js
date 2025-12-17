// backend/src/controllers/telemetry.controller.js

import { supabase } from '../config/supabase.js';

/**
 * Ingest live telemetry from GPS provider (Millitrack)
 * This will be called by webhook / polling job
 */
export const ingestTelemetry = async (req, res) => {
  try {
    const {
      vehicle_id,
      latitude,
      longitude,
      speed,
      ignition,
      recorded_at,
    } = req.body;

    if (!vehicle_id || latitude == null || longitude == null) {
      return res.status(400).json({ error: 'Missing required telemetry fields' });
    }

    const { error } = await supabase.from('gps_logs').insert([
      {
        vehicle_id,
        location: `POINT(${longitude} ${latitude})`,
        speed,
        ignition,
        recorded_at: recorded_at || new Date(),
      },
    ]);

    if (error) throw error;

    return res.status(201).json({ message: 'Telemetry ingested successfully' });
  } catch (err) {
    console.error('Telemetry ingest error:', err.message);
    return res.status(500).json({ error: 'Failed to ingest telemetry' });
  }
};

/**
 * Get latest telemetry for all vehicles
 */
export const getLatestTelemetry = async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('latest_vehicle_positions');

    if (error) throw error;

    return res.json(data || []);
  } catch (err) {
    console.error('Fetch telemetry error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch telemetry' });
  }
};
