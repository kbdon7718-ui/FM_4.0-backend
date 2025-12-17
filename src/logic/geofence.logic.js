export function calculateSLAStatus({
  expectedArrivalTime,
  actualArrivalTime
}) {
  const expected = new Date(expectedArrivalTime);
  const actual = new Date(actualArrivalTime);

  const delayMinutes = Math.max(
    0,
    Math.round((actual - expected) / 60000)
  );

  return {
    status: delayMinutes > 0 ? 'LATE' : 'ON_TIME',
    delayMinutes
  };
}
