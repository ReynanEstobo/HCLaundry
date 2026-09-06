import {
  Bell,
  DollarSign,
  Eye,
  EyeOff,
  Lock,
  Moon,
  Palette,
  Save,
  Shield,
  Sun,
  Timer,
} from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

export default function Settings() {
  const { user } = useAuth();

  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  // Business settings
  const [settings, setSettings] = useState(null);

  const [darkMode, setDarkMode] = useState(false);
  const [notifications, setNotifications] = useState(true);

  // Pricing settings
  const [bundleKg, setBundleKg] = useState(8);
  const [bundlePrice, setBundlePrice] = useState(200);
  const [addonPrice, setAddonPrice] = useState(15);
  const [excessKgPrice, setExcessKgPrice] = useState(30);

  // ETA settings
  const [etaWash, setEtaWash] = useState(45);
  const [etaDrying, setEtaDrying] = useState(40);
  const [etaFolding, setEtaFolding] = useState(15);

  useEffect(() => {
    async function loadSettings() {
      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .single();

      if (!error && data) {
        setSettings(data);

        // populate UI fields

        setDarkMode(data.darkmode || false);
        setNotifications(data.notifications !== false);

        setBundleKg(data.bundlekg || 8);
        setBundlePrice(data.bundleprice || 200);
        setAddonPrice(data.addonprice || 15);
        setExcessKgPrice(data.excesskgprice || 30);

        setEtaWash(data.etawash || 45);
        setEtaDrying(data.etadrying || 40);
        setEtaFolding(data.etafolding || 15);
      }
    }

    loadSettings();
  }, []);
  useEffect(() => {
    const channel = supabase
      .channel("settings-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "settings" },
        async () => {
          const { data } = await supabase.from("settings").select("*").single();

          if (data) {
            setSettings(data);

            setShopName(data.shopname || "4J Laundry");
            setOpenTime(data.opentime || "08:00");
            setCloseTime(data.closetime || "20:00");
            setDarkMode(data.darkmode || false);
            setNotifications(data.notifications !== false);

            setBundleKg(data.bundlekg || 8);
            setBundlePrice(data.bundleprice || 200);
            setAddonPrice(data.addonprice || 15);
            setExcessKgPrice(data.excesskgprice || 30);

            setEtaWash(data.etawash || 45);
            setEtaDrying(data.etadrying || 40);
            setEtaFolding(data.etafolding || 15);
          }
        },
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // Apply dark mode on mount and changes
  useEffect(() => {
    document.documentElement.setAttribute(
      "data-theme",
      darkMode ? "dark" : "light",
    );
  }, [darkMode]);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setPwLoading(true);
    try {
      // Re-authenticate with current password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (signInError) {
        toast.error("Current password is incorrect");
        setPwLoading(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Password updated successfully");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch (err) {
      toast.error("Failed to update password");
    }
    setPwLoading(false);
  };

  const handleSaveBusinessSettings = async () => {
    if (!settings?.id) return;

    const { error } = await supabase
      .from("settings")
      .update({
        darkmode: darkMode,
        notifications,
        bundlekg: Number(bundleKg),
        bundleprice: Number(bundlePrice),
        addonprice: Number(addonPrice),
        excesskgprice: Number(excessKgPrice),
        etawash: Number(etaWash),
        etadrying: Number(etaDrying),
        etafolding: Number(etaFolding),
      })
      .eq("id", settings.id);

    if (error) {
      toast.error("Failed to save settings");
    } else {
      toast.success("Settings updated!");
    }
  };

  const handleDarkModeToggle = () => {
    const next = !darkMode;
    setDarkMode(next);
  };

  const handleNotificationsToggle = () => {
    const next = !notifications;
    setNotifications(next);
  };

  // Format time for display

  if (!settings) return null;
  return (
    <div className="settings-page">
      <div className="settings-grid">
        {/* ====== ACCOUNT SECURITY ====== */}
        <div className="card settings-card">
          <div className="settings-card-header">
            <div className="settings-card-icon blue">
              <Shield size={20} />
            </div>
            <div>
              <h3>Account Security</h3>
              <p>Manage your password and security settings</p>
            </div>
          </div>

          <div className="settings-info-row">
            <span className="settings-label">Email</span>
            <span className="settings-value">{user?.email}</span>
          </div>

          <div className="settings-divider" />

          <h4 className="settings-subtitle">Change Password</h4>
          <form onSubmit={handlePasswordChange}>
            <div className="form-group">
              <label>Current Password</label>
              <div className="settings-input-wrapper">
                <Lock size={16} className="settings-input-icon" />
                <input
                  className="form-control"
                  type={showCurrent ? "text" : "password"}
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  style={{ paddingLeft: 38, paddingRight: 38 }}
                />
                <button
                  type="button"
                  className="settings-eye-btn"
                  onClick={() => setShowCurrent(!showCurrent)}
                >
                  {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>New Password</label>
                <div className="settings-input-wrapper">
                  <Lock size={16} className="settings-input-icon" />
                  <input
                    className="form-control"
                    type={showNew ? "text" : "password"}
                    placeholder="Min 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    style={{ paddingLeft: 38, paddingRight: 38 }}
                  />
                  <button
                    type="button"
                    className="settings-eye-btn"
                    onClick={() => setShowNew(!showNew)}
                  >
                    {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>Confirm New Password</label>
                <div className="settings-input-wrapper">
                  <Lock size={16} className="settings-input-icon" />
                  <input
                    className="form-control"
                    type={showConfirm ? "text" : "password"}
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    style={{ paddingLeft: 38, paddingRight: 38 }}
                  />
                  <button
                    type="button"
                    className="settings-eye-btn"
                    onClick={() => setShowConfirm(!showConfirm)}
                  >
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={pwLoading}
            >
              {pwLoading ? (
                <>
                  <div
                    className="spinner"
                    style={{ width: 16, height: 16, borderWidth: 2 }}
                  />{" "}
                  Updating...
                </>
              ) : (
                <>
                  <Lock size={15} /> Update Password
                </>
              )}
            </button>
          </form>
        </div>

        {/* ====== APPEARANCE ====== */}
        <div className="card settings-card">
          <div className="settings-card-header">
            <div className="settings-card-icon purple">
              <Palette size={20} />
            </div>
            <div>
              <h3>Appearance</h3>
              <p>Customize the look and feel of the system</p>
            </div>
          </div>

          <div className="settings-toggle-row">
            <div className="settings-toggle-info">
              <div className="settings-toggle-icon-wrap">
                {darkMode ? <Moon size={18} /> : <Sun size={18} />}
              </div>
              <div>
                <span className="settings-toggle-label">Dark Mode</span>
                <span className="settings-toggle-desc">
                  Switch between light and dark theme
                </span>
              </div>
            </div>
            <button
              className={`settings-toggle ${darkMode ? "active" : ""}`}
              onClick={handleDarkModeToggle}
            >
              <div className="settings-toggle-knob" />
            </button>
          </div>

          <div className="settings-toggle-row">
            <div className="settings-toggle-info">
              <div className="settings-toggle-icon-wrap">
                <Bell size={18} />
              </div>
              <div>
                <span className="settings-toggle-label">Notifications</span>
                <span className="settings-toggle-desc">
                  Show toast notifications for actions
                </span>
              </div>
            </div>
            <button
              className={`settings-toggle ${notifications ? "active" : ""}`}
              onClick={handleNotificationsToggle}
            >
              <div className="settings-toggle-knob" />
            </button>
          </div>
        </div>

        {/* ====== PRICING ====== */}
        <div className="card settings-card">
          <div className="settings-card-header">
            <div className="settings-card-icon amber">
              <DollarSign size={20} />
            </div>
            <div>
              <h3>Pricing</h3>
              <p>Set laundry bundle pricing and add-on costs</p>
            </div>
          </div>

          <div className="settings-pricing-group">
            <h4 className="settings-subtitle">Laundry Bundle</h4>
            <div className="form-row">
              <div className="form-group">
                <label>Bundle Size (kg)</label>
                <input
                  className="form-control"
                  type="number"
                  min="1"
                  step="1"
                  value={bundleKg}
                  onChange={(e) => setBundleKg(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Price per Bundle (₱)</label>
                <input
                  className="form-control"
                  type="number"
                  min="0"
                  step="1"
                  value={bundlePrice}
                  onChange={(e) => setBundlePrice(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Excess Price per KG (₱)</label>
                <input
                  className="form-control"
                  type="number"
                  min="0"
                  step="1"
                  value={excessKgPrice}
                  onChange={(e) => setExcessKgPrice(e.target.value)}
                />
              </div>
            </div>
            <div className="settings-pricing-preview">
              <span>
                ₱{Number(bundlePrice).toLocaleString()} minimum for {bundleKg}kg
                + ₱{Number(excessKgPrice).toLocaleString()} per excess kg
              </span>
            </div>
          </div>

          <div className="settings-divider" />

          <div className="settings-pricing-group">
            <h4 className="settings-subtitle">Add-ons (Soap / Detergent)</h4>
            <div className="form-group">
              <label>Price per Add-on Item (₱)</label>
              <input
                className="form-control"
                type="number"
                min="0"
                step="1"
                value={addonPrice}
                onChange={(e) => setAddonPrice(e.target.value)}
              />
            </div>
            <div className="settings-pricing-preview">
              <span>
                ₱{Number(addonPrice).toLocaleString()} per soap / detergent
                add-on
              </span>
            </div>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleSaveBusinessSettings}
            style={{ marginTop: 12 }}
          >
            <Save size={15} /> Save Pricing
          </button>
        </div>

        {/* ====== ETA / PROCESS TIMES ====== */}
        <div className="card settings-card">
          <div className="settings-card-header">
            <div className="settings-card-icon cyan">
              <Timer size={20} />
            </div>
            <div>
              <h3>Process ETA</h3>
              <p>Estimated time for each laundry stage (in minutes)</p>
            </div>
          </div>

          <div className="settings-eta-list">
            <div className="settings-eta-row">
              <div className="settings-eta-label">
                <span className="settings-eta-icon">🧺</span>
                <span>Washing</span>
              </div>
              <div className="settings-eta-input">
                <input
                  className="form-control"
                  type="number"
                  min="1"
                  value={etaWash}
                  onChange={(e) => setEtaWash(e.target.value)}
                />
                <span className="settings-eta-unit">min</span>
              </div>
            </div>
            <div className="settings-eta-row">
              <div className="settings-eta-label">
                <span className="settings-eta-icon">☀️</span>
                <span>Drying</span>
              </div>
              <div className="settings-eta-input">
                <input
                  className="form-control"
                  type="number"
                  min="1"
                  value={etaDrying}
                  onChange={(e) => setEtaDrying(e.target.value)}
                />
                <span className="settings-eta-unit">min</span>
              </div>
            </div>
            <div className="settings-eta-row">
              <div className="settings-eta-label">
                <span className="settings-eta-icon">👕</span>
                <span>Folding</span>
              </div>
              <div className="settings-eta-input">
                <input
                  className="form-control"
                  type="number"
                  min="1"
                  value={etaFolding}
                  onChange={(e) => setEtaFolding(e.target.value)}
                />
                <span className="settings-eta-unit">min</span>
              </div>
            </div>
          </div>

          <div className="settings-pricing-preview" style={{ marginTop: 12 }}>
            <span>
              Total ETA:{" "}
              <strong>
                ~{Number(etaWash) + Number(etaDrying) + Number(etaFolding)} min
              </strong>
            </span>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleSaveBusinessSettings}
            style={{ marginTop: 12 }}
          >
            <Save size={15} /> Save ETA Settings
          </button>
        </div>
      </div>
    </div>
  );
}
