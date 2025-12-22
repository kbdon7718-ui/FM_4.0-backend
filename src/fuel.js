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
   URL → GET /api/vehicles
===================================================== */
router.get("/vehicles", async (req, res) => {
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
   FUEL ENTRY (SUPERVISOR)
   URL → POST /api/fuel
   ✅ ODOMETER ADDED
===================================================== */
router.post("/fuel", async (req, res) => {
  try {
    const {
      vehicle_id,
      fuel_date,
      fuel_quantity,
      odometer_reading, // ✅ NEW
      fuel_station,
      entered_by,
    } = req.body;

    if (!vehicle_id || !fuel_quantity || !fuel_date) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const { data, error } = await supabase
      .from("fuel_entries")
      .insert([
        {
          vehicle_id,
          fuel_date,
          fuel_quantity,
          odometer_reading, // ✅ STORED
          fuel_station,
          entered_by,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error("Fuel entry error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================
   RECENT FUEL ENTRIES
   URL → GET /api/fuel/recent
===================================================== */
router.get("/fuel/recent", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("fuel_entries")
      .select(`
        fuel_entry_id,
        fuel_date,
        fuel_quantity,
        odometer_reading,
        vehicles(vehicle_number)
      `)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error("Recent fuel error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================
   FUEL ANALYSIS (OWNER)
   URL → GET /api/analysis
===================================================== */
router.get("/analysis", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("fuel_analysis")
      .select(`
        analysis_id,
        fuel_given,
        distance_covered,
        expected_mileage,
        actual_mileage,
        fuel_variance,
        theft_flag,
        analysis_date,
        vehicles(vehicle_number)
      `)
      .order("analysis_date", { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error("Fuel analysis error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
