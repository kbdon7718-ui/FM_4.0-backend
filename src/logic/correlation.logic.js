export function assessRisk({
  fuelTheft,
  lateArrival,
  excessiveIdle
}) {
  let score = 0;

  if (fuelTheft) score += 2;
  if (lateArrival) score += 1;
  if (excessiveIdle) score += 1;

  let level = 'LOW_RISK';
  if (score >= 3) level = 'HIGH_RISK';
  else if (score === 2) level = 'MEDIUM_RISK';

  return {
    riskScore: score,
    riskLevel: level
  };
}
