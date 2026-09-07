// Operational work should remain visible before completed history. Cancelled
// orders are retained for auditability, but always appear last in an unfiltered
// order list so they do not interrupt the current day's work queue.
export function getOrderListRank(status) {
  if (status === "cancelled") return 2;
  if (status === "released") return 1;
  return 0;
}

export function compareOrdersForList(a, b) {
  const rankDifference = getOrderListRank(a?.status) - getOrderListRank(b?.status);
  if (rankDifference !== 0) return rankDifference;

  const priorityDifference = Number(a?.priority_order ?? 0) - Number(b?.priority_order ?? 0);
  if (priorityDifference !== 0) return priorityDifference;

  // Preserve first-come, first-served handling within the same priority group.
  return new Date(a?.created_at || 0).getTime() - new Date(b?.created_at || 0).getTime();
}
