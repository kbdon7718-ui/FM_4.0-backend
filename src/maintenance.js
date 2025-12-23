import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const router = express.Router();
router.use(express.json());
router.use(cors());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* =====================================================
   VEHICLES (MASTER DATA)
   URL → GET /api/maintenance/vehicles
===================================================== */
router.get("/maintenance/vehicles", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("vehicles")
      .select("vehicle_id, vehicle_number")
      .or("status.eq.ACTIVE,status.is.null");

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error("Vehicle fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================
   MAINTENANCE ENTRY (SUPERVISOR)
   URL → POST /api/maintenance
===================================================== */
router.post("/maintenance", async (req, res) => {
  try {
    const {
      vehicle_id,
      vehicle_number,
      maintenance_type, // 'SERVICE', 'COMPLIANCE', 'TYRE', 'BREAKDOWN'
      category,
      service_date,
      odometer_km,
      next_due_km,
      next_due_date,
      cost,
      invoice_url,
      remarks,
      // Tyre specific
      tyre_serial_number,
      tyre_position,
      // Compliance specific
      valid_from,
      valid_upto,
      // Breakdown specific
      breakdown_location,
      downtime_hours,
      entered_by,
    } = req.body;

    console.log("Maintenance insert request:", {
      vehicle_id,
      vehicle_number,
      maintenance_type,
      category,
      service_date,
      odometer_km,
      next_due_km,
      next_due_date,
      cost,
      remarks,
      tyre_serial_number,
      tyre_position,
      valid_from,
      valid_upto,
      breakdown_location,
      downtime_hours,
      entered_by,
    });

    if (!vehicle_id || !maintenance_type || !service_date) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Validate maintenance_type
    const validTypes = ['SERVICE', 'COMPLIANCE', 'TYRE', 'BREAKDOWN'];
    if (!validTypes.includes(maintenance_type)) {
      return res.status(400).json({ error: "Invalid maintenance_type" });
    }

    // Validate vehicle_id is a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(vehicle_id)) {
      return res.status(400).json({ error: "Invalid vehicle_id format" });
    }

    const insertData = {
      vehicle_id,
      vehicle_number,
      maintenance_type,
      category,
      service_date: service_date ? new Date(service_date).toISOString().split('T')[0] : null,
      odometer_km: odometer_km ? Number(odometer_km) : null,
      next_due_km: next_due_km ? Number(next_due_km) : null,
      next_due_date: next_due_date ? new Date(next_due_date).toISOString().split('T')[0] : null,
      cost: cost ? Number(cost) : null,
      invoice_url,
      remarks,
      tyre_serial_number,
      tyre_position,
      valid_from: valid_from ? new Date(valid_from).toISOString().split('T')[0] : null,
      valid_upto: valid_upto ? new Date(valid_upto).toISOString().split('T')[0] : null,
      breakdown_location,
      downtime_hours: downtime_hours ? Number(downtime_hours) : null,
      created_by: entered_by,
    };

    console.log("Inserting maintenance data:", insertData);

    const { data, error } = await supabase
      .from("vehicle_maintenance")
      .insert([insertData])
      .select()
      .single();

    console.log("Insert result:", { data, error });

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error("Maintenance entry error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================
   RECENT MAINTENANCE ENTRIES
   URL → GET /api/maintenance/recent?vehicle_id=uuid
===================================================== */
router.get("/maintenance/recent", async (req, res) => {
  try {
    const { vehicle_id } = req.query;

    let query = supabase
      .from("vehicle_maintenance")
      .select(`
        maintenance_id,
        vehicle_id,
        vehicle_number,
        maintenance_type,
        category,
        service_date,
        odometer_km,
        next_due_km,
        next_due_date,
        cost,
        remarks,
        valid_upto,
        created_at
      `)
      .order("created_at", { ascending: false });

    if (vehicle_id) {
      query = query.eq("vehicle_id", vehicle_id).limit(5);
    } else {
      query = query.limit(10);
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error("Recent maintenance fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================
   MAINTENANCE ALERTS
   URL → GET /api/maintenance/alerts
===================================================== */
router.get("/maintenance/alerts", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("maintenance_alerts")
      .select("*")
      .eq("resolved", false)
      .order("alert_date", { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error("Maintenance alerts fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================
   VEHICLE SERVICE HISTORY
   URL → GET /api/maintenance/history/:vehicle_id
===================================================== */
router.get("/maintenance/history/:vehicle_id", async (req, res) => {
  try {
    const { vehicle_id } = req.params;
    const { data, error } = await supabase
      .from("vehicle_maintenance")
      .select("*")
      .eq("vehicle_id", vehicle_id)
      .order("service_date", { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error("Service history fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;