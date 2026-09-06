import { format } from "date-fns";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Edit2,
  LayoutGrid,
  List,
  Mail,
  Minus,
  Play,
  Plus,
  Search,
  Trash2,
  User,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabase";
import { useRealtime } from "../lib/useRealtime";
import { sendEmail, sendSms } from "../services/api/notificationApi";
<<<<<<< HEAD
import { createBranchOrder, getVisibleCustomers, lookupCustomerByPhone } from "../services/api/operationsApi";
import { useAuth } from "../context/AuthContext";
import { PageError, PageLoader } from "../components/AsyncState";
=======
import { useAuth } from "../context/AuthContext";
>>>>>>> 728e40e (Fixed)

const STATUS_FLOW = [
  "pending",
  "washing",
  "drying",
  "folding",
  "ready",
  "released",
];
const STATUS_LABELS = {
  pending: "Pending",
  washing: "Washing",
  drying: "Drying",
  folding: "Folding",
  ready: "Ready for pick-up",
  released: "Released",
};
const STATUS_ICONS = {
  pending: "\u23F3",
  washing: "\uD83E\uDDFA",
  drying: "\u2600\uFE0F",
  folding: "\uD83D\uDC55",
  ready: "\u2705",
  released: "\uD83D\uDCE6",
};

// Stages with timers
const TIMED_STAGES = ["washing", "drying", "folding"];
// Stages where timer auto-starts when order enters
const AUTO_TIMER_STAGES = ["washing", "drying"];
const MACHINE_CAPACITY_DEFAULTS = {
  washing: 2,
  drying: 3,
  folding: 4,
};
const BRANCHES = [
  "Main - Brgy 7",
  "2nd Branch - Brgy Calzada",
  "3rd Branch - Nasugbu",
];

function getStageDurations(settings) {
  return {
    washing: (Number(settings.etawash) || 45) * 60000,
    drying: (Number(settings.etadrying) || 40) * 60000,
    folding: (Number(settings.etafolding) || 15) * 60000,
  };
}

function calculateDynamicETA(order, settings) {
  if (!order.created_at) return null;

  const totalMinutes =
    (Number(settings.etawash) || 45) +
    (Number(settings.etadrying) || 40) +
    (Number(settings.etafolding) || 15);

  const baseTime = new Date(order.created_at);
  return new Date(baseTime.getTime() + totalMinutes * 60000);
}

async function sendReadyEmail(order, customerName, customerEmail) {
  if (!customerEmail) return;
  try {
    const res = await sendEmail({
        to: customerEmail,
        subject: `Your Laundry is Ready for Pickup! (Tracking #: ${order.order_number})`,
        body: `Hi ${customerName || "Customer"},\n\nGreat news! Your laundry is now ready for pickup at 4J Laundry.\n\nTracking Number: ${order.order_number}\n\nPlease pick it up at your earliest convenience during our business hours.\n\nThank you for choosing 4J Laundry!\n\n-- 4J Laundry Team`,
    });
    if (res.success) {
      toast.success(`Email notification sent to ${customerEmail}`);
    }
  } catch {
    // Silently fail - email is best-effort (won't work in local dev, only on Netlify)
  }
}

async function sendOrderSMS(
  phone,
  orderNumber,
  customerName,
  serviceName,
  weightKg,
  totalPrice,
  settings,
) {
  if (!phone) return;
  try {
    const etaMinutes =
      (Number(settings.etawash) || 45) +
      (Number(settings.etadrying) || 40) +
      (Number(settings.etafolding) || 15);
    const etaHours = Math.floor(etaMinutes / 60);
    const etaRemainMins = etaMinutes % 60;
    const etaText =
      etaHours > 0
        ? `${etaHours}hr${etaRemainMins > 0 ? ` ${etaRemainMins}min` : ""}`
        : `${etaMinutes}min`;

    const message = `Hi ${customerName || "Customer"}! Your laundry order has been received.\n\nTracking #: ${orderNumber}\nService: ${serviceName}\nWeight: ${weightKg}kg\nTotal: P${totalPrice.toLocaleString()}\nETA: ~${etaText}\n\nTrack your order at our website using your tracking number.\n\nWe'll notify you when it's ready. Thank you! - 4J Laundry`;

    await sendSms({ phone, message });
  } catch {
    // Silently fail - SMS is best-effort
  }
}

async function sendReadySMS(phone, orderNumber, customerName) {
  if (!phone) return;
  try {
    const message = `Hi ${customerName || "Customer"}! Your laundry (Tracking #: ${orderNumber}) is now READY for pickup. Please visit 4J Laundry at your earliest convenience. Thank you!`;

    await sendSms({ phone, message });
  } catch {
    // Silently fail
  }
}

async function sendOrderReceivedEmail(
  orderNumber,
  customerName,
  customerEmail,
  serviceName,
  weightKg,
  totalPrice,
  settings,
) {
  if (!customerEmail) return;
  try {
    // Calculate total ETA from all stage durations
    const etaMinutes =
      (Number(settings.etawash) || 45) +
      (Number(settings.etadrying) || 40) +
      (Number(settings.etafolding) || 15);
    const etaHours = Math.floor(etaMinutes / 60);
    const etaRemainMins = etaMinutes % 60;
    const etaText =
      etaHours > 0
        ? `${etaHours} hour${etaHours > 1 ? "s" : ""}${etaRemainMins > 0 ? ` ${etaRemainMins} minutes` : ""}`
        : `${etaMinutes} minutes`;

    const now = new Date();
    const completionTime = new Date(now.getTime() + etaMinutes * 60000);
    const timeOptions = { hour: "numeric", minute: "2-digit", hour12: true };
    const completionText = completionTime.toLocaleTimeString(
      "en-US",
      timeOptions,
    );

    const res = await sendEmail({
        to: customerEmail,
        subject: `Order Received! (Tracking #: ${orderNumber})`,
        body: `Hi ${customerName || "Customer"},\n\nThank you for choosing 4J Laundry! Your garment has been received and is now being processed.\n\nOrder Details:\n- Tracking Number: ${orderNumber}\n- Service: ${serviceName}\n- Weight: ${weightKg} kg\n- Total: P${totalPrice.toLocaleString()}\n\nEstimated Completion Time: ${etaText} (approximately ${completionText})\n\nYou can track your order anytime on our website using your tracking number.\n\nWe'll notify you via email once your laundry is ready for pickup.\n\nThank you!\n\n-- 4J Laundry Team`,
    });
    if (res.success) {
      toast.success(`Order confirmation email sent to ${customerEmail}`);
    }
  } catch {
    // Silently fail - email is best-effort
  }
}

