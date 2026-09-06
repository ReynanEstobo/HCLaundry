import { differenceInDays, format, startOfToday } from "date-fns";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Brain,
  CheckCircle2,
  Clock,
  DollarSign,
  Lightbulb,
  Package,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "../lib/supabase";
import { useRealtime } from "../lib/useRealtime";
import { askGemini } from "../services/geminiService";
import { PageError, PageLoader } from "../components/AsyncState";

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    todayOrders: 0,
    todayRevenue: 0,
    totalCustomers: 0,
    activeOrders: 0,
    readyForPickup: 0,
    lowStockItems: 0,
  });
  const [recentOrders, setRecentOrders] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [aiInsights, setAiInsights] = useState("");
  const [currentAIModel, setCurrentAIModel] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [weeklyData, setWeeklyData] = useState([]);
  const [settings, setSettings] = useState({});
  const [range, setRange] = useState("weekly");
  const [suggestions, setSuggestions] = useState([]);
  const [forecasts, setForecasts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aiUsage, setAiUsage] = useState({ count: 0, limit: 20 });

  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const isFirstDashboardEffect = useRef(true);

  useEffect(() => {
    // The one-time effect below performs the initial load with AI insights.
    // Skip this effect's first run so the same dashboard queries are not doubled.
    if (isFirstDashboardEffect.current) {
      isFirstDashboardEffect.current = false;
      return;
    }
    loadDashboard(false);
  }, [range, page]);

  useEffect(() => {
    loadDashboard(true); // ✅ run AI only once
  }, []);

  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Realtime: refresh dashboard when orders or inventory change
  const loadDashboardCb = useCallback(() => loadDashboard(false), []);
  useRealtime(["orders", "customers", "inventory_items"], loadDashboardCb);

  function buildChartData(orders, range) {
    const data = [];
    const now = new Date();

    if (range === "weekly") {
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(now.getDate() - i);

        const dayOrders = orders.filter(
          (o) => new Date(o.created_at).toDateString() === date.toDateString(),
        );

        data.push({
          label: format(date, "EEE"),
          orders: dayOrders.length,
          revenue: dayOrders.reduce((s, o) => s + Number(o.total_price), 0),
        });
      }
    }
    if (range === "monthly") {
      for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(now.getDate() - i);

        const dayOrders = orders.filter(
          (o) => new Date(o.created_at).toDateString() === date.toDateString(),
        );

        data.push({
          label: format(date, "MMM d"),
          orders: dayOrders.length,
          revenue: dayOrders.reduce((s, o) => s + Number(o.total_price), 0),
        });
      }
    }

    if (range === "yearly") {
      const currentYear = new Date().getFullYear();
      const startYear = currentYear - 4; // 🔥 last 5 years only

      for (let year = startYear; year <= currentYear; year++) {
        const yearOrders = orders.filter(
          (o) => new Date(o.created_at).getFullYear() === year,
        );

        data.push({
          label: String(year),
          orders: yearOrders.length,
          revenue: yearOrders.reduce((s, o) => s + Number(o.total_price), 0),
        });
      }
    }

    return data;
  }

  async function loadDashboard(runAI = true) {
    if (isInitialLoad) setLoading(true);
    setLoadError("");
    setIsInitialLoad(false);
    try {
    const today = startOfToday().toISOString();

    const [
      ordersRes,
      customersRes,
      inventoryRes,
      recentRes,
      usageRes,
      categoriesRes,
    ] = await Promise.all([
      supabase.from("orders").select("*"),
      supabase.from("customers").select("id", { count: "exact", head: true }),
      supabase.from("inventory_items").select("*, inventory_categories(name)"),
      supabase
        .from("orders")
        .select("*, customers(name, phone), service_types(name)", {
          count: "exact",
        })
        // ✅ ADD THIS
        .order("status", { ascending: true }) // NOT released first
        .order("created_at", { ascending: true }) // oldest first
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1),
      supabase
        .from("inventory_usage_log")
        .select("*")
        .order("logged_at", { ascending: false })
        .limit(500),
      supabase.from("inventory_categories").select("*"),
    ]);
    const { data: settingsData } = await supabase
      .from("settings")
      .select("*")
      .single();

    const requestError = ordersRes.error || customersRes.error || inventoryRes.error || recentRes.error || usageRes.error || categoriesRes.error;
    if (requestError) throw requestError;

    setSettings(settingsData || {});

    const orders = ordersRes.data || [];
    const inventory = inventoryRes.data || [];
    const usageLogs = usageRes.data || [];
    const reportableOrders = orders.filter((o) => o.status !== "cancelled");
    const todayOrders = reportableOrders.filter((o) => o.created_at >= today);
    const todayRevenue = todayOrders
      .filter((o) => o.payment_status === "paid")
      .reduce((sum, o) => sum + Number(o.total_price), 0);
    const activeOrders = orders.filter(
      (o) => !["released", "cancelled"].includes(o.status),
    ).length;
    const readyForPickup = orders.filter((o) => o.status === "ready").length;
    const lowStockItems = inventory.filter(
      (i) => Number(i.current_stock) <= Number(i.minimum_stock),
    ).length;

    setStats({
      todayOrders: todayOrders.length,
      todayRevenue,
      totalCustomers: customersRes.count || 0,
      activeOrders,
      readyForPickup,
      lowStockItems,
    });

    const sorted = (recentRes.data || []).sort((a, b) => {
      // 1. Non-released first
      const aReleased = a.status === "released";
      const bReleased = b.status === "released";

      if (aReleased !== bReleased) {
        return aReleased ? 1 : -1;
      }

      // 2. Oldest first
      return new Date(a.created_at) - new Date(b.created_at);
    });

    setRecentOrders(sorted);

    setTotalCount(recentRes.count || 0);
    // Generate smart suggestions
    const tips = generateSuggestions(
      inventory,
      usageLogs,
      orders,
      readyForPickup,
    );
    setSuggestions(tips);

    // Generate AI forecasts
    const fc = generateForecasts(orders, inventory, usageLogs);
    setForecasts(fc);

    // 🔥 GEMINI AI (Decision Support Layer)
    // 🔥 Gemini AI (Decision Support Layer - optimized)
    if (runAI && !aiInsights) {
      try {
        setAiLoading(true);

        const aiResult = await askGemini(`
You are a business decision support AI for a laundry shop.

Data:
- Total Orders: ${orders.length}
- Today's Revenue: ${todayRevenue}
- Active Orders: ${activeOrders}
- Ready for Pickup: ${readyForPickup}
- Low Stock Items: ${lowStockItems}

Forecast:
- Workload: ${fc.workloadLevel} (${fc.workloadPct}%)
- Predicted Monthly Revenue: ${fc.predictedMonthlyRevenue}
- Peak Day: ${fc.peakDay}

Give exactly 3 insights ONLY using this format:

Operational Recommendation: ...
Inventory Recommendation: ...
Revenue Improvement Idea: ...

Do NOT use bullet points.
Do NOT use markdown (**).
Do NOT add extra text.
`);

        if (aiResult) {
          setAiInsights(aiResult.text);
          setCurrentAIModel(aiResult.model);
        } else {
          setAiInsights(
            "AI insights temporarily unavailable. All AI models have reached their limits.",
          );

          setCurrentAIModel("No Active Model");
        }
      } catch (error) {
        console.error("AI error:", error);

        setAiInsights(
          "AI insights temporarily unavailable due to API limit. Please try again later.",
        );
      } finally {
        setAiLoading(false);
      }
    }

    setWeeklyData(buildChartData(orders, range));
    } catch (error) {
      setLoadError(error.message || "Unable to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }

  function generateForecasts(orders, inventory, usageLogs) {
    const now = new Date();
    // Forecasts must not treat cancelled transactions as business activity.
    const reportableOrders = orders.filter((order) => order.status !== "cancelled");

    // --- Workload prediction (next 7 days) ---
    // Calculate avg daily orders from last 30 days
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const last30 = reportableOrders.filter(
      (o) => new Date(o.created_at) >= thirtyDaysAgo,
    );
    const avgDailyOrders = last30.length / 30;

    // Check day-of-week pattern for tomorrow
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDow = tomorrow.getDay();
    const sameDayOrders = reportableOrders.filter(
      (o) => new Date(o.created_at).getDay() === tomorrowDow,
    );
    const avgDowOrders =
      sameDayOrders.length > 0
        ? sameDayOrders.length / Math.max(Math.ceil(reportableOrders.length / 7), 1)
        : avgDailyOrders;

    // Workload level
    let workloadPct = Math.min(
      Math.round((avgDowOrders / Math.max(avgDailyOrders, 1)) * 100),
      100,
    );
    if (avgDailyOrders === 0) workloadPct = 0;
    let workloadLevel = "Low";
    if (workloadPct >= 80) workloadLevel = "High Demand";
    else if (workloadPct >= 50) workloadLevel = "Moderate";
    else if (workloadPct >= 20) workloadLevel = "Normal";

    // --- Revenue prediction (next month) ---
    const paidOrders = reportableOrders.filter((o) => o.payment_status === "paid");
    const totalRevenue = paidOrders.reduce(
      (s, o) => s + Number(o.total_price),
      0,
    );
    const oldestOrder =
      reportableOrders.length > 0
        ? new Date(Math.min(...reportableOrders.map((o) => new Date(o.created_at))))
        : now;
    const daysOfData = Math.max(differenceInDays(now, oldestOrder), 1);
    const dailyRevenue = totalRevenue / daysOfData;
    const predictedMonthlyRevenue = Math.round(dailyRevenue * 30);

    // Revenue trend (comparing last 15 days vs previous 15 days)
    const fifteenDaysAgo = new Date(now);
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
    const thirtyDaysAgoDt = new Date(now);
    thirtyDaysAgoDt.setDate(thirtyDaysAgoDt.getDate() - 30);
    const recent15 = paidOrders.filter(
      (o) => new Date(o.created_at) >= fifteenDaysAgo,
    );
    const prev15 = paidOrders.filter(
      (o) =>
        new Date(o.created_at) >= thirtyDaysAgoDt &&
        new Date(o.created_at) < fifteenDaysAgo,
    );
    const recent15Rev = recent15.reduce((s, o) => s + Number(o.total_price), 0);
    const prev15Rev = prev15.reduce((s, o) => s + Number(o.total_price), 0);
    const revenueTrend =
      prev15Rev > 0
        ? (((recent15Rev - prev15Rev) / prev15Rev) * 100).toFixed(1)
        : 0;

    // --- Restock predictions ---
    const restockAlerts = [];
    inventory.forEach((item) => {
      const itemLogs = usageLogs.filter((l) => l.item_id === item.id);
      if (itemLogs.length >= 2) {
        const sorted = [...itemLogs].sort(
          (a, b) => new Date(a.logged_at) - new Date(b.logged_at),
        );
        const daysDiff = Math.max(
          differenceInDays(
            new Date(sorted[sorted.length - 1].logged_at),
            new Date(sorted[0].logged_at),
          ),
          1,
        );
        const totalUsed = itemLogs.reduce(
          (s, l) => s + Number(l.quantity_used),
          0,
        );
        const dailyUsage = totalUsed / daysDiff;
        if (dailyUsage > 0) {
          const daysLeft = Math.floor(Number(item.current_stock) / dailyUsage);
          if (daysLeft <= 14) {
            const suggestedReorder = Math.ceil(dailyUsage * 30);
            restockAlerts.push({
              name: item.name,
              daysLeft,
              unit: item.unit,
              suggestedReorder,
              currentStock: Number(item.current_stock),
            });
          }
        }
      }
    });
    restockAlerts.sort((a, b) => a.daysLeft - b.daysLeft);

    // --- Peak day prediction ---
    const dowCounts = [0, 0, 0, 0, 0, 0, 0];
    orders.forEach((o) => {
      dowCounts[new Date(o.created_at).getDay()]++;
    });
    const dayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const peakDayIdx = dowCounts.indexOf(Math.max(...dowCounts));
    const peakDay = dayNames[peakDayIdx];

    return {
      workloadPct,
      workloadLevel,
      predictedMonthlyRevenue,
      revenueTrend: Number(revenueTrend),
      restockAlerts: restockAlerts.slice(0, 3),
      peakDay,
      avgDailyOrders: Math.round(avgDailyOrders),
    };
  }

  function generateSuggestions(inventory, usageLogs, orders, readyCount) {
    const tips = [];

    // 1. Low stock / out of stock items - suggest buying
    const lowItems = inventory.filter(
      (i) => Number(i.current_stock) <= Number(i.minimum_stock),
    );
    const outOfStock = inventory.filter((i) => Number(i.current_stock) === 0);

    if (outOfStock.length > 0) {
      tips.push({
        type: "critical",
        icon: AlertTriangle,
        title: "Out of Stock!",
        message: `Buy ${outOfStock.map((i) => i.name).join(", ")} immediately — you have zero stock remaining.`,
        action: "Go to Inventory",
        link: "/dashboard/inventory",
      });
    }

    if (lowItems.length > 0 && outOfStock.length !== lowItems.length) {
      const needRestock = lowItems.filter((i) => Number(i.current_stock) > 0);
      if (needRestock.length > 0) {
        tips.push({
          type: "warning",
          icon: ShoppingCart,
          title: "Restock Needed",
          message: `Running low on ${needRestock.map((i) => `${i.name} (${i.current_stock} ${i.unit} left)`).join(", ")}. Consider restocking soon.`,
          action: "Restock Now",
          link: "/dashboard/inventory",
        });
      }
    }

    // 2. Stock prediction - items that will run out within 7 days
    inventory.forEach((item) => {
      const itemLogs = usageLogs.filter((l) => l.item_id === item.id);
      if (itemLogs.length >= 2) {
        const sorted = [...itemLogs].sort(
          (a, b) => new Date(a.logged_at) - new Date(b.logged_at),
        );
        const daysDiff = Math.max(
          differenceInDays(
            new Date(sorted[sorted.length - 1].logged_at),
            new Date(sorted[0].logged_at),
          ),
          1,
        );
        const totalUsed = itemLogs.reduce(
          (s, l) => s + Number(l.quantity_used),
          0,
        );
        const dailyUsage = totalUsed / daysDiff;
        if (dailyUsage > 0) {
          const daysLeft = Math.floor(Number(item.current_stock) / dailyUsage);
          if (
            daysLeft <= 7 &&
            daysLeft > 0 &&
            !lowItems.find((l) => l.id === item.id)
          ) {
            tips.push({
              type: "warning",
              icon: TrendingUp,
              title: `${item.name} Running Out`,
              message: `Based on usage trends, ${item.name} will run out in ~${daysLeft} day${daysLeft !== 1 ? "s" : ""}. Buy more to avoid shortage.`,
              action: "View Predictions",
              link: "/dashboard/inventory",
            });
          }
        }
      }
    });

    // 3. Ready for pickup - notify customers
    if (readyCount > 0) {
      tips.push({
        type: "info",
        icon: Bell,
        title: `${readyCount} Order${readyCount > 1 ? "s" : ""} Ready for Pickup`,
        message: `Send Email notifications to customers about their completed laundry. Don't keep them waiting!`,
        action: "Send Notifications",
        link: "/dashboard/sms",
      });
    }

    // 4. Unpaid orders
    const unpaidOrders = orders.filter(
      (o) => o.payment_status === "unpaid" && o.status !== "cancelled",
    );
    if (unpaidOrders.length > 0) {
      const unpaidTotal = unpaidOrders.reduce(
        (s, o) => s + Number(o.total_price),
        0,
      );
      tips.push({
        type: "warning",
        icon: DollarSign,
        title: `${unpaidOrders.length} Unpaid Order${unpaidOrders.length > 1 ? "s" : ""}`,
        message: `You have ₱${unpaidTotal.toLocaleString()} in outstanding payments. Follow up with customers to collect.`,
        action: "View Orders",
        link: "/dashboard/orders",
      });
    }

    // 5. No inventory set up yet
    if (inventory.length === 0) {
      tips.push({
        type: "info",
        icon: Package,
        title: "Set Up Your Inventory",
        message:
          "Add your supplies like detergent sachets, fabric softener, plastic bags, and hangers to track stock levels and get restock alerts.",
        action: "Add Items",
        link: "/dashboard/inventory",
      });
    }

    // 6. If everything is fine
    if (tips.length === 0) {
      tips.push({
        type: "success",
        icon: CheckCircle2,
        title: "All Good!",
        message:
          "Everything is running smoothly. Inventory is stocked, no pending actions needed.",
        action: null,
        link: null,
      });
    }

    return tips;
  }

  function getStatusColor(status) {
    return `badge badge-${status}`;
  }

  function getTimeRemaining(order, settings) {
    if (!order.stage_started_at) return "Waiting start";

    const stageStart = new Date(order.stage_started_at).getTime();
    const now = Date.now();

    const durations = {
      washing: (Number(settings.etawash) || 45) * 60000,
      drying: (Number(settings.etadrying) || 40) * 60000,
      folding: (Number(settings.etafolding) || 15) * 60000,
    };

    const duration = durations[order.status];
    if (!duration) return "";

    const remaining = stageStart + duration - now;

    if (remaining <= 0) return "Advancing...";

    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);

    return `${minutes}m ${seconds}s`;
  }

  if (loading) return <PageLoader label="Loading dashboard…" />;
  if (loadError) return <PageError message={loadError} onRetry={() => loadDashboard(false)} />;

  return (
    <>
      <div className="stats-grid">
        <div className="stat-card blue">
          <div className="stat-icon">
            <ShoppingBag size={22} />
          </div>
          <div className="stat-value">{stats.todayOrders}</div>
          <div className="stat-label">Today's Orders</div>
        </div>
        <div className="stat-card green">
          <div className="stat-icon">
            <DollarSign size={22} />
          </div>
          <div className="stat-value">
            ₱{stats.todayRevenue.toLocaleString()}
          </div>
          <div className="stat-label">Today's Revenue</div>
        </div>
        <div className="stat-card cyan">
          <div className="stat-icon">
            <Users size={22} />
          </div>
          <div className="stat-value">{stats.totalCustomers}</div>
          <div className="stat-label">Total Customers</div>
        </div>
        <div className="stat-card amber">
          <div className="stat-icon">
            <Clock size={22} />
          </div>
          <div className="stat-value">{stats.activeOrders}</div>
          <div className="stat-label">Active Orders</div>
        </div>
        <div className="stat-card green">
          <div className="stat-icon">
            <CheckCircle2 size={22} />
          </div>
          <div className="stat-value">{stats.readyForPickup}</div>
          <div className="stat-label">Ready for Pickup</div>
        </div>
        <div className="stat-card red">
          <div className="stat-icon">
            <AlertTriangle size={22} />
          </div>
          <div className="stat-value">{stats.lowStockItems}</div>
          <div className="stat-label">Low Stock Items</div>
        </div>
      </div>

      {/* Smart Suggestions */}
      {suggestions.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Lightbulb size={18} style={{ color: "#f59e0b" }} />
              Suggestions & Alerts
            </h3>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {suggestions.map((tip, idx) => {
              const TipIcon = tip.icon;
              const colors = {
                critical: {
                  bg: "#fef2f2",
                  border: "#fecaca",
                  icon: "#dc2626",
                  text: "#991b1b",
                },
                warning: {
                  bg: "#fffbeb",
                  border: "#fde68a",
                  icon: "#d97706",
                  text: "#92400e",
                },
                info: {
                  bg: "#eef8fd",
                  border: "#b3e0f5",
                  icon: "#2EA7E0",
                  text: "#1a7da8",
                },
                success: {
                  bg: "#ecfdf5",
                  border: "#a7f3d0",
                  icon: "#059669",
                  text: "#065f46",
                },
              };
              const c = colors[tip.type] || colors.info;
              return (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "14px 16px",
                    borderRadius: 10,
                    background: c.bg,
                    border: `1px solid ${c.border}`,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: "white",
                      border: `1px solid ${c.border}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <TipIcon size={18} style={{ color: c.icon }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 14,
                        color: c.text,
                        marginBottom: 2,
                      }}
                    >
                      {tip.title}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: "#4b5563",
                        lineHeight: 1.5,
                      }}
                    >
                      {tip.message}
                    </div>
                  </div>
                  {tip.action && tip.link && (
                    <button
                      className="btn btn-sm"
                      onClick={() => navigate(tip.link)}
                      style={{
                        background: "white",
                        border: `1px solid ${c.border}`,
                        color: c.text,
                        fontWeight: 600,
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {tip.action} <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AI Forecasting Overview */}
      {forecasts && (
        <div className="card" style={{ marginBottom: 24, overflow: "hidden" }}>
          <div className="card-header">
            <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Brain size={18} style={{ color: "#8b5cf6" }} />
              Decision Support Overview
            </h3>
            <span
              className="badge"
              style={{ background: "#f3f0ff", color: "#7c3aed", fontSize: 11 }}
            >
              <Zap size={12} /> Predictions
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Predicted Workload */}

            {/* Predicted Revenue */}
            <div className="forecast-row forecast-revenue">
              <div
                className="forecast-icon-wrap"
                style={{
                  background: "rgba(16,185,129,0.12)",
                  color: "#10b981",
                }}
              >
                <TrendingUp size={20} />
              </div>
              <div className="forecast-content">
                <span className="forecast-label">Predicted Revenue:</span>
                <strong className="forecast-value" style={{ color: "#10b981" }}>
                  ₱{forecasts.predictedMonthlyRevenue.toLocaleString()}
                </strong>
                <span className="forecast-sublabel">Next Month</span>
                {forecasts.revenueTrend !== 0 && (
                  <span
                    className={`forecast-trend ${forecasts.revenueTrend > 0 ? "up" : "down"}`}
                  >
                    {forecasts.revenueTrend > 0 ? "↑" : "↓"}{" "}
                    {Math.abs(forecasts.revenueTrend)}%
                  </span>
                )}
              </div>
            </div>

            {/* Restock Alerts */}
            {forecasts.restockAlerts.length > 0 &&
              forecasts.restockAlerts.map((item, i) => (
                <div className="forecast-row forecast-restock" key={i}>
                  <div
                    className="forecast-icon-wrap"
                    style={{
                      background: "rgba(245,158,11,0.12)",
                      color: "#f59e0b",
                    }}
                  >
                    <AlertTriangle size={20} />
                  </div>
                  <div className="forecast-content">
                    <span className="forecast-label">Restock Alert:</span>
                    <span className="forecast-restock-text">
                      <strong>{item.name}</strong> will run out in{" "}
                      <strong>
                        {item.daysLeft} day{item.daysLeft !== 1 ? "s" : ""}
                      </strong>
                    </span>
                    <span className="forecast-sublabel">
                      Reorder ~{item.suggestedReorder} {item.unit}
                    </span>
                  </div>
                  <button
                    className="btn btn-sm"
                    onClick={() => navigate("/dashboard/inventory")}
                    style={{ flexShrink: 0, fontSize: 12 }}
                  >
                    Restock <ArrowRight size={13} />
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}
      {(aiLoading || aiInsights) && (
        <div
          className="card"
          style={{
            marginBottom: 24,
            border: "1px solid #e9d5ff",
            background: "linear-gradient(135deg, #faf5ff, #ffffff)",
          }}
        >
          {/* HEADER */}
          <div className="card-header">
            <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Brain size={18} style={{ color: "#8b5cf6" }} />
              AI Insights
            </h3>

            <span
              className="badge"
              style={{
                background: "#ede9fe",
                color: "#7c3aed",
                fontSize: 11,
              }}
            >
              {currentAIModel || "Loading Model..."}
            </span>
          </div>

          {/* CONTENT */}
          {aiLoading ? (
            // 🔥 LOADING SKELETON
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    height: 60,
                    borderRadius: 12,
                    background:
                      "linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)",
                    backgroundSize: "200% 100%",
                    animation: "shimmer 1.5s infinite",
                  }}
                />
              ))}
            </div>
          ) : (
            // 🔥 YOUR EXISTING AI CONTENT
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {aiInsights
                .split(
                  /(?=Operational Recommendation:|Inventory Recommendation:|Revenue Improvement Idea:)/,
                )
                .map((line, i) => {
                  if (!line.trim()) return null;

                  const clean = line.replace(/\*\*/g, "").trim();

                  let icon = Lightbulb;
                  let color = "#8b5cf6";
                  let bg = "#faf5ff";

                  if (clean.toLowerCase().includes("operational")) {
                    icon = Zap;
                    color = "#3b82f6";
                    bg = "#eff6ff";
                  } else if (clean.toLowerCase().includes("inventory")) {
                    icon = Package;
                    color = "#f59e0b";
                    bg = "#fffbeb";
                  } else if (clean.toLowerCase().includes("revenue")) {
                    icon = TrendingUp;
                    color = "#10b981";
                    bg = "#ecfdf5";
                  }

                  const Icon = icon;

                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        gap: 12,
                        padding: "14px 16px",
                        borderRadius: 12,
                        background: bg,
                        border: "1px solid rgba(0,0,0,0.05)",
                      }}
                    >
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          background: "white",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Icon size={18} style={{ color }} />
                      </div>

                      <div>
                        <div style={{ fontWeight: 600, color }}>
                          {clean.split(":")[0]}
                        </div>
                        <div style={{ fontSize: 13.5, color: "#374151" }}>
                          {clean.split(":").slice(1).join(":")}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
      <div style={{ marginBottom: 10 }}>
        {["weekly", "monthly", "yearly"].map((r) => (
          <button
            key={r}
            className={`btn btn-sm ${range === r ? "btn-primary" : ""}`}
            onClick={() => setRange(r)}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="charts-grid">
        <div className="card">
          <div className="card-header">
            <h3>{range.charAt(0).toUpperCase() + range.slice(1)} Orders</h3>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={weeklyData}>
              <XAxis
                dataKey="label"
                stroke="#64748b"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#64748b"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  color: "#111827",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                  fontSize: 13,
                }}
              />
              <Bar dataKey="orders" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>
              {range.charAt(0).toUpperCase() + range.slice(1)} Revenue Trend
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={weeklyData}>
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                stroke="#9ca3af"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#9ca3af"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  color: "#111827",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                  fontSize: 13,
                }}
                formatter={(value) => [`₱${value.toLocaleString()}`, "Revenue"]}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#10b981"
                fill="url(#revenueGrad)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Recent Orders</h3>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Order #</th>
                <th>Customer</th>

                <th>Status</th>
                <th>Time Left</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      textAlign: "center",
                      padding: 40,
                      color: "var(--text-muted)",
                    }}
                  >
                    No orders yet
                  </td>
                </tr>
              ) : (
                recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td
                      style={{ fontWeight: 600, color: "var(--text-primary)" }}
                    >
                      {order.order_number}
                    </td>
                    <td>{order.customers?.name || "Walk-in"}</td>

                    <td>
                      <span className={getStatusColor(order.status)}>
                        {order.status.replace("_", " ")}
                      </span>
                    </td>
                    <td>
                      {order.status === "released" ||
                      order.status === "cancelled" ? (
                        "—"
                      ) : (
                        <span
                          style={{
                            color: "var(--primary-light)",
                            fontWeight: 600,
                          }}
                        >
                          <span>
                            {getTimeRemaining(order, settings)} {tick && ""}
                          </span>
                        </span>
                      )}
                    </td>
                    <td
                      style={{ fontWeight: 600, color: "var(--text-primary)" }}
                    >
                      ₱{Number(order.total_price).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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

                // Always show max 3 pages
                let start = Math.max(0, page - 1);
                let end = Math.min(totalPages, start + 3);

                // Adjust if near end
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
                onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
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
              {totalCount === 0
                ? "0 of 0"
                : `${page * PAGE_SIZE + 1}–${Math.min(
                    (page + 1) * PAGE_SIZE,
                    totalCount,
                  )} out of ${totalCount}`}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
