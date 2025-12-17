import { supabase } from '../config/supabase.js';
import { assessRisk } from '../logic/correlation.logic.js';

export async function runCorrelation(req, res) {
  const { vehicle_id, route_id, date } = req.body;

  try {
    // 1️⃣ Fuel analysis
    const { data: fuel } = await supabase
      .from('fuel_analysis')
      .select('theft_flag')
      .eq('vehicle_id', vehicle_id)
      .eq('analysis_date', date)
      .single();

    // 2️⃣ SLA log
    const { data: sla } = await supabase
      .from('geofence_logs')
      .select('delay_minutes')
      .eq('vehicle_id', vehicle_id)
      .order('arrival_time', { ascending: false })
      .limit(1)
      .single();

    // 3️⃣ Idle calculation (simple check)
    const { data: idleLogs } = await supabase
      .from('gps_logs')
      .select('speed, ignition, recorded_at')
      .eq('vehicle_id', vehicle_id)
      .eq('ignition', true)
      .eq('speed', 0);

    const excessiveIdle = idleLogs.length > 50; // configurable

    // 4️⃣ Correlation
    const { riskScore, riskLevel } = assessRisk({
      fuelTheft: fuel?.theft_flag,
      lateArrival: sla?.delay_minutes > 10,
      excessiveIdle
    });

    // 5️⃣ Save result
    await supabase.from('risk_assessments').insert({
      vehicle_id,
      route_id,
      assessment_date: date,
      fuel_risk: fuel?.theft_flag || false,
      sla_risk: sla?.delay_minutes > 10,
      idle_risk: excessiveIdle,
      risk_score: riskScore,
      risk_level: riskLevel
    });

    res.json({ success: true, riskLevel });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
