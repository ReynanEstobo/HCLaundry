import { format } from "date-fns";
import { Edit2, Eye, EyeOff, Plus, Search, Trash2, X } from "lucide-react";

import { useCallback, useEffect, useState } from "react";

import toast from "react-hot-toast";

import { supabase } from "../lib/supabase";
import { useRealtime } from "../lib/useRealtime";

// ─────────────────────────────────────
// ROLES
// ─────────────────────────────────────
const ROLES = [
  {
    value: "admin",
    label: "Admin",
  },

  {
    value: "staff",
    label: "Staff",
  },
];

// ─────────────────────────────────────
// BRANCHES
// ─────────────────────────────────────
const BRANCHES = [
  {
    value: "Main - Brgy 7",
    label: "Main - Brgy 7",
  },

  {
    value: "2nd Branch - Brgy Calzada",
    label: "2nd Branch - Brgy Calzada",
  },

  {
    value: "3rd Branch - Nasugbu",
    label: "3rd Branch - Nasugbu",
  },
];

export default function Staff() {
  // ─────────────────────────────────────
  // STATES
  // ─────────────────────────────────────
  const [staffList, setStaffList] = useState([]);

  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);

  const [editing, setEditing] = useState(null);

  const [search, setSearch] = useState("");

  const [showPassword, setShowPassword] = useState(false);

  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    role: "staff",
    branch: "Main - Brgy 7",
    position: "",
    password: "",
  });

  // ─────────────────────────────────────
  // LOAD STAFF
  // ─────────────────────────────────────
  const loadStaff = useCallback(async () => {
    setLoading(true);

    const { data } = await supabase
      .from("staff")
      .select("*")
      .order("created_at", {
        ascending: false,
      });

    setStaffList(data || []);

    setLoading(false);
  }, []);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  // ─────────────────────────────────────
  // REALTIME
  // ─────────────────────────────────────
  useRealtime(["staff"], loadStaff);

  // ─────────────────────────────────────
  // OPEN NEW
  // ─────────────────────────────────────
  function openNew() {
    setEditing(null);

    setForm({
      full_name: "",
      phone: "",
      email: "",
      role: "staff",
      branch: "Main - Brgy 7",
      position: "",
      password: "",
    });

    setShowPassword(false);

    setShowModal(true);
  }

  // ─────────────────────────────────────
  // OPEN EDIT
  // ─────────────────────────────────────
  function openEdit(staff) {
    setEditing(staff);

    setForm({
      full_name: staff.full_name,
      phone: staff.phone || "",
      email: staff.email || "",
      role: staff.role || "staff",
      branch: staff.branch || "Main - Brgy 7",
      position: staff.position || "",
      password: "",
    });

    setShowPassword(false);

    setShowModal(true);
  }

  // ─────────────────────────────────────
  // SUBMIT
  // ─────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();

    if (!form.full_name.trim()) {
      return toast.error("Full name is required");
    }

    if (!form.email.trim()) {
      return toast.error("Email is required");
    }

    setSaving(true);

    // ─────────────────────────────────
    // UPDATE STAFF
    // ─────────────────────────────────
    if (editing) {
      const updates = {
        full_name: form.full_name,

        phone: form.phone,

        email: form.email,

        role: form.role,

        branch: form.branch,

        position: form.position,
      };

      const { error } = await supabase
        .from("staff")
        .update(updates)
        .eq("id", editing.id);

      if (error) {
        setSaving(false);

        return toast.error(error.message);
      }

      // PASSWORD UPDATE
      if (form.password && form.password.length >= 6 && editing.auth_id) {
        const { error: pwErr } = await supabase.functions.invoke(
          "update-staff-password",
          {
            body: {
              user_id: editing.auth_id,
              password: form.password,
            },
          },
        );

        if (pwErr) {
          toast.error(
            "Staff updated but password change failed — use Supabase dashboard",
          );
        }
      }

      toast.success("Staff updated!");
    }

    // ─────────────────────────────────
    // CREATE STAFF
    // ─────────────────────────────────
    else {
      if (!form.password || form.password.length < 6) {
        setSaving(false);

        return toast.error("Password must be at least 6 characters");
      }

      // CREATE AUTH USER
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email,

        password: form.password,

        options: {
          data: {
            full_name: form.full_name,

            role: form.role,

            branch: form.branch,
          },
        },
      });

      if (authError) {
        setSaving(false);

        return toast.error(authError.message);
      }

      // INSERT STAFF RECORD
      const { error } = await supabase.from("staff").insert({
        auth_id: authData.user?.id || null,

        full_name: form.full_name,

        phone: form.phone,

        email: form.email,

        role: form.role,

        branch: form.branch,

        position: form.position,
      });

      if (error) {
        setSaving(false);

        return toast.error(error.message);
      }

      toast.success("Staff account created!");
    }

    setSaving(false);

    setShowModal(false);

    loadStaff();
  }

  // ─────────────────────────────────────
  // DELETE STAFF
  // ─────────────────────────────────────
  async function deleteStaff(staff) {
    if (!confirm(`Delete ${staff.full_name}? This cannot be undone.`)) return;

    const { error } = await supabase.from("staff").delete().eq("id", staff.id);

    if (error) {
      return toast.error(error.message);
    }

    toast.success("Staff removed");

    loadStaff();
  }

  // ─────────────────────────────────────
  // FILTER
  // ─────────────────────────────────────
  const filtered = staffList.filter((s) => {
    if (!search) return true;

    const q = search.toLowerCase();

    return (
      s.full_name.toLowerCase().includes(q) ||
      (s.email || "").toLowerCase().includes(q) ||
      (s.phone || "").includes(q) ||
      (s.branch || "").toLowerCase().includes(q)
    );
  });

  // ─────────────────────────────────────
  // LOADING
  // ─────────────────────────────────────
  if (loading) {
    return (
      <div className="loading-spinner">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <>
      {/* HEADER */}
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
        {/* SEARCH */}
        <div className="search-box">
          <Search />

          <input
            placeholder="Search staff..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* ADD BUTTON */}
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={18} />
          Add Staff
        </button>
      </div>

      {/* TABLE */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Position</th>
                <th>Branch</th>
                <th>Role</th>
                <th>Added</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty-state">
                    <p>No staff found</p>
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.id}>
                    {/* NAME */}
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

                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            width: 32,
                            height: 32,

                            borderRadius: "50%",

                            background:
                              s.role === "admin"
                                ? "var(--primary)"
                                : "var(--primary-light)",

                            color: "#fff",

                            display: "flex",

                            alignItems: "center",

                            justifyContent: "center",

                            fontSize: 13,

                            fontWeight: 700,

                            flexShrink: 0,
                          }}
                        >
                          {s.full_name.charAt(0).toUpperCase()}
                        </div>

                        {s.full_name}
                      </div>
                    </td>

                    {/* EMAIL */}
                    <td>{s.email || "—"}</td>

                    {/* PHONE */}
                    <td>{s.phone || "—"}</td>

                    {/* POSITION */}
                    <td>{s.position || "—"}</td>

                    {/* BRANCH */}
                    <td>{s.branch || "—"}</td>

                    {/* ROLE */}
                    <td>
                      <span
                        className={`badge ${
                          s.role === "admin" ? "badge-paid" : "badge-partial"
                        }`}
                        style={{
                          textTransform: "capitalize",
                        }}
                      >
                        {s.role}
                      </span>
                    </td>

                    {/* DATE */}
                    <td
                      style={{
                        fontSize: 13,

                        color: "var(--text-muted)",
                      }}
                    >
                      {s.created_at
                        ? format(new Date(s.created_at), "MMM d, yyyy")
                        : "—"}
                    </td>

                    {/* ACTIONS */}
                    <td>
                      <div
                        style={{
                          display: "flex",

                          gap: 4,
                        }}
                      >
                        {/* EDIT */}
                        <button
                          className="btn-icon"
                          onClick={() => openEdit(s)}
                          title="Edit"
                        >
                          <Edit2 size={16} />
                        </button>

                        {/* DELETE */}
                        <button
                          className="btn-icon"
                          onClick={() => deleteStaff(s)}
                          title="Delete"
                          style={{
                            color: "var(--danger)",
                          }}
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

      {/* MODAL */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {/* HEADER */}
            <div className="modal-header">
              <h3>{editing ? "Edit Staff" : "Add Staff"}</h3>

              <button className="btn-icon" onClick={() => setShowModal(false)}>
                <X size={20} />
              </button>
            </div>

            {/* FORM */}
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {/* ROW */}
                <div className="form-row">
                  {/* FULL NAME */}
                  <div className="form-group">
                    <label>Full Name *</label>

                    <input
                      className="form-control"
                      placeholder="Juan Dela Cruz"
                      value={form.full_name}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,

                          full_name: e.target.value,
                        }))
                      }
                      required
                    />
                  </div>

                  {/* PHONE */}
                  <div className="form-group">
                    <label>Phone Number</label>

                    <input
                      className="form-control"
                      placeholder="09171234567"
                      value={form.phone}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,

                          phone: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                {/* EMAIL */}
                <div className="form-group">
                  <label>
                    Email *{" "}
                    <span
                      style={{
                        fontSize: 11,

                        color: "var(--text-muted)",
                      }}
                    >
                      (used for login)
                    </span>
                  </label>

                  <input
                    className="form-control"
                    type="email"
                    placeholder="staff@iclaundry.com"
                    value={form.email}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,

                        email: e.target.value,
                      }))
                    }
                    required
                    disabled={!!editing}
                  />
                </div>

                {/* POSITION + BRANCH */}
                <div className="form-row">
                  {/* POSITION */}
                  <div className="form-group">
                    <label>Position</label>

                    <input
                      className="form-control"
                      placeholder="e.g. Cashier, Washer"
                      value={form.position}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,

                          position: e.target.value,
                        }))
                      }
                    />
                  </div>

                  {/* BRANCH */}
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
                        <option key={b.value} value={b.value}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* ROLE */}
                <div className="form-group">
                  <label>Role *</label>

                  <select
                    className="form-control"
                    value={form.role}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,

                        role: e.target.value,
                      }))
                    }
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* PASSWORD */}
                <div className="form-group">
                  <label>
                    {editing ? "New Password" : "Password *"}{" "}
                    <span
                      style={{
                        fontSize: 11,

                        color: "var(--text-muted)",
                      }}
                    >
                      {editing
                        ? "(leave blank to keep current)"
                        : "(min 6 characters)"}
                    </span>
                  </label>

                  <div
                    style={{
                      position: "relative",
                    }}
                  >
                    <input
                      className="form-control"
                      type={showPassword ? "text" : "password"}
                      placeholder={
                        editing ? "Leave blank to keep" : "Min. 6 characters"
                      }
                      value={form.password}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,

                          password: e.target.value,
                        }))
                      }
                      {...(!editing && {
                        required: true,
                        minLength: 6,
                      })}
                      style={{
                        paddingRight: 40,
                      }}
                    />

                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      style={{
                        position: "absolute",

                        right: 8,

                        top: "50%",

                        transform: "translateY(-50%)",

                        background: "none",

                        border: "none",

                        cursor: "pointer",

                        color: "var(--text-muted)",

                        padding: 4,
                      }}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* FOOTER */}
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : editing
                      ? "Update Staff"
                      : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
