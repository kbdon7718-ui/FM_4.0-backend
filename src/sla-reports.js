import express from 'express';
import { supabase } from './config/supabase.js';

/* ======================================================
   GEOFENCE MODEL CLASS
====================================================== */
export class Geofence {
  static async findAll() {
    const { data, error } = await supabase
      .from('geofences')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  static async findById(geofenceId) {
    const { data, error } = await supabase
      .from('geofences')
      .select('*')
      .eq('geofence_id', geofenceId)
      .single();

    if (error) throw error;
    return data;
  }

  static async create(geofenceData) {
    const { data, error } = await supabase
      .from('geofences')
      .insert([geofenceData])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async update(geofenceId, updateData) {
    const { data, error } = await supabase
      .from('geofences')
      .update(updateData)
      .eq('geofence_id', geofenceId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async delete(geofenceId) {
    const { error } = await supabase
      .from('geofences')
      .delete()
      .eq('geofence_id', geofenceId);

    if (error) throw error;
    return true;
  }
}

/* ======================================================
   GEOFENCE LOG MODEL CLASS
====================================================== */
export class GeofenceLog {
  static async findAll() {
    const { data, error } = await supabase
      .from('geofence_logs')
      .select(`
        *,
        vehicles:vehicle_id (
          vehicle_number
        ),
        geofences:geofence_id (
          location_name
        )
      `)
      .order('entry_time', { ascending: false });

    if (error) throw error;
    return data;
  }

  static async findByVehicle(vehicleId) {
    const { data, error } = await supabase
      .from('geofence_logs')
      .select(`
        *,
        vehicles:vehicle_id (
          vehicle_number
        ),
        geofences:geofence_id (
          location_name
        )
      `)
      .eq('vehicle_id', vehicleId)
      .order('entry_time', { ascending: false });

    if (error) throw error;
    return data;
  }

  static async create(logData) {
    const { data, error } = await supabase
      .from('geofence_logs')
      .insert([logData])
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

/* ======================================================
   PENALTY MODEL CLASS
====================================================== */
export class Penalty {
  static async findAll() {
    const { data, error } = await supabase
      .from('penalties')
      .select(`
        *,
        vehicles:vehicle_id (
          vehicle_number
        ),
        geofences:geofence_id (
          location_name
        )
      `)
      .order('penalty_date', { ascending: false });

    if (error) throw error;
    return data;
  }

  static async findByVehicle(vehicleId) {
    const { data, error } = await supabase
      .from('penalties')
      .select(`
        *,
        vehicles:vehicle_id (
          vehicle_number
        ),
        geofences:geofence_id (
          location_name
        )
      `)
      .eq('vehicle_id', vehicleId)
      .order('penalty_date', { ascending: false });

    if (error) throw error;
    return data;
  }

  static async create(penaltyData) {
    const { data, error } = await supabase
      .from('penalties')
      .insert([penaltyData])
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

/* ======================================================
   GEOFENCE LOGIC FUNCTIONS
====================================================== */

/**
 * Calculate distance between two points using Haversine formula
 * @param {number} lat1 - Latitude 1
 * @param {number} lng1 - Longitude 1
 * @param {number} lat2 - Latitude 2
 * @param {number} lng2 - Longitude 2
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Monitor vehicle arrival at destination
 * @param {Object} params
 * @param {Object} params.vehicleLocation - Current location {lat, lng}
 * @param {Object} params.geofence - Geofence configuration
 * @param {Date} params.expectedArrival - Expected arrival time
 * @returns {Object} Arrival monitoring result
 */
export function monitorArrival({ vehicleLocation, geofence, expectedArrival }) {
  const now = new Date();
  const expectedTime = new Date(expectedArrival);
  const timeDiff = (now - expectedTime) / (1000 * 60); // minutes

  const isInGeofence = calculateDistance(
    vehicleLocation.lat,
    vehicleLocation.lng,
    geofence.center_lat,
    geofence.center_lng
  ) <= (geofence.radius_meters / 1000);

  let status = 'ON_TIME';
  let penalty = 0;

  if (!isInGeofence) {
    if (timeDiff > geofence.expected_time_minutes) {
      status = 'LATE';
      penalty = Math.floor(timeDiff / 60) * 100; // $100 per hour late
    } else {
      status = 'EN_ROUTE';
    }
  } else {
    if (timeDiff <= geofence.expected_time_minutes) {
      status = 'ARRIVED_ON_TIME';
    } else {
      status = 'ARRIVED_LATE';
      penalty = Math.floor(timeDiff / 60) * 100;
    }
  }

  return {
    isInGeofence,
    status,
    timeDifferenceMinutes: timeDiff,
    penaltyAmount: penalty,
    monitoredAt: now.toISOString()
  };
}

/**
 * Generate SLA alert for late arrivals
 * @param {Object} params
 * @param {string} params.vehicleId - Vehicle ID
 * @param {string} params.geofenceId - Geofence ID
 * @param {number} params.delayMinutes - Delay in minutes
 * @returns {Object} Alert configuration
 */
export function generateSLAAAlert({ vehicleId, geofenceId, delayMinutes }) {
  const severity = delayMinutes > 120 ? 'CRITICAL' :
                   delayMinutes > 60 ? 'HIGH' : 'MEDIUM';

  return {
    alertType: 'SLA_VIOLATION',
    severity,
    vehicleId,
    geofenceId,
    delayMinutes,
    message: `Vehicle delayed by ${delayMinutes} minutes`,
    generatedAt: new Date().toISOString()
  };
}

/* ======================================================
   ROUTER
====================================================== */
const router = express.Router();

/* ======================================================
   AUTH HELPERS
====================================================== */
function authenticate(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function requireOwner(req, res, next) {
  if (req.user.role !== 'OWNER') {
    return res.status(403).json({ error: 'Owner access required' });
  }
  next();
}

function requireSupervisor(req, res, next) {
  if (req.user.role !== 'SUPERVISOR') {
    return res.status(403).json({ error: 'Supervisor access required' });
  }
  next();
}

/* ======================================================
   OWNER ENDPOINTS - Analysis & Decision Making
====================================================== */
router.get('/geofences', authenticate, requireOwner, async (req, res) => {
  try {
    const geofences = await Geofence.findAll();

    res.json({
      success: true,
      data: geofences
    });
  } catch (error) {
    console.error('Get geofences error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch geofences',
      error: error.message
    });
  }
});

router.get('/geofences/:geofence_id', authenticate, requireOwner, async (req, res) => {
  try {
    const { geofence_id } = req.params;

    const geofence = await Geofence.findById(geofence_id);

    if (!geofence) {
      return res.status(404).json({
        success: false,
        message: 'Geofence not found'
      });
    }

    res.json({
      success: true,
      data: geofence
    });
  } catch (error) {
    console.error('Get geofence error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch geofence',
      error: error.message
    });
  }
});

/* ======================================================
   SUPERVISOR ENDPOINTS - Data entry
====================================================== */
router.post('/geofences', authenticate, requireSupervisor, async (req, res) => {
  try {
    const { location_name, center_lat, center_lng, radius_meters, expected_time_minutes } = req.body;

    if (!location_name || center_lat == null || center_lng == null || !radius_meters) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: location_name, center_lat, center_lng, radius_meters'
      });
    }

    const geofence = await Geofence.create({
      location_name,
      center_lat: Number(center_lat),
      center_lng: Number(center_lng),
      radius_meters: Number(radius_meters),
      expected_time_minutes: expected_time_minutes ? Number(expected_time_minutes) : 60,
      created_by: req.user.id
    });

    res.status(201).json({
      success: true,
      message: 'Geofence created successfully',
      data: geofence
    });
  } catch (error) {
    console.error('Create geofence error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create geofence',
      error: error.message
    });
  }
});

router.put('/geofences/:geofence_id', authenticate, requireSupervisor, async (req, res) => {
  try {
    const { geofence_id } = req.params;
    const updateData = req.body;

    const geofence = await Geofence.update(geofence_id, updateData);

    res.json({
      success: true,
      message: 'Geofence updated successfully',
      data: geofence
    });
  } catch (error) {
    console.error('Update geofence error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update geofence',
      error: error.message
    });
  }
});

router.delete('/geofences/:geofence_id', authenticate, requireSupervisor, async (req, res) => {
  try {
    const { geofence_id } = req.params;

    await Geofence.delete(geofence_id);

    res.json({
      success: true,
      message: 'Geofence deleted successfully'
    });
  } catch (error) {
    console.error('Delete geofence error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete geofence',
      error: error.message
    });
  }
});

/* ======================================================
   OWNER ENDPOINTS - Analytics
====================================================== */
router.get('/logs', authenticate, requireOwner, async (req, res) => {
  try {
    const logs = await GeofenceLog.findAll();

    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    console.error('Get geofence logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch geofence logs',
      error: error.message
    });
  }
});

