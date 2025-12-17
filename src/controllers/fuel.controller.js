import { supabase } from '../config/supabase.js';
import { calculateMileage } from '../logic/mileage.logic.js';
import { analyzeFuelTheft } from '../logic/fuelTheft.logic.js';

export async function runDailyFuelAnalysis(req, res) {
  const { vehicle_id, route_id, date } = req.body;

  try {
    // 1️⃣ Total fuel filled that day
    const { data: fuelEntries } = await supabase
      .from('fuel_entries')
      .select('fuel_quantity')
      .eq('vehicle_id', vehicle_id)
      .eq('fuel_date', date);

    const totalFuel = fuelEntries.reduce(
      (sum, f) => sum + Number(f.fuel_quantity),
      0
    );

    // 2️⃣ Distance covered that day
    const { data: distanceLog } = await supabase
      .from('distance_logs')
      .select('distance_km')
      .eq('vehicle_id', vehicle_id)
      .eq('log_date', date)
      .single();

    const distanceKm = distanceLog?.distance_km || 0;

    // 3️⃣ Route expected mileage
    const { data: route } = await supabase
      .from('routes')
      .select('expected_mileage')
      .eq('route_id', route_id)
      .single();

    const expectedMileage = route.expected_mileage;

    // 4️⃣ Calculate actual mileage
    const actualMileage = calculateMileage(distanceKm, totalFuel);

    // 5️⃣ Theft analysis
    const { theftFlag, variance } = analyzeFuelTheft({
      routeExpectedMileage: expectedMileage,
      actualMileage
    });

    // 6️⃣ Save analysis
    await supabase.from('fuel_analysis').insert({
      vehicle_id,
      fuel_given: totalFuel,
      distance_covered: distanceKm,
      expected_mileage: expectedMileage,
      actual_mileage: actualMileage,
      fuel_variance: variance,
      theft_flag: theftFlag,
      analysis_date: date
    });

    res.json({
      success: true,
      actualMileage,
      theftFlag
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