export default function Orders() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [orders, setOrders] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;
  const [totalCount, setTotalCount] = useState(0);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const [customers, setCustomers] = useState([]);
  const [serviceTypes, setServiceTypes] = useState([]);
  const [soapItems, setSoapItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("all");

  const [searchInput, setSearchInput] = useState("");
  const [settings, setSettings] = useState({});
  const [viewMode, setViewMode] = useState("table");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (settings?.defaultview) {
      setViewMode(settings.defaultview);
    }
  }, [settings]);
  const [dragOrder, setDragOrder] = useState(null);

  const mappedSettings = {
    etaWash: settings.etawash,
    etaDrying: settings.etadrying,
    etaFolding: settings.etafolding,
    bundleKg: settings.bundlekg,
    bundlePrice: settings.bundleprice,
    addonPrice: settings.addonprice,
    capacityWash: settings.capacitywash,
    capacityDrying: settings.capacitydrying,
    capacityFolding: settings.capacityfolding,
  };
  const BUNDLE_KG = Number(mappedSettings.bundleKg) || 8;
  const BUNDLE_PRICE = Number(mappedSettings.bundlePrice) || 200;
  const SOAP_PRICE = Number(mappedSettings.addonPrice) || 15;
  const EXCESS_KG_PRICE = Number(settings.excesskgprice) || 30;

  const [form, setForm] = useState({
    customer_id: "",
    customer_phone: "",
    customer_name: "",
    customer_email: "",
    service_type_id: "",
    weight_kg: "",
    notes: "",
    payment_method: "cash",
    payment_status: "unpaid",
    amount_paid: "",
    branch: "Main - Brgy 7",
    addons: {},
  });
  // Staff data is already branch-scoped by the backend. Admins may create an
  // order for any branch, so their add-on list is narrowed immediately when
  // the branch selection changes.
  const branchInventoryItems = isAdmin
    ? soapItems.filter((item) => item.branch === form.branch)
    : soapItems;

  const [phoneMatch, setPhoneMatch] = useState(null); // null = not searched, object = found, false = not found

  function getStageCapacity(stage) {
    const keyMap = {
      washing: "capacityWash",
      drying: "capacityDrying",
      folding: "capacityFolding",
    };
    const configured = Number(settings[keyMap[stage]]);
    if (Number.isFinite(configured) && configured > 0) return configured;
    return MACHINE_CAPACITY_DEFAULTS[stage] || Infinity;
  }

  function getStageLoad(stage, currentOrders = orders) {
    if (!TIMED_STAGES.includes(stage)) return 0;
    return currentOrders.filter(
      (order) => order.status === stage && !order.stage_started_at,
    ).length;
  }

  function calcPrice(weight, addons) {
    if (!weight || weight <= 0) return 0;

    // 🔥 BASE PRICE
    let laundryPrice = BUNDLE_PRICE;

    // 🔥 EXCESS KG AFTER 8KG
    if (weight > BUNDLE_KG) {
      const excessKg = Math.ceil(weight - BUNDLE_KG);

      laundryPrice += excessKg * EXCESS_KG_PRICE;
    }

    // 🔥 ADD-ONS
    const totalAddonUnits = Object.values(addons || {}).reduce(
      (sum, qty) => sum + qty,
      0,
    );

    return laundryPrice + totalAddonUnits * SOAP_PRICE;
  }

  function updateAddon(itemId, delta) {
    setForm((f) => {
      const addons = { ...f.addons };
      const newQty = (addons[itemId] || 0) + delta;
      if (newQty <= 0) {
        delete addons[itemId];
      } else {
        addons[itemId] = newQty;
      }
      return { ...f, addons };
    });
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    // 👇 ADD THIS BLOCK
    let ordersQuery = supabase
      .from("orders")
      .select("*, customers(name, phone, email)", { count: "exact" });

    if (filter !== "all") {
      ordersQuery = ordersQuery.eq("status", filter);
    }

    ordersQuery = ordersQuery
      .order("priority_order", { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    // 👇 KEEP THIS (but replace first item)
    try {
    const [ordersRes, custRes, soapRes, servicesRes] = await Promise.all([
      ordersQuery,
      getVisibleCustomers(),
      supabase
        .from("inventory_items")
        .select("*, inventory_categories(name)")
        .order("name"),
      supabase.from("service_types").select("*").eq("is_active", true).order("name"),
    ]);

    // 🔥 fetch ALL orders for search (no pagination)
    const { data: allData } = await supabase
      .from("orders")
      .select("*, customers(name, phone, email)")
      .order("priority_order", { ascending: true });

    const error = ordersRes.error || custRes.error || soapRes.error || servicesRes.error;
    if (error) throw error;

    setAllOrders(allData || []);

    setOrders(ordersRes.data || []);
    setTotalCount(ordersRes.count || 0);
    setCustomers(custRes.data || []);
    setSoapItems(soapRes.data || []);
    setServiceTypes(servicesRes.data || []);
    } catch (error) {
      setLoadError(error.message || "Unable to load order data.");
    } finally {
      setLoading(false);
    }
  }, [page, filter]); // ✅ ADD THIS

  useEffect(() => {
    loadData();
  }, [loadData]); // ✅ FIXED // ✅ ADD page

  useEffect(() => {
    setPage(0);
  }, [filter]);

  // Realtime: refresh when orders, customers, or inventory change
  useRealtime(["orders", "customers", "inventory_items"], loadData);
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now()); // 🔥 updates UI every second
    }, 1000);

    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    async function loadSettings() {
      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .single();

      if (!error && data) {
        setSettings(data);
      }
    }

    loadSettings();
  }, []);

  useRealtime(["settings"], async () => {
    const { data } = await supabase.from("settings").select("*").single();

    if (data) setSettings(data);
  });

  // Auto-advance orders whose timers were manually started and expired
  const autoAdvanceRef = useRef(false);
  useEffect(() => {
    const stageDurations = getStageDurations(settings);

    async function checkAndAdvance() {
      if (autoAdvanceRef.current) return;
      autoAdvanceRef.current = true;

      try {
        const { data: activeOrders, error: fetchErr } = await supabase
          .from("orders")
          .select("*, customers(name, phone, email)")
          .in("status", TIMED_STAGES);

        if (fetchErr) {
          autoAdvanceRef.current = false;
          return;
        }

        if (!activeOrders || activeOrders.length === 0) {
          autoAdvanceRef.current = false;
          return;
        }

        const now = Date.now();
        let advanced = false;

        for (const order of activeOrders) {
          // Only advance if timer was started (auto or manual)
          if (!order.stage_started_at) continue;

          const stageStart = new Date(order.stage_started_at).getTime();
          const duration = stageDurations[order.status];
          if (!duration) continue;

          const elapsed = now - stageStart;
          if (elapsed >= duration) {
            const idx = STATUS_FLOW.indexOf(order.status);
            if (idx < 0 || idx >= STATUS_FLOW.length - 1) continue;
            const nextStatus = STATUS_FLOW[idx + 1];

            const updates = {
              status: nextStatus,
              stage_started_at: AUTO_TIMER_STAGES.includes(nextStatus)
                ? new Date().toISOString()
                : null,
            };
            if (nextStatus === "ready")
              updates.actual_completion = new Date().toISOString();

            const { error: updateErr } = await supabase
              .from("orders")
              .update(updates)
              .eq("id", order.id);
            if (updateErr) continue;

            advanced = true;

            // Auto-start timer if next stage is an auto-timer stage (wash/dry)
            if (AUTO_TIMER_STAGES.includes(nextStatus)) {
            }

            if (nextStatus === "ready" && order.customers?.email) {
              sendReadyEmail(
                order,
                order.customers.name,
                order.customers.email,
              );
            }
            if (nextStatus === "ready" && order.customers?.phone) {
              sendReadySMS(
                order.customers.phone,
                order.order_number,
                order.customers.name,
              );
            }
            toast.success(
              `${order.order_number}: ${STATUS_LABELS[order.status]} \u2192 ${STATUS_LABELS[nextStatus]}`,
            );
          }
        }

        if (advanced) loadData();
      } catch (err) {
        console.error("Auto-advance exception:", err);
      }
      autoAdvanceRef.current = false;
    }

    checkAndAdvance();
    const interval = setInterval(checkAndAdvance, 3000);
    return () => clearInterval(interval);
  }, [settings, loadData]);

  function openNew() {
    setEditing(null);
    setForm({
      customer_id: "",
      customer_phone: "",
      customer_name: "",
      customer_email: "",
      service_type_id: "",
      weight_kg: "",
      notes: "",
      payment_method: "cash",
      payment_status: "unpaid",
      amount_paid: "",
      branch: "Main - Brgy 7",
      addons: {},
    });
    setPhoneMatch(null);
    setShowModal(true);
  }

  function openEdit(order) {
    setEditing(order);
    setForm({
      customer_id: order.customer_id || "",
      customer_phone: order.customers?.phone || "",
      customer_name: order.customers?.name || "",
      customer_email: order.customers?.email || "",
      service_type_id: order.service_type_id || "",
      weight_kg: order.weight_kg,
      notes: order.notes || "",
      payment_method: order.payment_method || "cash",
      payment_status: order.payment_status,
      branch: order.branch || "",
      amount_paid:
        order.amount_paid ??
        (order.payment_status === "paid"
          ? order.total_price
          : order.payment_status === "partial"
            ? Math.ceil(order.total_price * 0.5)
            : ""),
      addons: order.addons || {},
    });
    setPhoneMatch(order.customers ? order.customers : null);
    setShowModal(true);
  }

  async function lookupPhone(phone) {
    if (!phone || phone.length < 4) {
      setPhoneMatch(null);
      return;
    }
    // Check the central customer directory. Only branch-visible customer details
    // are returned to staff, but a matching phone is still never duplicated.
    let result;
    try {
      result = await lookupCustomerByPhone(phone);
    } catch (error) {
      toast.error(error.message || "Unable to check the client record");
      return;
    }
    const data = result.customer || customers.find((customer) => customer.phone === phone) || null;
    if (data) {
      setPhoneMatch(data);
      setForm((f) => ({
        ...f,
        customer_id: data.id,
        customer_name: data.name,
        customer_email: data.email || "",
      }));
    } else {
      setPhoneMatch(result.exists ? { exists: true, crossBranch: true } : false);
      setForm((f) => ({
        ...f,
        customer_id: "",
        customer_name: "",
        customer_email: "",
      }));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.customer_phone.trim())
      return toast.error("Phone number is required");
    if (!form.customer_name.trim())
      return toast.error("Client name is required");
<<<<<<< HEAD
    if (!editing && serviceTypes.length > 0 && !form.service_type_id)
      return toast.error("Please select a service type");
=======
>>>>>>> 728e40e (Fixed)
    if (isAdmin && !form.branch)
      return toast.error("Please assign this order to a branch");

    const weight = parseFloat(form.weight_kg);
    if (!weight || weight <= 0)
      return toast.error("Please enter a valid weight");

    const addonEntries = Object.entries(form.addons).filter(
      ([, qty]) => qty > 0,
    );

    // Check stock for all add-ons
    if (!editing) {
      for (const [itemId, qty] of addonEntries) {
        const item = branchInventoryItems.find((i) => i.id === itemId);
        if (!item) return toast.error("Selected item not found");
        if (item.current_stock < qty) {
          return toast.error(
            `${item.name} only has ${item.current_stock} in stock!`,
          );
        }
      }
    }

    const total_price = calcPrice(weight, form.addons);
    const amountPaid = parseFloat(form.amount_paid) || 0;
    const minRequired = total_price * 0.5;

    // Require at least 50% payment
    if (amountPaid < minRequired) {
      return toast.error(
        `Minimum 50% payment required: \u20B1${minRequired.toLocaleString()}`,
      );
    }

    // Auto-derive payment status from amount paid
    const payment_status =
      amountPaid <= 0
        ? "unpaid"
        : amountPaid >= total_price
          ? "paid"
          : "partial";

<<<<<<< HEAD
=======
    // Auto-register customer if not found
    let customerId = form.customer_id;
    if (!customerId) {
      const { data: existingCust } = await supabase
        .from("customers")
        .select("id")
        .eq("phone", form.customer_phone.trim())
        .maybeSingle();
      if (existingCust) {
        customerId = existingCust.id;
      } else {
        const { data: newCust, error: custErr } = await supabase
          .from("customers")
          .insert({
            name: form.customer_name.trim(),
            phone: form.customer_phone.trim(),
            email: form.customer_email.trim() || null,
            ...(isAdmin && { branch: form.branch }),
          })
          .select("id")
          .single();
        if (custErr)
          return toast.error("Failed to register client: " + custErr.message);
        customerId = newCust.id;
        toast.success("New client registered!");
      }
    }

>>>>>>> 728e40e (Fixed)
    const totalEtaMinutes =
      (Number(settings.etawash) || 45) +
      (Number(settings.etadrying) || 40) +
      (Number(settings.etafolding) || 15);

    const payload = {
      customer_id: form.customer_id || null,
      service_type_id: form.service_type_id || null,
      weight_kg: weight,
      total_price,
      addons: form.addons, // ✅ now supported
      notes: form.notes,
      payment_method: form.payment_method,
      payment_status,
      amount_paid: amountPaid,
      ...(isAdmin && { branch: form.branch }),

      ...(!editing && { status: "pending" }),
    };

    let error, orderData;
    if (editing) {
      ({ error } = await supabase
        .from("orders")
        .update(payload)
        .eq("id", editing.id));
    } else {
      try {
        const result = await createBranchOrder({
          branch: isAdmin ? form.branch : undefined,
          bundleKg: BUNDLE_KG,
          customer: {
            name: form.customer_name.trim(),
            phone: form.customer_phone.trim(),
            email: form.customer_email.trim() || null,
          },
          order: payload,
          addons: form.addons,
        });
        orderData = result.data;
      } catch (createError) {
        error = { message: createError.message };
      }
    }

    // If failed, might be due to missing amount_paid column - retry without it
    if (editing && error && amountPaid > 0) {
      // Try adding amount_paid in case the column exists
      const payloadWithPaid = { ...payload, amount_paid: amountPaid };
      if (editing) {
        const r = await supabase
          .from("orders")
          .update(payloadWithPaid)
          .eq("id", editing.id);
        if (!r.error) error = null;
      }
    }

    if (error) return toast.error(error.message);

    // Track stage start time for new orders
    if (false && !editing && orderData) {
    }

    // New orders are stock-validated and deducted atomically by the backend
    // for the selected branch. This legacy client-side code remains disabled.
    if (false && !editing && orderData) {
      try {
        // 🔥 1. Compute loads
        const loads = Math.ceil(weight / BUNDLE_KG);

        // 🔥 2. Get ALL inventory items
        const { data: allItems, error } = await supabase
          .from("inventory_items")
          .select("*");

        if (error) throw error;

        const operations = [];

        for (const item of allItems) {
          const usagePerLoad = Number(item.usage_per_load) || 0;

          // ✅ DEFAULT deduction (always applies)
          const defaultDeduction = usagePerLoad * loads;

          // ✅ ADD-ON deduction (only if selected)
          const addonQty = form.addons[item.id] || 0;

          // ✅ TOTAL deduction
          const totalDeduction = defaultDeduction + addonQty;

          if (totalDeduction <= 0) continue;

          const newStock = Math.max(
            0,
            Number(item.current_stock) - totalDeduction,
          );

          // 🔥 Update stock
          operations.push(
            supabase
              .from("inventory_items")
              .update({ current_stock: newStock })
              .eq("id", item.id),
          );

          // 🔥 Log usage
          operations.push(
            supabase.from("inventory_usage_log").insert({
              item_id: item.id,
              quantity_used: totalDeduction,
              order_id: orderData.id,
            }),
          );
        }

        await Promise.all(operations);
      } catch (err) {
        console.error("Inventory deduction error:", err);
        toast.error("Failed to deduct inventory");
      }
    }

    // Send order received email for new orders
    if (
      !editing &&
      orderData &&
      (form.customer_email.trim() || phoneMatch?.email)
    ) {
      const email = form.customer_email.trim() || phoneMatch?.email;
      sendOrderReceivedEmail(
        orderData.order_number,
        form.customer_name.trim(),
        email,
        "Laundry Service",
        weight,
        total_price,
        settings,
      );
    }

    // Send order received SMS for new orders
    if (!editing && orderData && form.customer_phone.trim()) {
      sendOrderSMS(
        form.customer_phone.trim(),
        orderData.order_number,
        form.customer_name.trim(),
        "Laundry Service",
        weight,
        total_price,
        settings,
      );
    }

    toast.success(editing ? "Order updated!" : "Order created!");
    setShowModal(false);
    loadData();
  }

  async function completePaymentAndRelease() {
    if (!selectedOrder) return;

    const total = Number(selectedOrder.total_price) || 0;

    // ✅ same fallback logic
    const paid =
      Number(selectedOrder.amount_paid) ||
      (selectedOrder.payment_status === "partial"
        ? total * 0.5
        : selectedOrder.payment_status === "paid"
          ? total
          : 0);

    const pay = Number(paymentAmount) || 0;

    if (pay <= 0) return toast.error("Enter valid amount");

    const newTotalPaid = paid + pay;

    if (newTotalPaid < total) {
      return toast.error("Full payment required before release");
    }

    const { error } = await supabase
      .from("orders")
      .update({
        amount_paid: newTotalPaid,
        payment_status: "paid",
        payment_method: paymentMethod,
        status: "released",
        picked_up_at: new Date().toISOString(),
      })
      .eq("id", selectedOrder.id);

    if (error) return toast.error(error.message);

    toast.success("Order released successfully");

    setShowPaymentModal(false);
    setSelectedOrder(null);
    loadData();
  }

  async function updateStatus(order, newStatus) {
    if (newStatus === "released") {
      const total = Number(order.total_price) || 0;

      // ✅ handle downpayment / partial safely
      const paid =
        Number(order.amount_paid) ||
        (order.payment_status === "paid"
          ? total
          : order.payment_status === "partial"
            ? total * 0.5
            : 0);

      const remaining = total - paid;

      if (remaining > 0) {
        setSelectedOrder(order);
        setPaymentAmount(remaining); // ✅ exact remaining
        setPaymentMethod("cash");
        setShowPaymentModal(true);
        return;
      }
    }

    const updates = {
      status: newStatus,
      stage_started_at: AUTO_TIMER_STAGES.includes(newStatus)
        ? new Date().toISOString()
        : null,
      updated_at: new Date().toISOString(),
    };

    if (newStatus === "ready") {
      updates.actual_completion = new Date().toISOString();
    }

    if (newStatus === "released") {
      updates.picked_up_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("orders")
      .update(updates)
      .eq("id", order.id);

    if (error) return toast.error(error.message);

    toast.success(`Status → ${STATUS_LABELS[newStatus]}`);

    if (newStatus === "ready") {
      if (order.customers?.email) {
        sendReadyEmail(order, order.customers.name, order.customers.email);
      }
      if (order.customers?.phone) {
        sendReadySMS(
          order.customers.phone,
          order.order_number,
          order.customers.name,
        );
      }
    }

    loadData();
  }
  async function startStageTimer(order) {
    const { error } = await supabase
      .from("orders")
      .update({
        stage_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    if (error) return toast.error(error.message);

    toast.success(`Timer started for ${STATUS_LABELS[order.status]}`);
    loadData();
  }

  async function advanceStatus(order) {
    const idx = STATUS_FLOW.indexOf(order.status);
    if (idx < 0 || idx >= STATUS_FLOW.length - 1) return;
    updateStatus(order, STATUS_FLOW[idx + 1]);
  }

  async function deleteOrder(id) {
    if (!confirm("Delete this order?")) return;
    const { error } = await supabase.from("orders").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Order deleted");
    loadData();
  }

  function getTimeRemaining(order, settings) {
    if (!order.stage_started_at) return "Waiting start";

    const stageStart = new Date(order.stage_started_at).getTime();
    const currentTime = now;

    const durations = {
      washing: (Number(settings.etawash) || 45) * 60000,
      drying: (Number(settings.etadrying) || 40) * 60000,
      folding: (Number(settings.etafolding) || 15) * 60000,
    };

    const duration = durations[order.status];
    if (!duration) return "";

    const remaining = stageStart + duration - currentTime;

    if (remaining <= 0) return "Advancing...";

    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);

    return `${minutes}m ${seconds}s`;
  }

  function toggleView(mode) {
    setViewMode(mode);
  }

  function handleDragStart(e, order) {
    setDragOrder(order);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", order.id);
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(e, targetStatus) {
    e.preventDefault();
    if (dragOrder && dragOrder.status !== targetStatus) {
      updateStatus(dragOrder, targetStatus);
    }
    setDragOrder(null);
  }

  // Compute per-stage stats for the overview bar
  function computeStageStats(list) {
    return STATUS_FLOW.reduce((acc, status) => {
      const stageOrders = list.filter((o) => o.status === status);
      const running = TIMED_STAGES.includes(status)
        ? stageOrders.filter((o) => isTimerStarted(o.id)).length
        : 0;
      const waiting = TIMED_STAGES.includes(status)
        ? stageOrders.length - running
        : 0;
      const capacity = TIMED_STAGES.includes(status)
        ? getStageCapacity(status)
        : null;
      acc[status] = { total: stageOrders.length, running, waiting, capacity };
      return acc;
    }, {});
  }

  const source = searchInput ? allOrders : orders;

  const filtered = source
    .filter((o) => {
      if (!searchInput) return true;

      const q = searchInput.toLowerCase();

      return (
        o.order_number?.toLowerCase().includes(q) ||
        o.customers?.name?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (a.status === "released" && b.status !== "released") return 1;
      if (a.status !== "released" && b.status === "released") return -1;

      return (a.priority_order ?? 0) - (b.priority_order ?? 0);
    });

  if (loading) return <PageLoader label="Loading orders…" />;
  if (loadError) return <PageError message={loadError} onRetry={loadData} />;

  return (
    <>
      {/* Toolbar */}
      <div className="garment-toolbar">
        <div className="garment-filters">
          {["all", ...STATUS_FLOW].map((s) => (
            <button
              key={s}
              className={`garment-filter-btn ${filter === s ? "active" : ""}`}
              onClick={() => setFilter(s)}
            >
              {s !== "all" && (
                <span className="garment-filter-icon">{STATUS_ICONS[s]}</span>
              )}
              {s === "all" ? "All" : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <div className="garment-toolbar-actions">
          <div className="search-box">
            <Search />
            <input
              placeholder="Search orders..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="view-toggle">
            <button
              className={`view-toggle-btn ${viewMode === "table" ? "active" : ""}`}
              onClick={() => toggleView("table")}
              title="Table view"
            >
              <List size={16} />
            </button>
            <button
              className={`view-toggle-btn ${viewMode === "board" ? "active" : ""}`}
              onClick={() => toggleView("board")}
              title="Board view"
            >
              <LayoutGrid size={16} />
            </button>
          </div>
          <button className="btn btn-primary" onClick={openNew}>
            <Plus size={18} /> New Order
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      {viewMode === "board" && (
        <div className="kanban-board">
          {STATUS_FLOW.map((status) => {
            const columnOrders = filtered.filter((o) => o.status === status);
            return (
              <div
                key={status}
                className={`kanban-column ${dragOrder ? "drag-active" : ""}`}
                data-stage={status}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, status)}
              >
                <div className="kanban-column-header">
                  <div className="kanban-column-title">
                    <span className="kanban-column-icon">
                      {STATUS_ICONS[status]}
                    </span>
                    <span>{STATUS_LABELS[status]}</span>
                    <span className="kanban-count">{columnOrders.length}</span>
                  </div>
                </div>
                <div className="kanban-cards">
                  {columnOrders.length === 0 ? (
                    <div className="kanban-empty">No orders</div>
                  ) : (
                    columnOrders.map((order) => {
                      const timerActive =
                        TIMED_STAGES.includes(order.status) &&
                        !!order.stage_started_at;
                      const isQueued =
                        TIMED_STAGES.includes(order.status) &&
                        !order.stage_started_at;
                      return (
                        <div
                          key={order.id}
                          className={`kanban-card ${timerActive ? "timer-live" : ""} ${isQueued ? "timer-queued" : ""}`}
                          draggable
                          onDragStart={(e) => handleDragStart(e, order)}
                        >
                          <div className="kanban-card-header">
                            <span className="kanban-order-num">
                              #{order.order_number}
                            </span>
                            <span
                              className={`kanban-payment-badge badge-${order.payment_status}`}
                            >
                              {order.payment_status}
                            </span>
                          </div>
                          <div className="kanban-card-customer">
                            <User size={11} />
                            <span>{order.customers?.name || "Walk-in"}</span>
                          </div>
                          {isAdmin && (
                            <div
                              style={{
                                fontSize: 11,
                                color: "var(--text-muted)",
                                marginTop: 4,
                              }}
                            >
                              Branch: {order.branch || "Unassigned"}
                            </div>
                          )}
                          <div className="kanban-card-details">
                            <span className="kanban-card-kg">
                              {order.weight_kg}kg
                            </span>
                            <span className="kanban-card-price">
                              {"\u20B1"}
                              {(Number(order.total_price) || 0).toLocaleString(
                                undefined,
                                {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                },
                              )}
                            </span>
                          </div>
                          {TIMED_STAGES.includes(order.status) && (
                            <div className="kanban-timer-row">
                              {timerActive ? (
                                <span className="timer-pill live">
                                  <Clock size={10} />{" "}
                                  {getTimeRemaining(order, settings)}
                                </span>
                              ) : (
                                <span className="timer-pill queued">
                                  Queued
                                </span>
                              )}
                            </div>
                          )}
                          <div className="kanban-card-actions">
                            {TIMED_STAGES.includes(order.status) &&
                              !AUTO_TIMER_STAGES.includes(order.status) &&
                              !order.stage_started_at && (
                                <button
                                  className="btn-icon btn-start"
                                  title="Start timer"
                                  onClick={() => startStageTimer(order)}
                                >
                                  <Play size={12} />
                                </button>
                              )}
                            {!["released", "cancelled"].includes(
                              order.status,
                            ) && (
                              <button
                                className="btn-icon"
                                title={`Move to ${STATUS_LABELS[STATUS_FLOW[STATUS_FLOW.indexOf(order.status) + 1]]}`}
                                onClick={() => advanceStatus(order)}
                              >
                                <ArrowRight size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table */}
      {viewMode === "table" && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Customer</th>
                  {isAdmin && <th>Branch</th>}
                  <th>Weight</th>
                  <th>Status</th>
                  <th>Time Left</th>
                  <th>Payment</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 10 : 9} className="empty-state">
                      <p>No orders found</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((order) => (
                    <tr key={order.id}>
                      <td
                        style={{
                          fontWeight: 600,
                          color: "var(--text-primary)",
                        }}
                      >
                        {order.order_number}
                      </td>
                      <td>{order.customers?.name || "Walk-in"}</td>
                      {isAdmin && (
                        <td style={{ fontSize: 13 }}>
                          {order.branch || "Unassigned"}
                        </td>
                      )}
                      <td>{order.weight_kg} kg</td>
                      <td>
                        <div className="status-track">
                          <div className="status-dots">
                            {STATUS_FLOW.map((s, i) => {
                              const currentIdx = STATUS_FLOW.indexOf(
                                order.status,
                              );
                              const isDone = i <= currentIdx;
                              return (
                                <div
                                  key={s}
                                  className="status-dot-group"
                                  title={STATUS_LABELS[s]}
                                >
                                  {i > 0 && (
                                    <div
                                      className={`status-line ${isDone ? "filled" : ""}`}
                                    />
                                  )}
                                  <div
                                    className={`status-dot ${isDone ? "filled" : ""} ${i === currentIdx ? "current" : ""}`}
                                  />
                                </div>
                              );
                            })}
                          </div>
                          <div className="status-track-label">
                            <span className={`badge badge-${order.status}`}>
                              {STATUS_LABELS[order.status]}
                            </span>
                            {TIMED_STAGES.includes(order.status) &&
                              !AUTO_TIMER_STAGES.includes(order.status) &&
                              !order.stage_started_at && (
                                <button
                                  className="status-next-btn"
                                  style={{ background: "#16a34a" }}
                                  onClick={() => startStageTimer(order)}
                                  title="Start stage timer"
                                >
                                  <Play size={14} />
                                </button>
                              )}
                            {!["released", "cancelled"].includes(
                              order.status,
                            ) && (
                              <button
                                className="status-next-btn"
                                onClick={() => advanceStatus(order)}
                                title={`Move to ${STATUS_LABELS[STATUS_FLOW[STATUS_FLOW.indexOf(order.status) + 1]]}`}
                              >
                                <ArrowRight size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        {["released", "cancelled"].includes(order.status) ? (
                          "\u2014"
                        ) : (
                          <span
                            style={{
                              color: "var(--primary-light)",
                              fontWeight: 600,
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <Clock size={14} />{" "}
                            {getTimeRemaining(order, settings) || "\u2014"}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`badge badge-${order.payment_status}`}>
                          {order.payment_status}
                        </span>
                      </td>
                      <td
                        style={{
                          fontWeight: 600,
                          color: "var(--text-primary)",
                        }}
                      >
                        {"\u20B1"}
                        {(Number(order.total_price) || 0).toLocaleString(
                          undefined,
                          {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          },
                        )}
                      </td>
                      <td style={{ color: "var(--text-muted)", fontSize: 13 }}>
                        {format(new Date(order.created_at), "MMM d, h:mm a")}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            className="btn-icon"
                            title="Edit"
                            onClick={() => openEdit(order)}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            className="btn-icon"
                            title="Delete"
                            onClick={() => deleteOrder(order.id)}
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
            {!searchInput && (
              <div style={{ marginTop: 14, textAlign: "center" }}>
                {/* PAGINATION BUTTONS */}
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
                    style={{
                      opacity: page === 0 ? 0.4 : 1,
                      padding: "6px 10px",
                    }}
                  >
                    «
                  </button>

                  {/* PREVIOUS */}
                  <button
                    className="btn btn-sm"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(p - 1, 0))}
                    style={{
                      opacity: page === 0 ? 0.4 : 1,
                      padding: "6px 10px",
                    }}
                  >
                    ‹
                  </button>

                  {/* PAGE NUMBERS */}
                  {(() => {
                    const pages = [];

                    if (totalPages === 0) return null;

                    let start = Math.max(0, page - 1);
                    let end = Math.min(totalPages, start + 3);

                    if (end - start < 3) {
                      start = Math.max(0, end - 3);
                    }

                    for (let i = start; i < end; i++) {
                      const isActive = i === page;

                      pages.push(
                        <button
                          key={i}
                          onClick={() => setPage(i)}
                          style={{
                            minWidth: 36,
                            height: 36,
                            borderRadius: 8,
                            border: isActive
                              ? "1px solid #64748b"
                              : "1px solid transparent",
                            background: isActive ? "#1e293b" : "transparent",
                            color: isActive ? "#fff" : "#94a3b8",
                            fontWeight: 600,
                            transition: "all 0.2s ease",
                            cursor: "pointer",
                          }}
                        >
                          {i + 1}
                        </button>,
                      );
                    }

                    return pages;
                  })()}

                  {/* NEXT */}
                  <button
                    className="btn btn-sm"
                    disabled={page + 1 >= totalPages}
                    onClick={() =>
                      setPage((p) => (p + 1 < totalPages ? p + 1 : p))
                    }
                    style={{
                      opacity: page + 1 >= totalPages ? 0.4 : 1,
                      padding: "6px 10px",
                    }}
                  >
                    ›
                  </button>

                  {/* LAST */}
                  <button
                    className="btn btn-sm"
                    disabled={page + 1 >= totalPages}
                    onClick={() => setPage(totalPages - 1)}
                    style={{
                      opacity: page + 1 >= totalPages ? 0.4 : 1,
                      padding: "6px 10px",
                    }}
                  >
                    »
                  </button>
                </div>

                {/* RANGE TEXT */}
                <div style={{ fontSize: 13, color: "#94a3b8" }}>
                  {searchInput
                    ? `${filtered.length} results found`
                    : totalCount === 0
                      ? "0 of 0"
                      : `${page * PAGE_SIZE + 1}–${Math.min(
                          (page + 1) * PAGE_SIZE,
                          totalCount,
                        )} out of ${totalCount}`}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="order-modal" onClick={(e) => e.stopPropagation()}>
            <div className="order-modal-header">
              <div>
                <h3>{editing ? "Edit Order" : "New Order"}</h3>
                <p>
                  {editing
                    ? `Order #${editing.order_number}`
                    : "Fill in the details below"}
                </p>
              </div>
              <button className="btn-icon" onClick={() => setShowModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="order-modal-body">
                {/* Section: Customer & Service */}
                <div className="order-section">
                  <div className="order-section-title">Client & Service</div>
                  <div className="form-row">
                    {serviceTypes.length > 0 && (
                      <div className="form-group">
                        <label>Service Type *</label>
                        <select
                          className="form-control"
                          value={form.service_type_id}
                          onChange={(e) => setForm((f) => ({ ...f, service_type_id: e.target.value }))}
                          required={!editing}
                        >
                          <option value="">Select service</option>
                          {serviceTypes.map((service) => (
                            <option key={service.id} value={service.id}>
                              {service.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="form-group">
                      <label>Phone Number *</label>
                      <input
                        className="form-control"
                        placeholder="09171234567"
                        type="tel"
                        maxLength={11}
                        inputMode="numeric"
                        value={form.customer_phone}
                        onChange={(e) => {
                          // REMOVE NON-NUMBERS
                          const phone = e.target.value
                            .replace(/\D/g, "")
                            .slice(0, 11);

                          setForm((f) => ({
                            ...f,
                            customer_phone: phone,
                          }));

                          if (phone.length === 11) {
                            lookupPhone(phone);
                          } else {
                            setPhoneMatch(null);

                            setForm((f) => ({
                              ...f,
                              customer_id: "",
                              customer_name: "",
                              customer_email: "",
                            }));
                          }
                        }}
                        required
                      />
                      {phoneMatch && phoneMatch.id && (
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 12,
                            color: "#059669",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <CheckCircle2 size={13} /> Existing central client:{" "}
                          {phoneMatch.name}
                        </div>
                      )}
                      {phoneMatch === false &&
                        form.customer_phone.length >= 11 && (
                          <div
                            style={{
                              marginTop: 4,
                              fontSize: 12,
                              color: "#d97706",
                            }}
                          >
                            New client — will be registered automatically
                          </div>
                        )}
                      {phoneMatch?.crossBranch && (
                        <div style={{ marginTop: 4, fontSize: 12, color: "#2563eb" }}>
                          Existing central client found — this order will be linked to this branch without creating a duplicate.
                        </div>
                      )}
                    </div>
                    <div className="form-group">
                      <label>Client Name *</label>
                      <input
                        className="form-control"
                        placeholder="Juan Dela Cruz"
                        value={form.customer_name}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            customer_name: e.target.value,
                          }))
                        }
                        required
                        disabled={!!(phoneMatch && phoneMatch.id)}
                      />
                    </div>
                    {isAdmin && (
                      <div className="form-group">
                        <label>Branch *</label>
                        <select
                          className="form-control"
                          value={form.branch}
                          onChange={(e) =>
<<<<<<< HEAD
                            setForm((f) => ({ ...f, branch: e.target.value, addons: {} }))
=======
                            setForm((f) => ({ ...f, branch: e.target.value }))
>>>>>>> 728e40e (Fixed)
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
                  </div>
                  {/* Show email input for new clients */}
                  {phoneMatch === false && form.customer_phone.length >= 11 && (
                    <div className="form-group">
                      <label>Client Email</label>
                      <input
                        className="form-control"
                        type="email"
                        placeholder="email@example.com"
                        value={form.customer_email}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            customer_email: e.target.value,
                          }))
                        }
                      />
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--text-muted)",
                          marginTop: 2,
                          display: "block",
                        }}
                      >
                        <Mail
                          size={11}
                          style={{
                            display: "inline",
                            verticalAlign: "middle",
                            marginRight: 4,
                          }}
                        />
                        For pickup notifications
                      </span>
                    </div>
                  )}
                  <div className="form-row">
                    <div className="form-group">
                      <label>Weight (kg) *</label>
                      <input
                        className="form-control"
                        type="number"
                        step="0.1"
                        min="0.1"
                        placeholder="e.g. 3.5"
                        value={form.weight_kg}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, weight_kg: e.target.value }))
                        }
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Section: Add-ons */}
                <div className="order-section">
                  <div className="order-section-title">
                    Add-ons{" "}
                    <span className="order-section-optional">
                      ₱{SOAP_PRICE} each
                    </span>
                  </div>
                  <div className="addon-grid">
                    {branchInventoryItems.map((item) => {
                      const qty = form.addons[item.id] || 0;
                      const noStock = item.current_stock < 1 && qty === 0;
                      return (
                        <div
                          key={item.id}
                          className={`addon-item ${qty > 0 ? "selected" : ""} ${noStock ? "out-of-stock" : ""}`}
                        >
                          <div className="addon-info">
                            <span className="addon-name">{item.name}</span>
                            <span className="addon-stock">
                              {item.current_stock} {item.unit} in stock
                            </span>
                          </div>
                          <div className="addon-qty">
                            {qty > 0 && (
                              <button
                                type="button"
                                className="addon-btn"
                                onClick={() => updateAddon(item.id, -1)}
                              >
                                <Minus size={14} />
                              </button>
                            )}
                            {qty > 0 && (
                              <span className="addon-count">{qty}</span>
                            )}
                            <button
                              type="button"
                              className="addon-btn addon-btn-add"
                              onClick={() => updateAddon(item.id, 1)}
                              disabled={noStock || qty >= item.current_stock}
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {Object.keys(form.addons).length > 0 && (
                    <div className="soap-selected-info">
                      <CheckCircle2 size={15} />
                      <span>
                        {Object.entries(form.addons)
                          .filter(([, qty]) => qty > 0)
                          .map(([id, qty]) => {
                            const item = branchInventoryItems.find(
                              (i) => String(i.id) === String(id),
                            );
                            return `${item?.name || "Item"} ×${qty}`;
                          })
                          .join(", ")}{" "}
                        — will be deducted from inventory
                      </span>
                    </div>
                  )}
                </div>

                {/* Price Breakdown */}
                <div className="order-section">
                  <div className="pricing-card">
                    <div className="pricing-header">Price Breakdown</div>
                    <div className="pricing-row">
                      <span>
                        Laundry (
                        {form.weight_kg
                          ? parseFloat(form.weight_kg) <= BUNDLE_KG
                            ? `₱${BUNDLE_PRICE} minimum (${BUNDLE_KG}kg below)`
                            : `₱${BUNDLE_PRICE} + ₱${EXCESS_KG_PRICE}/kg excess`
                          : `₱${BUNDLE_PRICE} minimum for ${BUNDLE_KG}kg`}
                        )
                      </span>
                      <span>
                        ₱
                        {form.weight_kg
                          ? (() => {
                              const weight = parseFloat(form.weight_kg) || 0;

                              if (weight <= BUNDLE_KG) {
                                return BUNDLE_PRICE;
                              }

                              return (
                                BUNDLE_PRICE +
                                Math.ceil(weight - BUNDLE_KG) * EXCESS_KG_PRICE
                              );
                            })().toLocaleString()
                          : "0"}
                      </span>
                    </div>
                    {Object.entries(form.addons)
                      .filter(([, qty]) => qty > 0)
                      .map(([id, qty]) => {
                        const item = branchInventoryItems.find((i) => i.id === id);
                        return (
                          <div key={id} className="pricing-row">
                            <span>
                              {item?.name || "Add-on"} ×{qty}
                            </span>
                            <span>₱{(qty * SOAP_PRICE).toLocaleString()}</span>
                          </div>
                        );
                      })}
                    <div className="pricing-total">
                      <span>Total</span>
                      <span>
                        ₱
                        {calcPrice(
                          parseFloat(form.weight_kg) || 0,
                          form.addons,
                        ).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Section: Payment */}
                <div className="order-section">
                  <div className="order-section-title">
                    Payment{" "}
                    <span className="order-section-optional">
                      Min. 50% required
                    </span>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Method</label>
                      <select
                        className="form-control"
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                      >
                        <option value="cash">Cash</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Amount Paid (₱) *</label>
                      <input
                        className="form-control"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={form.amount_paid}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            amount_paid: e.target.value,
                          }))
                        }
                        required
                      />
                      {(() => {
                        const total = calcPrice(
                          parseFloat(form.weight_kg) || 0,
                          form.addons,
                        );
                        const paid = parseFloat(form.amount_paid) || 0;
                        const minRequired = total * 0.5;
                        const status =
                          paid <= 0
                            ? "unpaid"
                            : paid >= total
                              ? "paid"
                              : "partial";
                        if (!form.weight_kg || total <= 0) return null;
                        return (
                          <div
                            style={{
                              marginTop: 6,
                              fontSize: 12,
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <span className={`badge badge-${status}`}>
                              {status}
                            </span>
                            {paid < minRequired && (
                              <span style={{ color: "var(--danger)" }}>
                                Min: ₱{minRequired.toLocaleString()}
                              </span>
                            )}
                            {paid >= minRequired && paid < total && (
                              <span style={{ color: "#d97706" }}>
                                Balance: ₱{(total - paid).toLocaleString()}
                              </span>
                            )}
                            {paid >= total && (
                              <span style={{ color: "#059669" }}>
                                Fully paid
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Notes</label>
                  <textarea
                    className="form-control"
                    placeholder="Special instructions..."
                    rows={2}
                    value={form.notes}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, notes: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="order-modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editing ? "Update Order" : "Create Order"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showPaymentModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowPaymentModal(false)}
        >
          <div className="order-modal" onClick={(e) => e.stopPropagation()}>
            <div className="order-modal-header">
              <h3>Complete Payment</h3>
              <button
                className="btn-icon"
                onClick={() => setShowPaymentModal(false)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="order-modal-body">
              <div className="form-group">
                <label>Remaining Amount</label>
                <input
                  className="form-control"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  type="number"
                />
              </div>

              <div className="form-group">
                <label>Payment Method</label>
                <select
                  className="form-control"
                  value={form.payment_method}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      payment_method: e.target.value,
                    }))
                  }
                >
                  <option value="cash">Cash</option>
                </select>
              </div>
            </div>

            <div className="order-modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowPaymentModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={completePaymentAndRelease}
              >
                Confirm & Release
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
