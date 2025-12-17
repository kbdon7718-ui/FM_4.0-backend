import { supabase } from '../config/supabase.js';

export async function getOwnerOverview(req, res) {
  try {
    // 1️⃣ Vehicles count
    const { count: vehicleCount } = await supabase
      .from('vehicles')
      .select('*', { count: 'exact', head: true });

    // 2️⃣ Fuel risk summary
    const { data: fuelRisk } = await supabase
      .from('fuel_analysis')
      .select('theft_flag');

    const fuelAlerts = fuelRisk.filter(f => f.theft_flag).length;

    // 3️⃣ SLA summary
    const { data: slaLogs } = await supabase
      .from('geofence_logs')
      .select('status');

    const late = slaLogs.filter(s => s.status === 'LATE').length;
    const onTime = slaLogs.filter(s => s.status === 'ON_TIME').length;
    const missed = slaLogs.filter(s => s.status === 'MISSED').length;

    // 4️⃣ High risk vehicles
    const { data: risks } = await supabase
      .from('risk_assessments')
      .select('risk_level');

    const highRisk = risks.filter(r => r.risk_level === 'HIGH_RISK').length;

    res.json({
      vehicles: vehicleCount,
      fuelAlerts,
      sla: { late, onTime, missed },
      highRisk
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
