import { apiFetch } from './client'

export const getRecycleBin = () => apiFetch('/api/recycle-bin')
export const restoreDeletedRecord = (table, id) => apiFetch('/api/recycle-bin/restore', {
  method: 'POST', body: JSON.stringify({ table, id }),
})
