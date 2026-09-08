import {
  Bell,
  CheckCircle2,
  DollarSign,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  MailCheck,
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
import { apiFetch } from "../services/api/client";
import LoadingButton from "../components/LoadingButton";

export default function Settings() {
  const { user } = useAuth();

  // Password change
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordOtp, setPasswordOtp] = useState("");
  const [otpDestination, setOtpDestination] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const requestPasswordOtp = async () => {
    setPwLoading(true);
    try {
      const result = await apiFetch('/api/auth/password/otp', { method: 'POST' });
      setOtpDestination(result.destination);
      toast.success(`Verification code sent to ${result.destination}`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setPwLoading(false);
    }
  };

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
  const [defaultProcessingMinutes, setDefaultProcessingMinutes] = useState(100);
  const [etaBufferMinutes, setEtaBufferMinutes] = useState(15);
  const [etaMinCompletedOrders, setEtaMinCompletedOrders] = useState(5);
  const [statusUndoSeconds, setStatusUndoSeconds] = useState(60);

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

        setDefaultProcessingMinutes(data.default_processing_minutes || ((data.etawash || 45) + (data.etadrying || 40) + (data.etafolding || 15)));
        setEtaBufferMinutes(data.eta_buffer_minutes ?? 15);
        setEtaMinCompletedOrders(data.eta_min_completed_orders ?? 5);
        setStatusUndoSeconds(data.status_undo_seconds ?? 60);
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

            setShopName(data.shopname || "H&C Laundry");
            setOpenTime(data.opentime || "08:00");
            setCloseTime(data.closetime || "20:00");
            setDarkMode(data.darkmode || false);
            setNotifications(data.notifications !== false);

            setBundleKg(data.bundlekg || 8);
            setBundlePrice(data.bundleprice || 200);
            setAddonPrice(data.addonprice || 15);
            setExcessKgPrice(data.excesskgprice || 30);

            setDefaultProcessingMinutes(data.default_processing_minutes || ((data.etawash || 45) + (data.etadrying || 40) + (data.etafolding || 15)));
            setEtaBufferMinutes(data.eta_buffer_minutes ?? 15);
            setEtaMinCompletedOrders(data.eta_min_completed_orders ?? 5);
            setStatusUndoSeconds(data.status_undo_seconds ?? 60);
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
    if (newPassword.length < 10) {
      toast.error("New password must be at least 10 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (!otpDestination || !/^\d{6}$/.test(passwordOtp)) {
      toast.error("Send a verification code and enter its 6 digits");
      return;
    }

    setPwLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword, otp: passwordOtp });
      if (error) throw new Error(error.message);
      setNewPassword("");
      setConfirmPassword("");
      setPasswordOtp("");
      setOtpDestination("");
      setPasswordChanged(true);
    } catch (err) {
      toast.error(err.message || "Failed to update password");
    }
    setPwLoading(false);
  };

  const handleSaveBusinessSettings = async () => {
    if (!settings?.id || settingsSaving) return;
    setSettingsSaving(true);
    try {
      const { error } = await supabase
        .from("settings")
        .update({
          darkmode: darkMode,
          notifications,
          bundlekg: Number(bundleKg),
          bundleprice: Number(bundlePrice),
          addonprice: Number(addonPrice),
          excesskgprice: Number(excessKgPrice),
          default_processing_minutes: Number(defaultProcessingMinutes),
          eta_buffer_minutes: Number(etaBufferMinutes),
          eta_min_completed_orders: Number(etaMinCompletedOrders),
          status_undo_seconds: Number(statusUndoSeconds),
        })
        .eq("id", settings.id);
      if (error) throw error;
      toast.success("Settings updated!");
    } catch (error) {
      toast.error("Failed to save settings");
    } finally {
      setSettingsSaving(false);
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
              <p>Change your password with a secure email verification code</p>
            </div>
          </div>

          <div className="settings-info-row">
            <span className="settings-label">Email</span>
            <span className="settings-value">{user?.email}</span>
          </div>

          <div className="settings-divider" />

          <h4 className="settings-subtitle">Change Password</h4>
          <form onSubmit={handlePasswordChange}>
            <LoadingButton type="button" className="btn btn-secondary" onClick={requestPasswordOtp} loading={pwLoading} loadingLabel="Sending code…" style={{ width: '100%', marginBottom: 14 }}>
              <MailCheck size={16} /> {otpDestination ? 'Resend verification code' : 'Send verification code'}
            </LoadingButton>
            {otpDestination && <div className="account-security-notice" style={{ marginBottom: 14 }}><MailCheck size={16} /><span>Code sent to <strong>{otpDestination}</strong>. It expires in 10 minutes.</span></div>}
            <div className="form-group">
              <label>Email Verification Code</label>
              <div className="settings-input-wrapper">
                <KeyRound size={16} className="settings-input-icon" />
                <input className="form-control" inputMode="numeric" maxLength={6} disabled={!otpDestination} value={passwordOtp} onChange={(e) => setPasswordOtp(e.target.value.replace(/\D/g, ''))} placeholder="6-digit code" required style={{ paddingLeft: 38, textAlign: 'center', letterSpacing: 5, fontWeight: 700 }} />
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
                    placeholder="At least 10 characters"
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
            <LoadingButton className="btn btn-primary" type="submit" loading={pwLoading} loadingLabel="Updating password…">
              <Lock size={15} /> Update Password
            </LoadingButton>
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

          <LoadingButton
            className="btn btn-primary"
            loading={settingsSaving}
            loadingLabel="Saving…"
            onClick={handleSaveBusinessSettings}
            style={{ marginTop: 12 }}
          >
            <Save size={15} /> Save Pricing
          </LoadingButton>
        </div>

        {/* ====== ETA / PROCESS TIMES ====== */}
        <div className="card settings-card">
          <div className="settings-card-header">
            <div className="settings-card-icon cyan">
              <Timer size={20} />
            </div>
            <div>
              <h3>Order ETA</h3>
              <p>Customer-ready estimates based on completed orders and your branch fallback.</p>
            </div>
          </div>

          <div className="settings-eta-list">
            <div className="settings-eta-row">
              <div className="settings-eta-label">
                <span className="settings-eta-icon">🧺</span>
                <span>Default processing time</span>
              </div>
              <div className="settings-eta-input">
                <input
                  className="form-control"
                  type="number"
                  min="1"
                  value={defaultProcessingMinutes}
                  onChange={(e) => setDefaultProcessingMinutes(e.target.value)}
                />
                <span className="settings-eta-unit">min</span>
              </div>
            </div>
            <div className="settings-eta-row">
              <div className="settings-eta-label">
                <span className="settings-eta-icon">↩️</span>
                <span>Staff undo window</span>
              </div>
              <div className="settings-eta-input">
                <input
                  className="form-control"
                  type="number"
                  min="1"
                  value={statusUndoSeconds}
                  onChange={(e) => setStatusUndoSeconds(e.target.value)}
                />
                <span className="settings-eta-unit">sec</span>
              </div>
            </div>
            <div className="settings-eta-row">
              <div className="settings-eta-label">
                <span className="settings-eta-icon">☀️</span>
                <span>ETA safety buffer</span>
              </div>
              <div className="settings-eta-input">
                <input
                  className="form-control"
                  type="number"
                  min="1"
                  value={etaBufferMinutes}
                  onChange={(e) => setEtaBufferMinutes(e.target.value)}
                />
                <span className="settings-eta-unit">min</span>
              </div>
            </div>
            <div className="settings-eta-row">
              <div className="settings-eta-label">
                <span className="settings-eta-icon">👕</span>
                <span>Minimum completed orders for historical ETA</span>
              </div>
              <div className="settings-eta-input">
                <input
                  className="form-control"
                  type="number"
                  min="1"
                  value={etaMinCompletedOrders}
                  onChange={(e) => setEtaMinCompletedOrders(e.target.value)}
                />
                <span className="settings-eta-unit">orders</span>
              </div>
            </div>
          </div>

          <div className="settings-pricing-preview" style={{ marginTop: 12 }}>
            <span>
              Fallback estimate for new orders:{" "}
              <strong>
                ~{Number(defaultProcessingMinutes) + Number(etaBufferMinutes)} min
              </strong>
            </span>
          </div>

          <LoadingButton
            className="btn btn-primary"
            loading={settingsSaving}
            loadingLabel="Saving…"
            onClick={handleSaveBusinessSettings}
            style={{ marginTop: 12 }}
          >
            <Save size={15} /> Save ETA Settings
          </LoadingButton>
        </div>
      </div>
      {passwordChanged && <div className="modal-overlay account-security-success-overlay" role="presentation">
        <section className="account-security-success-dialog" role="alertdialog" aria-modal="true" aria-labelledby="admin-password-success-title">
          <span className="account-security-success-icon"><CheckCircle2 size={32} /></span>
          <h3 id="admin-password-success-title">Password changed successfully</h3>
          <p>Your administrator password was updated and a fresh secure session is active.</p>
          <div className="account-security-success-note">Keep your password and verification code private. Do not share them with anyone.</div>
          <button className="account-security-submit" onClick={() => setPasswordChanged(false)}>Continue</button>
        </section>
      </div>}
    </div>
  );
}