router.get('/logs/:vehicle_id', authenticate, requireOwner, async (req, res) => {
  try {
    const { vehicle_id } = req.params;

    const logs = await GeofenceLog.findByVehicle(vehicle_id);

    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    console.error('Get geofence logs by vehicle error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch geofence logs',
      error: error.message
    });
  }
});

router.get('/penalties', authenticate, requireOwner, async (req, res) => {
  try {
    const penalties = await Penalty.findAll();

    res.json({
      success: true,
      data: penalties
    });
  } catch (error) {
    console.error('Get penalties error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch penalties',
      error: error.message
    });
  }
});

router.get('/penalties/:vehicle_id', authenticate, requireOwner, async (req, res) => {
  try {
    const { vehicle_id } = req.params;

    const penalties = await Penalty.findByVehicle(vehicle_id);

    res.json({
      success: true,
      data: penalties
    });
  } catch (error) {
    console.error('Get penalties by vehicle error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch penalties',
      error: error.message
    });
  }
});

router.post('/process', authenticate, requireOwner, async (req, res) => {
  try {
    const { vehicle_id, geofence_id, actual_arrival_time } = req.body;

    if (!vehicle_id || !geofence_id || !actual_arrival_time) {
      return res.status(400).json({
        success: false,
        message: 'vehicle_id, geofence_id, actual_arrival_time are required'
      });
    }

    // Get geofence details
    const geofence = await Geofence.findById(geofence_id);
    if (!geofence) {
      return res.status(404).json({
        success: false,
        message: 'Geofence not found'
      });
    }

    // Mock vehicle location (in real app, get from GPS)
    const vehicleLocation = { lat: geofence.center_lat, lng: geofence.center_lng };

    // Monitor arrival
    const arrivalResult = monitorArrival({
      vehicleLocation,
      geofence,
      expectedArrival: new Date(actual_arrival_time)
    });

    // Log the entry
    const logEntry = await GeofenceLog.create({
      vehicle_id,
      geofence_id,
      entry_time: actual_arrival_time,
      exit_time: null,
      status: arrivalResult.status
    });

    // Create penalty if late
    let penalty = null;
    if (arrivalResult.penaltyAmount > 0) {
      penalty = await Penalty.create({
        vehicle_id,
        geofence_id,
        penalty_date: new Date().toISOString(),
        penalty_amount: arrivalResult.penaltyAmount,
        reason: `Late arrival by ${arrivalResult.timeDifferenceMinutes} minutes`,
        status: 'PENDING'
      });
    }

    res.json({
      success: true,
      message: 'SLA processed successfully',
      data: {
        logEntry,
        penalty,
        arrivalResult
      }
    });
  } catch (error) {
    console.error('Process SLA error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process SLA',
      error: error.message
    });
  }
});

router.get('/analytics/compliance', authenticate, requireOwner, async (req, res) => {
  try {
    // Get all logs and penalties for analytics
    const [logs, penalties] = await Promise.all([
      GeofenceLog.findAll(),
      Penalty.findAll()
    ]);

    const totalTrips = logs.length;
    const onTimeTrips = logs.filter(log => log.status === 'ARRIVED_ON_TIME').length;
    const lateTrips = logs.filter(log => log.status === 'ARRIVED_LATE').length;
    const totalPenalties = penalties.length;
    const totalPenaltyAmount = penalties.reduce((sum, p) => sum + (p.penalty_amount || 0), 0);

    const complianceRate = totalTrips > 0 ? (onTimeTrips / totalTrips) * 100 : 0;

    res.json({
      success: true,
      data: {
        totalTrips,
        onTimeTrips,
        lateTrips,
        totalPenalties,
        totalPenaltyAmount,
        complianceRate: Number(complianceRate.toFixed(2))
      }
    });
  } catch (error) {
    console.error('Get compliance analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch compliance analytics',
      error: error.message
    });
  }
});

/* ======================================================
   EXPORT ROUTER
====================================================== */
export default router;