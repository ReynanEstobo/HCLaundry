import { apiFetch } from './client'

export async function createBranchOrder(payload) {
  return apiFetch('/api/orders/create', { method: 'POST', body: JSON.stringify(payload) })
}

export async function cancelBranchOrder(orderId, reason) {
  return apiFetch('/api/orders/cancel', { method: 'POST', body: JSON.stringify({ orderId, reason }) })
}

export async function restockBranchInventory(payload) {
  return apiFetch('/api/inventory/restock', { method: 'POST', body: JSON.stringify(payload) })
}

export async function getVisibleCustomers() {
  return apiFetch('/api/customers/visible')
}

export async function lookupCustomerByPhone(phone) {
  return apiFetch(`/api/customers/lookup?phone=${encodeURIComponent(phone)}`)
}

export async function registerBranchCustomer(payload) {
  return apiFetch('/api/customers/register', { method: 'POST', body: JSON.stringify(payload) })
}
