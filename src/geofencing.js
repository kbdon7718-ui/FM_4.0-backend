import express from 'express';
import { supabase } from './config/supabase.js';

const router = express.Router();

/* ============================
   UTILS
============================ */
function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function minutesDiff(a, b) {
  return Math.floor((a.getTime() - b.getTime()) / 60000);
}

/* ============================
   1️⃣ CREATE COMPANY (GEOFENCE)
============================ */
router.post('/api/companies', async (req, res) => {
  try {
    const {
      company_name,
      address,
      center_lat,
      center_lng,
      radius_meters,
    } = req.body;

    if (!company_name || !center_lat || !center_lng || !radius_meters) {
      return res.status(400).json({ message: 'Invalid payload' });
    }

    const { error } = await supabase.from('companies').insert([
      {
        company_name,
        address,
        center: `POINT(${center_lng} ${center_lat})`,
        radius_meters,
      },
    ]);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error('Create company error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ============================
   2️⃣ CREATE SHIFT
============================ */
router.post('/api/company-shifts', async (req, res) => {
  try {
    const {
      company_id,
      shift_name,
      start_time,
      end_time,
    } = req.body;

    if (!company_id || !shift_name || !start_time || !end_time) {
      return res.status(400).json({ message: 'Invalid payload' });
    }

    const { error } = await supabase.from('company_shifts').insert([
      {
        company_id,
        shift_name,
        start_time,
        end_time,
      },
    ]);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error('Create shift error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ============================
   3️⃣ ASSIGN BUS TO SHIFT
============================ */
router.post('/api/shift-schedule', async (req, res) => {
  try {
    const {
      shift_id,
      vehicle_id,
      expected_arrival_time,
      grace_minutes,
    } = req.body;

    if (!shift_id || !vehicle_id || !expected_arrival_time) {
      return res.status(400).json({ message: 'Invalid payload' });
    }

    const { error } = await supabase.from('shift_bus_schedule').insert([
      {
        shift_id,
        vehicle_id,
        expected_arrival_time,
        grace_minutes: grace_minutes || 0,
      },
    ]);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error('Assign bus error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ============================
   4️⃣ LIVE GEOFENCE CHECK (CRON / POLL)
============================ */
router.get('/api/geofence/evaluate', async (req, res) => {
  try {
    const now = new Date();

    /* --- latest GPS --- */
    const { data: vehicles } =
      await supabase.rpc('latest_vehicle_locations');

    /* --- active companies --- */
    const { data: companies } = await supabase
      .from('companies')
      .select('*')
      .eq('is_active', true);

    /* --- active shifts --- */
    const { data: shifts } = await supabase
      .from('company_shifts')
      .select('*')
      .eq('is_active', true);

    /* --- schedules --- */
    const { data: schedules } = await supabase
      .from('shift_bus_schedule')
      .select('*')
      .eq('is_active', true);

    for (const company of companies) {
      const match = company.center
        .toString()
        .match(/POINT\(([-\d.]+) ([-\d.]+)\)/);

      if (!match) continue;

      const geoLng = parseFloat(match[1]);
      const geoLat = parseFloat(match[2]);

      const companyShifts = shifts.filter(
        (s) => s.company_id === company.company_id
      );

      for (const shift of companyShifts) {
        const shiftStart = new Date(`${now.toDateString()} ${shift.start_time}`);
        const shiftEnd = new Date(`${now.toDateString()} ${shift.end_time}`);

        const shiftSchedules = schedules.filter(
          (s) => s.shift_id === shift.shift_id
        );

        for (const sch of shiftSchedules) {
          const v = vehicles.find(
            (x) => x.vehicle_id === sch.vehicle_id
          );
          if (!v) continue;

          // already logged today?
          const { data: exists } = await supabase
            .from('arrival_logs')
            .select('arrival_log_id')
            .eq('vehicle_id', v.vehicle_id)
            .eq('shift_id', shift.shift_id)
            .gte('created_at', new Date().toISOString().slice(0, 10))
            .maybeSingle();

          if (exists) continue;

          const dist = distanceMeters(
            geoLat,
            geoLng,
            v.latitude,
            v.longitude
          );

          if (dist <= company.radius_meters) {
            const actualArrival = new Date(v.recorded_at);
            const scheduled = new Date(
              `${now.toDateString()} ${sch.expected_arrival_time}`
            );

            const delay = minutesDiff(actualArrival, scheduled);
            const status =
              delay <= sch.grace_minutes ? 'ON_TIME' : 'LATE';

            await supabase.from('arrival_logs').insert([
              {
                company_id: company.company_id,
                shift_id: shift.shift_id,
                vehicle_id: v.vehicle_id,
                scheduled_time: sch.expected_arrival_time,
                actual_arrival_time: actualArrival,
                delay_minutes: Math.max(delay, 0),
                status,
              },
            ]);
          }

          /* MISSED */
          if (now > shiftEnd) {
            await supabase.from('arrival_logs').insert([
              {
                company_id: company.company_id,
                shift_id: shift.shift_id,
                vehicle_id: sch.vehicle_id,
                scheduled_time: sch.expected_arrival_time,
                status: 'MISSED',
              },
            ]);
          }
        }
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Geofence evaluate error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ============================
   5️⃣ REPORTS (SUPERVISOR / OWNER)
============================ */
router.get('/api/arrival-logs', async (req, res) => {
  const { data, error } = await supabase
    .from('arrival_logs')
    .select(`
      status,
      delay_minutes,
      actual_arrival_time,
      vehicles ( vehicle_number ),
      companies ( company_name ),
      company_shifts ( shift_name )
    `)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  res.json(data);
});

export default router;
