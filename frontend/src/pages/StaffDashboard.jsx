import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useRealtime } from '../lib/useRealtime'
import {
  Clock, AlertTriangle, ShoppingBag, CheckCircle2, Timer, User, RefreshCw, Package
} from 'lucide-react'

const STATUS_FLOW = ['washing', 'drying', 'folding', 'ready']
const STATUS_LABELS = {
  washing: 'Wash',
  drying: 'Dry',
  folding: 'Fold',
  ready: 'Ready',
}
const STATUS_ICONS = {
  washing: '🧺',
  drying: '☀️',
  folding: '👕',
  ready: '✅',
}

export default function StaffDashboard() {
  const [orders, setOrders] = useState([])
  const [inventory, setInventory] = useState([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [ordersRes, inventoryRes] = await Promise.all([
      supabase.from('orders').select('*, customers(name, phone), service_types(name)')
        .not('status', 'in', '("released","cancelled")')
        .order('created_at', { ascending: false }),
      supabase.from('inventory_items').select('*, inventory_categories(name)')
    ])
    setOrders(ordersRes.data || [])
    setInventory(inventoryRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Realtime: refresh when orders or inventory change
  useRealtime(['orders', 'inventory_items'], loadData)

  function getTimeRemaining(estimatedCompletion) {
    if (!estimatedCompletion) return null
    const now = new Date()
    const est = new Date(estimatedCompletion)
    const diffMs = est - now
    if (diffMs <= 0) return 'Ready!'
    const mins = Math.floor(diffMs / 60000)
    const hrs = Math.floor(mins / 60)
    const remainMins = mins % 60
    if (hrs > 0) return `${hrs}h ${remainMins}m`
    return `${remainMins}m`
  }

  const activeCount = orders.length
  const readyCount = orders.filter(o => o.status === 'ready').length
  const inProgressCount = activeCount - readyCount

  // Low stock
  const lowStockItems = inventory.filter(i => Number(i.current_stock) <= Number(i.minimum_stock))

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>

  return (
    <>
      {/* Stats Row */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card blue">
          <div className="stat-icon"><ShoppingBag size={22} /></div>
          <div className="stat-value">{activeCount}</div>
          <div className="stat-label">Active Orders</div>
        </div>
        <div className="stat-card amber">
          <div className="stat-icon"><Timer size={22} /></div>
          <div className="stat-value">{inProgressCount}</div>
          <div className="stat-label">In Progress</div>
        </div>
        <div className="stat-card green">
          <div className="stat-icon"><CheckCircle2 size={22} /></div>
          <div className="stat-value">{readyCount}</div>
          <div className="stat-label">Ready for Pickup</div>
        </div>
        <div className="stat-card red">
          <div className="stat-icon"><AlertTriangle size={22} /></div>
          <div className="stat-value">{lowStockItems.length}</div>
          <div className="stat-label">Low Stock Items</div>
        </div>
      </div>

      {/* Inventory Alerts */}
      {lowStockItems.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Package size={18} style={{ color: '#f59e0b' }} />
              Inventory Alerts
            </h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lowStockItems.slice(0, 4).map((item, i) => {
              const isOut = Number(item.current_stock) === 0
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 10,
                  background: isOut ? '#fef2f2' : '#fffbeb',
                  border: `1px solid ${isOut ? '#fecaca' : '#fde68a'}`,
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: '#fff', border: `1px solid ${isOut ? '#fecaca' : '#fde68a'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <AlertTriangle size={16} style={{ color: isOut ? '#dc2626' : '#d97706' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: isOut ? '#991b1b' : '#92400e' }}>{item.name}</span>
                    <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8 }}>
                      {isOut ? 'Out of stock!' : `${item.current_stock} ${item.unit} left`}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Kanban Board — same as admin Garment page */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {STATUS_FLOW.map(s => (
            <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-muted)' }}>
              <span>{STATUS_ICONS[s]}</span> {STATUS_LABELS[s]}
            </span>
          ))}
        </div>
        <button className="btn btn-sm btn-secondary" onClick={loadData} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="kanban-board">
        {STATUS_FLOW.map(status => {
          const columnOrders = orders.filter(o => o.status === status)
          return (
            <div key={status} className="kanban-column" data-stage={status}>
              <div className="kanban-column-header">
                <div className="kanban-column-title">
                  <span className="kanban-column-icon">{STATUS_ICONS[status]}</span>
                  <span>{STATUS_LABELS[status]}</span>
                  <span className="kanban-count">{columnOrders.length}</span>
                </div>
              </div>
              <div className="kanban-cards">
                {columnOrders.length === 0 ? (
                  <div className="kanban-empty">No orders</div>
                ) : columnOrders.map(order => (
                  <div key={order.id} className="kanban-card" style={{ cursor: 'default' }}>
                    <div className="kanban-card-header">
                      <span className="kanban-order-num">{order.order_number}</span>
                      <span className={`badge badge-${order.payment_status}`} style={{ fontSize: 10, padding: '2px 6px' }}>{order.payment_status}</span>
                    </div>
                    <div className="kanban-card-customer">
                      <User size={13} />
                      <span>{order.customers?.name || 'Walk-in'}</span>
                    </div>
                    <div className="kanban-card-details">
                      <span>{order.service_types?.name}</span>
                      <span>{order.weight_kg} kg</span>
                    </div>
                    <div className="kanban-card-footer">
                      <span className="kanban-card-price">₱{Number(order.total_price).toLocaleString()}</span>
                      <span className="kanban-card-time">
                        {status !== 'ready' && (
                          <><Clock size={12} /> {getTimeRemaining(order.estimated_completion) || '—'}</>
                        )}
                        {status === 'ready' && <><CheckCircle2 size={12} /> Ready</>}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
