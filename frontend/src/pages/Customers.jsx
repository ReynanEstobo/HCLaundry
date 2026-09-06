import { format } from "date-fns";
import { Edit2, Phone, Plus, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabase";
import { useRealtime } from "../lib/useRealtime";
import { useAuth } from "../context/AuthContext";
import { getVisibleCustomers, registerBranchCustomer } from "../services/api/operationsApi";
import { PageError, PageLoader } from "../components/AsyncState";
import ConfirmDialog from "../components/ConfirmDialog";

const BRANCHES = [
  "Main - Brgy 7",
  "2nd Branch - Brgy Calzada",
  "3rd Branch - Nasugbu",
];

export default function Customers() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [customers, setCustomers] = useState([]);
  const [allCustomers, setAllCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    notes: "",
    branch: "Main - Brgy 7",
  });
  // 🔥 PAGINATION STATES
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;
  const [totalCount, setTotalCount] = useState(0);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    try {
      // Admin receives the master client directory. Staff receive only clients
      // associated with their branch through customer_branches.
      const { data: allData = [] } = await getVisibleCustomers();
      const sorted = [...allData].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setCustomers(sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));
      setAllCustomers(sorted);
      setTotalCount(sorted.length);
    } catch (error) {
      setLoadError(error.message || "Unable to load client records.");
      setCustomers([]);
      setAllCustomers([]);
      setTotalCount(0);
    }

    setLoading(false);
  }, [page]);

  // 🔥 RESET PAGE WHEN SEARCH CHANGES
  // 🔥 LOAD DATA ON START + PAGE CHANGE
  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  // Realtime: refresh when customers change
  useRealtime(["customers"], loadCustomers);

  function openNew() {
    setEditing(null);
    setForm({
      name: "",
      phone: "",
      email: "",
      notes: "",
      branch: "Main - Brgy 7",
    });
    setShowModal(true);
  }

  function openEdit(cust) {
    setEditing(cust);
    setForm({
      name: cust.name,
      phone: cust.phone,
      email: cust.email || "",
      notes: cust.notes || "",
      branch: cust.branch || "",
    });
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim())
      return toast.error("Name and phone are required");
    if (isAdmin && !form.branch)
      return toast.error("Please assign this customer to a branch");

    let error;
    if (editing) {
      ({ error } = await supabase
        .from("customers")
        .update(form)
        .eq("id", editing.id));
    } else {
      try {
        await registerBranchCustomer({
          ...form,
          ...(isAdmin ? { branch: form.branch } : {}),
        });
      } catch (registerError) {
        error = { message: registerError.message };
      }
    }
    if (error) return toast.error(error.message);
    toast.success(editing ? "Customer updated!" : "Customer added!");
    setShowModal(false);
    loadCustomers();
  }

  async function deleteCustomer() {
    if (!customerToDelete || deleting) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("customers").delete().eq("id", customerToDelete.id);
      if (error) throw error;
      toast.success("Customer moved to Recycle Bin");
      setCustomerToDelete(null);
      loadCustomers();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setDeleting(false);
    }
  }

  // 🔥 SAME LOGIC AS ORDERS
  const source = search ? allCustomers : customers;

  const filtered = source.filter((c) => {
    if (!search) return true;

    const q = search.toLowerCase();

    return (
      c.name?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      (c.email || "").toLowerCase().includes(q)
    );
  });

  if (loading) return <PageLoader label="Loading clients…" />;
  if (loadError) return <PageError message={loadError} onRetry={loadCustomers} />;

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
        <div className="search-box">
          <Search />
          <input
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={18} /> Add Customer
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                {isAdmin && <th>Branch</th>}
                <th>Added</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="empty-state">
                    <p>No customers found</p>
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id}>
                    <td
                      style={{ fontWeight: 600, color: "var(--text-primary)" }}
                    >
                      {c.name}
                    </td>
                    <td>
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Phone size={14} /> {c.phone}
                      </span>
                    </td>
                    <td>{c.email || "—"}</td>
                    {isAdmin && <td>{c.branch || "Unassigned"}</td>}
                    <td style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      {format(new Date(c.created_at), "MMM d, yyyy")}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          className="btn-icon"
                          onClick={() => openEdit(c)}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          className="btn-icon"
                          onClick={() => setCustomerToDelete(c)}
                          style={{ color: "var(--danger)" }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {!search && (
        <div style={{ marginTop: 14, textAlign: "center" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: 6,
              marginBottom: 8,
            }}
          >
            {/* FIRST */}
            <button
              className="btn btn-sm"
              disabled={page === 0}
              onClick={() => setPage(0)}
            >
              «
            </button>

            {/* PREVIOUS */}
            <button
              className="btn btn-sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(p - 1, 0))}
            >
              ‹
            </button>

            {/* PAGE NUMBERS */}
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                style={{
                  minWidth: 36,
                  height: 36,
                  borderRadius: 8,
                  background: i === page ? "#1e293b" : "transparent",
                  color: i === page ? "#fff" : "#94a3b8",
                  fontWeight: 600,
                }}
              >
                {i + 1}
              </button>
            ))}

            {/* NEXT */}
            <button
              className="btn btn-sm"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              ›
            </button>

            {/* LAST */}
            <button
              className="btn btn-sm"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage(totalPages - 1)}
            >
              »
            </button>
          </div>

          {/* RANGE TEXT */}
          <div style={{ fontSize: 13, color: "#94a3b8" }}>
            {totalCount === 0
              ? "0 of 0"
              : `${page * PAGE_SIZE + 1}–${Math.min(
                  (page + 1) * PAGE_SIZE,
                  totalCount,
                )} out of ${totalCount}`}
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editing ? "Edit Customer" : "Add Customer"}</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Full Name *</label>
                    <input
                      className="form-control"
                      placeholder="Juan Dela Cruz"
                      value={form.name}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, name: e.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Phone Number *</label>
                    <input
                      className="form-control"
                      placeholder="09171234567"
                      value={form.phone}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, phone: e.target.value }))
                      }
                      required
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    className="form-control"
                    type="email"
                    placeholder="email@example.com"
                    value={form.email}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, email: e.target.value }))
                    }
                  />
                </div>
                {isAdmin && (
                  <div className="form-group">
                    <label>Branch *</label>
                    <select
                      className="form-control"
                      value={form.branch}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, branch: e.target.value }))
                      }
                      required
                    >
                      <option value="">Select branch</option>
                      {BRANCHES.map((branch) => (
                        <option key={branch} value={branch}>
                          {branch}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    className="form-control"
                    placeholder="Notes about this customer..."
                    value={form.notes}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, notes: e.target.value }))
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
                  {editing ? "Update" : "Add Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(customerToDelete)}
        title="Move customer to Recycle Bin?"
        message={<> <strong>{customerToDelete?.name}</strong> will be hidden from active client lists. An administrator can restore the client later from the Recycle Bin.</>}
        confirmLabel="Move to Recycle Bin"
        cancelLabel="Keep Customer"
        loading={deleting}
        onConfirm={deleteCustomer}
        onClose={() => setCustomerToDelete(null)}
      />
    </>
  );
}
