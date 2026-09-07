// Queue policy: current-day work first, older unfinished work next, then
// released history, then cancelled history. This prevents an unfinished older
// order from hiding a newly received order for today's operation.
export function getOrderListRank(status) {
  if (status === "cancelled") return 2;
  if (status === "released") return 1;
  return 0;
}

function isToday(value) {
  const date = new Date(value || 0);
  const today = new Date();
  return date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
}

export function compareOrdersForList(a, b) {
  const rankDifference = getOrderListRank(a?.status) - getOrderListRank(b?.status);
  if (rankDifference !== 0) return rankDifference;

  // Only active orders participate in the operational date queue. Completed
  // and cancelled records remain below all active work regardless of date.
  if (getOrderListRank(a?.status) === 0) {
    const todayDifference = Number(isToday(b?.created_at)) - Number(isToday(a?.created_at));
    if (todayDifference !== 0) return todayDifference;
  }

  const priorityDifference = Number(a?.priority_order ?? 0) - Number(b?.priority_order ?? 0);
  if (priorityDifference !== 0) return priorityDifference;

  const createdDifference = new Date(a?.created_at || 0).getTime() - new Date(b?.created_at || 0).getTime();
  // New orders made today should be immediately visible. Older unfinished
  // work remains first-come, first-served once today's queue is cleared.
  return isToday(a?.created_at) ? -createdDifference : createdDifference;
}
