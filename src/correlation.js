import express from 'express';
import { supabase } from './config/supabase.js';

const router = express.Router();

/*
  POST /api/correlation/run
  Payload (optional): { vehicle_id, start_date, end_date }
  Runs correlation logic and creates entries in risk_assessments
*/
router.post('/correlation/run', async (req, res) => {
  try {
    const { vehicle_id, start_date, end_date } = req.body || {};

    // build vehicle list
    let vehicles = [];
    if (vehicle_id) {
      vehicles = [{ vehicle_id }];
    } else {
      const { data } = await supabase.from('vehicles').select('vehicle_id');
      vehicles = data || [];
    }

    const results = [];

    for (const v of vehicles) {
      const vId = v.vehicle_id;

      // latest fuel analysis
      const { data: fa } = await supabase
        .from('fuel_analysis')
        .select('*')
        .eq('vehicle_id', vId)
        .order('analysis_date', { ascending: false })
        .limit(1);

      const analysis = fa && fa.length ? fa[0] : null;

      const expected = analysis?.expected_mileage || null;
      const actual = analysis?.actual_mileage || null;

      const low_mileage = expected && actual ? (actual < expected * 0.7) : false;

      // idle risk: count zero-speed gps logs in last 24h
      const now = new Date();
      const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const { data: idleLogs } = await supabase
        .from('gps_logs')
        .select('gps_log_id')
        .eq('vehicle_id', vId)
        .lte('recorded_at', now.toISOString())
        .gte('recorded_at', since)
        .eq('speed', 0)
        .limit(10000);

      const idle_count = idleLogs ? idleLogs.length : 0;
      const idle_risk = idle_count > 60; // threshold

      // sla risk: late/missed arrivals in last 7 days
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: slaLogs } = await supabase
        .from('arrival_logs')
        .select('arrival_log_id')
        .eq('vehicle_id', vId)
        .gte('created_at', weekAgo)
        .in('status', ['LATE', 'MISSED'])
        .limit(10000);

      const sla_count = slaLogs ? slaLogs.length : 0;
      const sla_risk = sla_count > 0;

      // compute score
      let score = 0;
      if (low_mileage) score += 3;
      if (idle_risk) score += 2;
      if (sla_risk) score += 3;

      let level = 'LOW';
      if (score >= 6) level = 'HIGH';
      else if (score >= 3) level = 'MEDIUM';

      // insert risk_assessments
      await supabase.from('risk_assessments').insert([{
        vehicle_id: vId,
        route_id: null,
        assessment_date: new Date().toISOString().slice(0,10),
        fuel_risk: low_mileage,
        sla_risk: sla_risk,
        idle_risk: idle_risk,
        risk_score: score,
        risk_level: level,
      }]);

      results.push({ vehicle_id: vId, low_mileage, idle_risk, sla_risk, score, level });
    }

    res.json({ success: true, results });
  } catch (err) {
    console.error('Correlation run error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
