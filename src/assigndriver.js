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
   VEHICLES (FOR ASSIGNMENT)
   URL → GET /api/assign-driver/vehicles
===================================================== */
router.get("/assign-driver/vehicles", async (req, res) => {
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
   CURRENT DRIVER ASSIGNMENTS
   URL → GET /api/assign-driver/current
===================================================== */
router.get("/assign-driver/current", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("driver_assignments")
      .select("*")
      .eq("is_current", true)
      .order("assigned_from", { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error("Current assignments fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================
   ASSIGN DRIVER TO VEHICLE
   URL → POST /api/assign-driver
===================================================== */
router.post("/assign-driver", async (req, res) => {
  try {
    const {
      driver_name,
      phone_number,
      license_number,
      license_valid_upto,
      vehicle_id,
      vehicle_number,
      assigned_from,
      change_reason,
      changed_by,
    } = req.body;

    console.log("Assign driver request:", {
      driver_name,
      phone_number,
      license_number,
      license_valid_upto,
      vehicle_id,
      vehicle_number,
      assigned_from,
      change_reason,
      changed_by,
    });

    if (!driver_name || !vehicle_id || !vehicle_number) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Validate vehicle_id is a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(vehicle_id)) {
      return res.status(400).json({ error: "Invalid vehicle_id format" });
    }

    // First, end any current assignment for this vehicle
    const endResult = await supabase
      .from("driver_assignments")
      .update({
        is_current: false,
        assigned_to: new Date().toISOString(),
        change_reason: change_reason || "New assignment",
        changed_by,
      })
      .eq("vehicle_id", vehicle_id)
      .eq("is_current", true);

    console.log("End current assignment result:", endResult);

    if (endResult.error) {
      console.error("Error ending current assignment:", endResult.error);
      // Continue anyway, as this might be the first assignment
    }

    // Create new assignment
    const assignmentData = {
      driver_name,
      phone_number,
      license_number,
      vehicle_id,
      vehicle_number,
      assigned_from: assigned_from || new Date().toISOString(),
      is_current: true,
      driver_status: "ACTIVE",
      change_reason,
      changed_by,
    };

    // Handle license_valid_upto if provided
    if (license_valid_upto) {
      assignmentData.license_valid_upto = license_valid_upto;
    }

    console.log("Inserting assignment data:", assignmentData);

    const { data, error } = await supabase
      .from("driver_assignments")
      .insert([assignmentData])
      .select()
      .single();

    console.log("Insert result:", { data, error });

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error("Driver assignment error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================
   END DRIVER ASSIGNMENT
   URL → PUT /api/assign-driver/end/:assignment_id
===================================================== */
router.put("/assign-driver/end/:assignment_id", async (req, res) => {
  try {
    const { assignment_id } = req.params;
    const { change_reason, changed_by } = req.body;

    const { data, error } = await supabase
      .from("driver_assignments")
      .update({
        is_current: false,
        assigned_to: new Date().toISOString(),
        change_reason,
        changed_by,
      })
      .eq("assignment_id", assignment_id)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error("End assignment error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================
   DRIVER HISTORY FOR VEHICLE
   URL → GET /api/assign-driver/history/:vehicle_id
===================================================== */
router.get("/assign-driver/history/:vehicle_id", async (req, res) => {
  try {
    const { vehicle_id } = req.params;
    const { data, error } = await supabase
      .from("driver_assignments")
      .select("*")
      .eq("vehicle_id", vehicle_id)
      .order("assigned_from", { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error("Driver history fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================
   UPDATE DRIVER DETAILS
   URL → PUT /api/assign-driver/:assignment_id
===================================================== */
router.put("/assign-driver/:assignment_id", async (req, res) => {
  try {
    const { assignment_id } = req.params;
    const {
      driver_name,
      phone_number,
      license_number,
      license_valid_upto,
      driver_status,
      change_reason,
      changed_by,
    } = req.body;

    const { data, error } = await supabase
      .from("driver_assignments")
      .update({
        driver_name,
        phone_number,
        license_number,
        license_valid_upto,
        driver_status,
        change_reason,
        changed_by,
      })
      .eq("assignment_id", assignment_id)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error("Driver update error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;