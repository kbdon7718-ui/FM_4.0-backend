export function analyzeFuelTheft({
  routeExpectedMileage,
  actualMileage,
  tolerancePercent = 15
}) {
  const allowedDrop =
    routeExpectedMileage * (tolerancePercent / 100);

  const theft =
    actualMileage < (routeExpectedMileage - allowedDrop);

  return {
    theftFlag: theft,
    variance: Number((routeExpectedMileage - actualMileage).toFixed(2))
  };
}
