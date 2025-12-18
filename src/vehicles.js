import express from 'express';
import { supabase } from './config/supabase.js';

/* ======================================================
   VEHICLE MODEL CLASS
====================================================== */
export class Vehicle {
  static async findAll() {
    const { data, error } = await supabase
      .from('vehicles')
      .select(`
        *,
        owners:owner_id (
          owner_id,
          owner_name,
          owner_email
        ),
        drivers:driver_id (
          driver_id,
          driver_name,
          driver_phone
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  static async findById(vehicleId) {
    const { data, error } = await supabase
      .from('vehicles')
      .select(`
        *,
        owners:owner_id (
          owner_id,
          owner_name,
          owner_email
        ),
        drivers:driver_id (
          driver_id,
          driver_name,
          driver_phone
        )
      `)
      .eq('vehicle_id', vehicleId)
      .single();

    if (error) throw error;
    return data;
  }

  static async create(vehicleData) {
    const { data, error } = await supabase
      .from('vehicles')
      .insert([vehicleData])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async update(vehicleId, updateData) {
    const { data, error } = await supabase
      .from('vehicles')
      .update(updateData)
      .eq('vehicle_id', vehicleId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async delete(vehicleId) {
    const { error } = await supabase
      .from('vehicles')
      .delete()
      .eq('vehicle_id', vehicleId);

    if (error) throw error;
    return true;
  }
}

/* ======================================================
   OWNER MODEL CLASS
====================================================== */
export class Owner {
  static async findAll() {
    const { data, error } = await supabase
      .from('owners')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  static async create(ownerData) {
    const { data, error } = await supabase
      .from('owners')
      .insert([ownerData])
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

/* ======================================================
   DRIVER MODEL CLASS
====================================================== */
export class Driver {
  static async findAll() {
    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  static async create(driverData) {
    const { data, error } = await supabase
      .from('drivers')
      .insert([driverData])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async assignToVehicle(driverId, vehicleId) {
    const { data, error } = await supabase
      .from('vehicles')
      .update({ driver_id: driverId })
      .eq('vehicle_id', vehicleId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async unassignFromVehicle(vehicleId) {
    const { data, error } = await supabase
      .from('vehicles')
      .update({ driver_id: null })
      .eq('vehicle_id', vehicleId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
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

function requireOwnerOrSupervisor(req, res, next) {
  if (req.user.role !== 'OWNER' && req.user.role !== 'SUPERVISOR') {
    return res.status(403).json({ error: 'Owner or Supervisor access required' });
  }
  next();
}

/* ======================================================
   SHARED ENDPOINTS - Both roles can view
====================================================== */
router.get('/', authenticate, requireOwnerOrSupervisor, async (req, res) => {
  try {
    let vehicles;

    if (req.user.role === 'OWNER') {
      vehicles = await Vehicle.findAll();
    } else if (req.user.role === 'SUPERVISOR') {
      vehicles = await Vehicle.findAll();
    }

    res.json({
      success: true,
      data: vehicles
    });
  } catch (error) {
    console.error('Get vehicles error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vehicles',
      error: error.message
    });
  }
});

router.get('/:vehicle_id', authenticate, requireOwnerOrSupervisor, async (req, res) => {
  try {
    const { vehicle_id } = req.params;

    const vehicle = await Vehicle.findById(vehicle_id);

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found'
      });
    }

    res.json({
      success: true,
      data: vehicle
    });
  } catch (error) {
    console.error('Get vehicle error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vehicle',
      error: error.message
    });
  }
});

/* ======================================================
   OWNER ENDPOINTS - Management
====================================================== */
router.post('/', authenticate, requireOwner, async (req, res) => {
  try {
    const {
      vehicle_number,
      vehicle_type,
      owner_id,
      driver_id,
      registration_number,
      chassis_number,
      engine_number,
      manufacturer,
      model,
      year,
      fuel_type,
      tank_capacity,
      mileage,
      insurance_expiry,
      fitness_expiry,
      permit_expiry
    } = req.body;

    if (!vehicle_number || !vehicle_type || !owner_id) {
      return res.status(400).json({
        success: false,
        message: 'vehicle_number, vehicle_type, owner_id are required'
      });
    }

    const vehicle = await Vehicle.create({
      vehicle_number,
      vehicle_type,
      owner_id,
      driver_id: driver_id || null,
      registration_number: registration_number || null,
      chassis_number: chassis_number || null,
      engine_number: engine_number || null,
      manufacturer: manufacturer || null,
      model: model || null,
      year: year || null,
      fuel_type: fuel_type || null,
      tank_capacity: tank_capacity || null,
      mileage: mileage || 0,
      insurance_expiry: insurance_expiry || null,
      fitness_expiry: fitness_expiry || null,
      permit_expiry: permit_expiry || null
    });

    res.status(201).json({
      success: true,
      message: 'Vehicle created successfully',
      data: vehicle
    });
  } catch (error) {
    console.error('Create vehicle error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create vehicle',
      error: error.message
    });
  }
});

router.put('/:vehicle_id', authenticate, requireOwner, async (req, res) => {
  try {
    const { vehicle_id } = req.params;
    const updateData = req.body;

    const vehicle = await Vehicle.update(vehicle_id, updateData);

    res.json({
      success: true,
      message: 'Vehicle updated successfully',
      data: vehicle
    });
  } catch (error) {
    console.error('Update vehicle error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update vehicle',
      error: error.message
    });
  }
});

router.delete('/:vehicle_id', authenticate, requireOwner, async (req, res) => {
  try {
    const { vehicle_id } = req.params;

    await Vehicle.delete(vehicle_id);

    res.json({
      success: true,
      message: 'Vehicle deleted successfully'
    });
  } catch (error) {
    console.error('Delete vehicle error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete vehicle',
      error: error.message
    });
  }
});

/* ======================================================
   OWNER ENDPOINTS - Owner management
====================================================== */
router.get('/owners/list', authenticate, requireOwner, async (req, res) => {
  try {
    const owners = await Owner.findAll();

    res.json({
      success: true,
      data: owners
    });
  } catch (error) {
    console.error('Get owners error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch owners',
      error: error.message
    });
  }
});

router.post('/owners', authenticate, requireOwner, async (req, res) => {
  try {
    const { owner_name, owner_email, owner_phone, owner_address } = req.body;

    if (!owner_name || !owner_email) {
      return res.status(400).json({
        success: false,
        message: 'owner_name and owner_email are required'
      });
    }

    const owner = await Owner.create({
      owner_name,
      owner_email,
      owner_phone: owner_phone || null,
      owner_address: owner_address || null
    });

    res.status(201).json({
      success: true,
      message: 'Owner created successfully',
      data: owner
    });
  } catch (error) {
    console.error('Create owner error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create owner',
      error: error.message
    });
  }
});

/* ======================================================
   SHARED ENDPOINTS - Driver management
====================================================== */
router.get('/drivers/list', authenticate, requireOwnerOrSupervisor, async (req, res) => {
  try {
    const drivers = await Driver.findAll();

    res.json({
      success: true,
      data: drivers
    });
  } catch (error) {
    console.error('Get drivers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch drivers',
      error: error.message
    });
  }
});

router.post('/drivers', authenticate, requireOwner, async (req, res) => {
  try {
    const { driver_name, driver_phone, driver_license, driver_address } = req.body;

    if (!driver_name || !driver_phone) {
      return res.status(400).json({
        success: false,
        message: 'driver_name and driver_phone are required'
      });
    }

    const driver = await Driver.create({
      driver_name,
      driver_phone,
      driver_license: driver_license || null,
      driver_address: driver_address || null
    });

    res.status(201).json({
      success: true,
      message: 'Driver created successfully',
      data: driver
    });
  } catch (error) {
    console.error('Create driver error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create driver',
      error: error.message
    });
  }
});

router.post('/drivers/:driver_id/assign', authenticate, requireOwner, async (req, res) => {
  try {
    const { driver_id } = req.params;
    const { vehicle_id } = req.body;

    if (!vehicle_id) {
      return res.status(400).json({
        success: false,
        message: 'vehicle_id is required'
      });
    }

    const vehicle = await Driver.assignToVehicle(driver_id, vehicle_id);

    res.json({
      success: true,
      message: 'Driver assigned to vehicle successfully',
      data: vehicle
    });
  } catch (error) {
    console.error('Assign driver error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign driver',
      error: error.message
    });
  }
});

router.post('/drivers/:driver_id/unassign', authenticate, requireOwner, async (req, res) => {
  try {
    const { driver_id } = req.params;
    const { vehicle_id } = req.body;

    if (!vehicle_id) {
      return res.status(400).json({
        success: false,
        message: 'vehicle_id is required'
      });
    }

    const vehicle = await Driver.unassignFromVehicle(vehicle_id);

    res.json({
      success: true,
      message: 'Driver unassigned from vehicle successfully',
      data: vehicle
    });
  } catch (error) {
    console.error('Unassign driver error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unassign driver',
      error: error.message
    });
  }
});

/* ======================================================
   EXPORT ROUTER
====================================================== */
export default router;