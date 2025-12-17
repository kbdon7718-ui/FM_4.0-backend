export function calculateMileage(distanceKm, fuelLiters) {
  if (!fuelLiters || fuelLiters <= 0) return 0;
  return Number((distanceKm / fuelLiters).toFixed(2));
}
