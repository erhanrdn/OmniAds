export function dedupeMetricKeys(metrics: string[]) {
  return Array.from(new Set(metrics));
}

export function appendUniqueMetric(metrics: string[], metricKey: string) {
  if (metrics.includes(metricKey)) {
    return metrics;
  }

  return [...metrics, metricKey];
}

export function removeMetric(metrics: string[], metricKey: string) {
  return metrics.filter((entry) => entry !== metricKey);
}

export function replaceMetric(metrics: string[], currentMetricKey: string, nextMetricKey: string) {
  return dedupeMetricKeys(
    metrics.map((entry) => (entry === currentMetricKey ? nextMetricKey : entry))
  );
}

export function moveMetric(metrics: string[], metricKey: string, direction: "left" | "right") {
  const current = [...metrics];
  const index = current.indexOf(metricKey);
  if (index === -1) return metrics;

  const targetIndex = direction === "left" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= current.length) return metrics;

  const [removed] = current.splice(index, 1);
  current.splice(targetIndex, 0, removed);
  return current;
}
