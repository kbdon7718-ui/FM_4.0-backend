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

    // AFTER INSERT: compute fuel analysis if previous odometer exists
    try {
      // fetch previous fuel entry for this vehicle (excluding current)
      const { data: prevEntries, error: prevErr } = await supabase
        .from('fuel_entries')
        .select('fuel_entry_id, fuel_date, odometer_reading, fuel_quantity')
        .eq('vehicle_id', vehicle_id)
        .lt('fuel_date', fuel_date)
        .order('fuel_date', { ascending: false })
        .limit(1);

      if (prevErr) throw prevErr;

      if (prevEntries && prevEntries.length > 0 && prevEntries[0].odometer_reading != null && odometer_reading != null) {
        const prev = prevEntries[0];
        const distance_covered = Number(odometer_reading) - Number(prev.odometer_reading);

        if (distance_covered > 0) {
          // fetch vehicle expected mileage
          const { data: vehicleData } = await supabase
            .from('vehicles')
            .select('vehicle_id, expected_mileage')
            .eq('vehicle_id', vehicle_id)
            .single();

          const expected_mileage = vehicleData?.expected_mileage || null;

          const actual_mileage = Number(distance_covered) / Number(fuel_quantity || 1);
          const fuel_variance = expected_mileage ? (expected_mileage - actual_mileage) : null;

          const theft_flag = expected_mileage ? (actual_mileage < (expected_mileage * 0.5)) : false;

          await supabase.from('fuel_analysis').insert([{
            vehicle_id,
            fuel_given: fuel_quantity,
            distance_covered: distance_covered,
            expected_mileage: expected_mileage,
            actual_mileage: actual_mileage,
            fuel_variance: fuel_variance,
            theft_flag: theft_flag,
            analysis_date: fuel_date,
          }]);
        }
      }
    } catch (analysisErr) {
      console.error('Fuel analysis compute error:', analysisErr);
    }

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
