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
   GET ALL COMPANY ROUTES
   URL → GET /api/company-routes
===================================================== */
router.get("/company-routes", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("company_routes")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error("Get company routes error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================
   GET SINGLE COMPANY ROUTE
   URL → GET /api/company-routes/:route_id
===================================================== */
router.get("/company-routes/:route_id", async (req, res) => {
  try {
    const { route_id } = req.params;

    const { data, error } = await supabase
      .from("company_routes")
      .select("*")
      .eq("route_id", route_id)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error("Get company route error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================
   CREATE COMPANY ROUTE
   URL → POST /api/company-routes
===================================================== */
router.post("/company-routes", async (req, res) => {
  try {
    const {
      company_id,
      route_name,
      stops,
      vehicles,
      start_time,
      end_time,
      created_by,
    } = req.body;

    console.log("Creating company route:", {
      company_id,
      route_name,
      stops,
      vehicles,
      start_time,
      end_time,
      created_by,
    });

    if (!company_id || !route_name || !stops || !vehicles) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Validate stops and vehicles are arrays
    if (!Array.isArray(stops) || !Array.isArray(vehicles)) {
      return res.status(400).json({ error: "Stops and vehicles must be arrays" });
    }

    const { data, error } = await supabase
      .from("company_routes")
      .insert([
        {
          company_id,
          route_name,
          stops,
          vehicles,
          start_time,
          end_time,
          created_by,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    // Log activity
    await supabase.from("route_activity_log").insert([
      {
        route_id: data.route_id,
        activity_type: "ROUTE_CREATED",
        description: `Route "${route_name}" created with ${stops.length} stops and ${vehicles.length} vehicles`,
        changed_by: created_by,
      },
    ]);

    res.json(data);
  } catch (err) {
    console.error("Create company route error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================
   UPDATE COMPANY ROUTE
   URL → PUT /api/company-routes/:route_id
===================================================== */
router.put("/company-routes/:route_id", async (req, res) => {
  try {
    const { route_id } = req.params;
    const {
      route_name,
      stops,
      vehicles,
      start_time,
      end_time,
      is_active,
      changed_by,
    } = req.body;

    console.log("Updating company route:", route_id, {
      route_name,
      stops,
      vehicles,
      start_time,
      end_time,
      is_active,
      changed_by,
    });

    const updateData = {
      route_name,
      stops,
      vehicles,
      start_time,
      end_time,
      is_active,
      updated_at: new Date().toISOString(),
    };

    // Remove undefined fields
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    const { data, error } = await supabase
      .from("company_routes")
      .update(updateData)
      .eq("route_id", route_id)
      .select()
      .single();

    if (error) throw error;

    // Log activity
    await supabase.from("route_activity_log").insert([
      {
        route_id,
        activity_type: "ROUTE_UPDATED",
        description: `Route "${route_name}" updated`,
        changed_by: changed_by,
      },
    ]);

    res.json(data);
  } catch (err) {
    console.error("Update company route error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================
   DELETE COMPANY ROUTE
   URL → DELETE /api/company-routes/:route_id
===================================================== */
router.delete("/company-routes/:route_id", async (req, res) => {
  try {
    const { route_id } = req.params;
    const { changed_by } = req.body;

    const { data, error } = await supabase
      .from("company_routes")
      .delete()
      .eq("route_id", route_id)
      .select()
      .single();

    if (error) throw error;

    // Log activity
    await supabase.from("route_activity_log").insert([
      {
        route_id,
        activity_type: "ROUTE_DELETED",
        description: `Route "${data.route_name}" deleted`,
        changed_by: changed_by,
      },
    ]);

    res.json({ message: "Route deleted successfully" });
  } catch (err) {
    console.error("Delete company route error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================
   GET ROUTE ACTIVITY LOG
   URL → GET /api/company-routes/:route_id/activity
===================================================== */
router.get("/company-routes/:route_id/activity", async (req, res) => {
  try {
    const { route_id } = req.params;

    const { data, error } = await supabase
      .from("route_activity_log")
      .select("*")
      .eq("route_id", route_id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error("Get route activity error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================
   GET VEHICLES FOR ROUTE ASSIGNMENT
   URL → GET /api/company-routes/vehicles
===================================================== */
router.get("/company-routes/vehicles", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("vehicles")
      .select("vehicle_id, vehicle_number")
      .or("status.eq.ACTIVE,status.is.null");

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error("Get vehicles for routes error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================
   GET COMPANIES FOR ROUTE ASSIGNMENT
   URL → GET /api/company-routes/companies
===================================================== */
router.get("/company-routes/companies", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("companies")
      .select("company_id, company_name")
      .eq("is_active", true);

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error("Get companies for routes error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;