import { differenceInDays, format } from "date-fns";
import {
  AlertTriangle,
  Edit2,
  Package,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TrendingDown,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { useRealtime } from "../lib/useRealtime";

const BRANCHES = [
  "Main - Brgy 7",
  "2nd Branch - Brgy Calzada",
  "3rd Branch - Nasugbu",
];
export default function Inventory() {
  const { role, branch } = useAuth();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [usageLogs, setUsageLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showRestock, setShowRestock] = useState(null);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState(
    role === "staff" ? branch : "all",
  );
  const [restockQty, setRestockQty] = useState("");
  const [restockCost, setRestockCost] = useState("");
  const [restockSupplier, setRestockSupplier] = useState("");

  const [form, setForm] = useState({
    name: "",
    category_id: "",
    branch: "Main - Brgy 7",
    unit: "pcs",
    current_stock: "",
    minimum_stock: "",
    cost_per_unit: "",
    usage_per_load: "",
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    const [itemsRes, catRes, usageRes] = await Promise.all([
      supabase
        .from("inventory_items")
        .select("*, inventory_categories(name)")
        .order("name"),
      supabase.from("inventory_categories").select("*").order("name"),
      supabase
        .from("inventory_usage_log")
        .select("*")
        .order("logged_at", { ascending: false })
        .limit(500),
    ]);
    setItems(itemsRes.data || []);
    setCategories(catRes.data || []);
    setUsageLogs(usageRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime: refresh when inventory changes
  useRealtime(
    [
      "inventory_items",
      "inventory_categories",
      "inventory_usage_log",
      "inventory_restocks",
    ],
    loadData,
  );

  // ===== STOCK PREDICTION =====
  function predictDaysLeft(item) {
    const itemLogs = usageLogs.filter((l) => l.item_id === item.id);
    if (itemLogs.length >= 2) {
      const sortedLogs = [...itemLogs].sort(
        (a, b) => new Date(a.logged_at) - new Date(b.logged_at),
      );
      const firstLog = new Date(sortedLogs[0].logged_at);
      const lastLog = new Date(sortedLogs[sortedLogs.length - 1].logged_at);
      const daysDiff = Math.max(differenceInDays(lastLog, firstLog), 1);
      const totalUsed = itemLogs.reduce(
        (sum, l) => sum + Number(l.quantity_used),
        0,
      );
      const dailyUsage = totalUsed / daysDiff;

      if (dailyUsage > 0)
        return Math.floor(Number(item.current_stock) / dailyUsage);
    }

    // Fallback: estimate from usage_per_load and recent order volume
    const usagePerLoad = Number(item.usage_per_load);
    if (usagePerLoad > 0 && Number(item.current_stock) > 0) {
      // Estimate loads per day from all orders in last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      // Use all usage logs (any item) as a proxy for loads processed
      const recentLogs = usageLogs.filter(
        (l) => new Date(l.logged_at) >= thirtyDaysAgo,
      );
      // Count unique order_ids as loads
      const uniqueOrders = new Set(
        recentLogs.map((l) => l.order_id).filter(Boolean),
      );
      const loadsPerDay = Math.max(uniqueOrders.size / 30, 0.5); // assume at least 0.5 loads/day
      const dailyUsage = usagePerLoad * loadsPerDay;
      if (dailyUsage > 0)
        return Math.floor(Number(item.current_stock) / dailyUsage);
    }

    return null;
  }

  function openNew() {
    setEditing(null);
    setForm({
      name: "",
      category_id: "",
      branch: role === "staff" ? branch : "Main - Brgy 7",
      unit: "pcs",
      current_stock: "",
      minimum_stock: "",
      cost_per_unit: "",
      usage_per_load: "",
    });
    setShowModal(true);
  }

  function openEdit(item) {
    setEditing(item);
    setForm({
      name: item.name,
      category_id: item.category_id || "",
      branch: item.branch || "Main - Brgy 7",
      unit: item.unit,
      current_stock: item.current_stock,
      minimum_stock: item.minimum_stock,
      cost_per_unit: item.cost_per_unit,
      usage_per_load: item.usage_per_load,
    });
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const payload = {
      ...form,
      current_stock: parseFloat(form.current_stock) || 0,
      minimum_stock: parseFloat(form.minimum_stock) || 0,
      cost_per_unit: parseFloat(form.cost_per_unit) || 0,
      usage_per_load: parseFloat(form.usage_per_load) || 0,
      category_id: form.category_id || null,
    };

    let error;
    if (editing) {
      ({ error } = await supabase
        .from("inventory_items")
        .update(payload)
        .eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("inventory_items").insert(payload));

      // Auto-create expense for initial stock cost
      const stock = parseFloat(form.current_stock) || 0;
      const costPerUnit = parseFloat(form.cost_per_unit) || 0;
      if (!error && stock > 0 && costPerUnit > 0) {
        await supabase.from("expenses").insert({
          category: "inventory",
          description: `New item: ${form.name} (${stock} ${form.unit} × ₱${costPerUnit})`,
          amount: stock * costPerUnit,
          expense_date: format(new Date(), "yyyy-MM-dd"),
        });
      }
    }
    if (error) return toast.error(error.message);
    toast.success(editing ? "Item updated!" : "Item added!");
    setShowModal(false);
    loadData();
  }

  async function handleRestock(e) {
    e.preventDefault();
    const qty = parseFloat(restockQty);
    if (!qty || qty <= 0) return toast.error("Enter a valid quantity");

    const newStock = Number(showRestock.current_stock) + qty;
    const [updateRes, insertRes] = await Promise.all([
      supabase
        .from("inventory_items")
        .update({ current_stock: newStock })
        .eq("id", showRestock.id),
      supabase.from("inventory_restocks").insert({
        item_id: showRestock.id,
        quantity_added: qty,
        cost_total: parseFloat(restockCost) || null,
        supplier: restockSupplier || null,
      }),
    ]);

    if (updateRes.error) return toast.error(updateRes.error.message);

    // Auto-create expense record for restock cost
    const cost = parseFloat(restockCost);
    if (cost > 0) {
      await supabase.from("expenses").insert({
        category: "inventory",
        description: `Restock: ${showRestock.name} (${qty} ${showRestock.unit})`,
        amount: cost,
        expense_date: format(new Date(), "yyyy-MM-dd"),
      });
    }

    toast.success("Stock restocked!");
    setShowRestock(null);
    setRestockQty("");
    setRestockCost("");
    setRestockSupplier("");
    loadData();
  }

  async function deleteItem(id) {
    if (!confirm("Delete this item?")) return;
    const { error } = await supabase
      .from("inventory_items")
      .delete()
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Item deleted");
    loadData();
  }

  const filtered = items.filter((i) => {
    // SEARCH FILTER
    const matchesSearch =
      !search || i.name.toLowerCase().includes(search.toLowerCase());

    // BRANCH FILTER
    const matchesBranch =
      role === "staff"
        ? i.branch === branch
        : branchFilter === "all" || i.branch === branchFilter;

    return matchesSearch && matchesBranch;
  });

  if (loading)
    return (
      <div className="loading-spinner">
        <div className="spinner" />
      </div>
    );

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {/* SEARCH */}
          <div className="search-box">
            <Search />

            <input
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* ADMIN ONLY BRANCH FILTER */}
          {role === "admin" && (
            <select
              className="form-control"
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              style={{
                width: 240,
              }}
            >
              <option value="all">All Branches</option>

              {BRANCHES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          )}
        </div>

        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={18} />
          Add Item
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th>Branch</th>
                <th>Stock</th>
                <th>Min Level</th>
                <th>Status</th>
                <th>Forecast</th>
                <th>Cost/Unit</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="empty-state">
                    <p>No items found</p>
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const isLow =
                    Number(item.current_stock) <= Number(item.minimum_stock);
                  const pct =
                    Number(item.minimum_stock) > 0
                      ? Math.min(
                          (Number(item.current_stock) /
                            (Number(item.minimum_stock) * 3)) *
                            100,
                          100,
                        )
                      : 100;
                  const daysLeft = predictDaysLeft(item);
                  let forecastColor = "var(--success)";
                  if (daysLeft !== null) {
                    if (daysLeft <= 3) forecastColor = "var(--danger)";
                    else if (daysLeft <= 7) forecastColor = "var(--warning)";
                  }
                  return (
                    <tr key={item.id}>
                      <td
                        style={{
                          fontWeight: 600,
                          color: "var(--text-primary)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <Package
                            size={16}
                            style={{ color: "var(--text-muted)" }}
                          />
                          {item.name}
                        </div>
                      </td>
                      <td>{item.inventory_categories?.name || "—"}</td>

                      <td>
                        <span className="badge badge-ok">
                          {item.branch || "—"}
                        </span>
                      </td>

                      <td>
                        <div>
                          <span
                            style={{
                              fontWeight: 600,
                              color: "var(--text-primary)",
                            }}
                          >
                            {item.current_stock}
                          </span>
                          <span style={{ color: "var(--text-muted)" }}>
                            {" "}
                            {item.unit}
                          </span>
                        </div>
                        <div
                          className="progress-bar-container"
                          style={{ marginTop: 4, width: 80 }}
                        >
                          <div
                            className="progress-bar-fill"
                            style={{
                              width: `${pct}%`,
                              background: isLow
                                ? "var(--danger)"
                                : pct < 40
                                  ? "var(--warning)"
                                  : "var(--success)",
                            }}
                          />
                        </div>
                      </td>
                      <td>
                        {item.minimum_stock} {item.unit}
                      </td>
                      <td>
                        {isLow ? (
                          <span className="badge badge-low">
                            <AlertTriangle
                              size={12}
                              style={{ marginRight: 4 }}
                            />{" "}
                            Low
                          </span>
                        ) : (
                          <span className="badge badge-ok">OK</span>
                        )}
                      </td>
                      <td>
                        {daysLeft !== null ? (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <TrendingDown
                              size={14}
                              style={{ color: forecastColor }}
                            />
                            <span
                              style={{
                                fontWeight: 600,
                                color: forecastColor,
                                fontSize: 13,
                              }}
                            >
                              {daysLeft}d
                            </span>
                            <span
                              style={{
                                color: "var(--text-muted)",
                                fontSize: 12,
                              }}
                            >
                              left
                            </span>
                          </div>
                        ) : (
                          <span
                            style={{ color: "var(--text-muted)", fontSize: 12 }}
                          >
                            No data
                          </span>
                        )}
                      </td>
                      <td>₱{Number(item.cost_per_unit).toLocaleString()}</td>
                      <td>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            className="btn-icon"
                            title="Restock"
                            onClick={() => {
                              setShowRestock(item);
                              setRestockQty("");
                              setRestockCost("");
                              setRestockSupplier("");
                            }}
                          >
                            <RefreshCw size={16} />
                          </button>
                          <button
                            className="btn-icon"
                            onClick={() => openEdit(item)}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            className="btn-icon"
                            onClick={() => deleteItem(item.id)}
                            style={{ color: "var(--danger)" }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Item Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editing ? "Edit Item" : "Add Item"}</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Item Name *</label>
                    <input
                      className="form-control"
                      placeholder="e.g. Ariel Powder"
                      value={form.name}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, name: e.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Category</label>
                    <select
                      className="form-control"
                      value={form.category_id}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, category_id: e.target.value }))
                      }
                    >
                      <option value="">No Category</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  {/* BRANCH */}
                  {/* ADMIN ONLY BRANCH ASSIGNMENT */}
                  {role === "admin" && (
                    <div className="form-group">
                      <label>Assigned Branch *</label>

                      <select
                        className="form-control"
                        value={form.branch}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            branch: e.target.value,
                          }))
                        }
                      >
                        {BRANCHES.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* UNIT */}
                  <div className="form-group">
                    <label>Unit</label>

                    <select
                      className="form-control"
                      value={form.unit}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          unit: e.target.value,
                        }))
                      }
                    >
                      <option value="pcs">Pieces</option>
                      <option value="kg">Kilograms</option>
                      <option value="L">Liters</option>
                      <option value="mL">Milliliters</option>
                      <option value="g">Grams</option>
                      <option value="packs">Packs</option>
                      <option value="bottles">Bottles</option>
                      <option value="sachets">Sachets</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Current Stock *</label>
                    <input
                      className="form-control"
                      type="number"
                      step="0.01"
                      placeholder="0"
                      value={form.current_stock}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          current_stock: e.target.value,
                        }))
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Minimum Stock Level</label>
                    <input
                      className="form-control"
                      type="number"
                      step="0.01"
                      placeholder="0"
                      value={form.minimum_stock}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          minimum_stock: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Usage per Load (for predictions)</label>
                  <input
                    className="form-control"
                    type="number"
                    step="0.0001"
                    placeholder="Amount used per laundry load"
                    value={form.usage_per_load}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, usage_per_load: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editing ? "Update" : "Add Item"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Restock Modal */}
      {showRestock && (
        <div className="modal-overlay" onClick={() => setShowRestock(null)}>
          <div
            className="modal"
            style={{ maxWidth: 400 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>Restock: {showRestock.name}</h3>
              <button className="btn-icon" onClick={() => setShowRestock(null)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleRestock}>
              <div className="modal-body">
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--text-muted)",
                    marginBottom: 16,
                  }}
                >
                  Current stock:{" "}
                  <strong style={{ color: "var(--text-primary)" }}>
                    {showRestock.current_stock} {showRestock.unit}
                  </strong>
                </p>
                <div className="form-group">
                  <label>Quantity to Add *</label>
                  <input
                    className="form-control"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0"
                    value={restockQty}
                    onChange={(e) => setRestockQty(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Total Cost (₱)</label>
                  <input
                    className="form-control"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={restockCost}
                    onChange={(e) => setRestockCost(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Supplier</label>
                  <input
                    className="form-control"
                    placeholder="Supplier name"
                    value={restockSupplier}
                    onChange={(e) => setRestockSupplier(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowRestock(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-success">
                  <RefreshCw size={16} /> Restock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
