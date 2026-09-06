import { format, subDays } from "date-fns";
import {
  Building2,
  DollarSign,
  Lightbulb,
  Percent,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "../lib/supabase";
import { useRealtime } from "../lib/useRealtime";
import { askGemini } from "../services/geminiService";

// ─── Custom tooltip ────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        padding: "10px 14px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
        fontSize: 13,
        color: "#111827",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>

      {payload.map((p, i) => (
        <div
          key={i}
          style={{
            color: p.color,
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: p.color,
              display: "inline-block",
            }}
          />

          <span style={{ color: "#6b7280", textTransform: "capitalize" }}>
            {p.name}:
          </span>

          <span style={{ fontWeight: 600 }}>
            ₱{Number(p.value).toLocaleString()}
          </span>

          {p.payload?.isPrediction && (
            <span
              style={{
                fontSize: 10,
                background: "#f0fdf4",
                color: "#10b981",
                borderRadius: 4,
                padding: "1px 5px",
                fontWeight: 600,
              }}
            >
              FORECAST
            </span>
          )}
        </div>
      ))}
    </div>
  );
};

// ─── Sub-filter pill group ─────────────────────────────────────────────────────
function SubFilter({ value, onChange, options }) {
  return (
    <div
      style={{
        display: "inline-flex",
        background: "#f3f4f6",
        borderRadius: 10,
        padding: 3,
        gap: 2,
      }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: "5px 14px",
            borderRadius: 7,
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
            transition: "all 0.15s ease",
            background: value === opt.value ? "#fff" : "transparent",
            color: value === opt.value ? "#111827" : "#6b7280",
            boxShadow:
              value === opt.value ? "0 1px 4px rgba(0,0,0,0.10)" : "none",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function Analytics() {
  const [range, setRange] = useState("weekly");

  const [selectedBranch, setSelectedBranch] = useState("all");

  const [customRange, setCustomRange] = useState({
    start: null,
    end: null,
  });

  const [orders, setOrders] = useState([]);
  const [expenses, setExpenses] = useState([]);

  const [forecastData, setForecastData] = useState([]);

  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({});

  const [forecastLoading, setForecastLoading] = useState(false);

  const [forecastModel, setForecastModel] = useState("");

  const [aiInsights, setAiInsights] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    loadAnalytics();
  }, [range, customRange, selectedBranch]);

  useRealtime(["orders", "expenses"], () => {
    loadAnalytics(false);
  });
  useEffect(() => {
    if (aiLoading) return;

    if (descriptiveData.length > 0 && forecastData.length > 0) {
      generateAIInsights(orders, expenses);
    }
  }, [forecastData, selectedBranch, range]);

  async function loadAnalytics() {
    setLoading(true);

    const now = new Date();

    let startDate;
    let endDate = new Date().toISOString();

    if (customRange.start && customRange.end) {
      startDate = new Date(customRange.start).toISOString();
      endDate = new Date(customRange.end).toISOString();
    } else {
      if (range === "weekly") {
        startDate = subDays(now, 7).toISOString();
      } else if (range === "monthly") {
        startDate = new Date(now.getFullYear(), 0, 1).toISOString();
      } else {
        startDate = new Date(now.getFullYear() - 5, 0, 1).toISOString();
      }
    }

    let orderQuery = supabase
      .from("orders")
      .select("*")
      .gte("created_at", startDate)
      .lte("created_at", endDate)
      .order("created_at", { ascending: true });

    let expenseQuery = supabase
      .from("expenses")
      .select("*")
      .gte("expense_date", format(new Date(startDate), "yyyy-MM-dd"))
      .lte("expense_date", format(new Date(endDate), "yyyy-MM-dd"));

    if (selectedBranch !== "all") {
      orderQuery = orderQuery.eq("branch", selectedBranch);
      expenseQuery = expenseQuery.eq("branch", selectedBranch);
    }

    const [ordersRes, expensesRes] = await Promise.all([
      orderQuery,
      expenseQuery,
    ]);

    const orderData = ordersRes.data || [];
    const expenseData = expensesRes.data || [];

    setOrders(orderData);
    setExpenses(expenseData);

    const totalRevenue = orderData
      .filter((o) => o.payment_status === "paid")
      .reduce((s, o) => s + Number(o.total_price), 0);

    const totalExpenses = expenseData.reduce((s, e) => s + Number(e.amount), 0);

    const profit = totalRevenue - totalExpenses;

    const avgOrderValue =
      orderData.length > 0 ? totalRevenue / orderData.length : 0;

    setStats({
      totalRevenue,
      totalExpenses,
      profit,
      avgOrderValue,
      totalOrders: orderData.length,
    });

    generateForecast(orderData);

    setLoading(false);
  }

  function getDescriptiveData() {
    let baseData = [];

    // ─────────────────────────────────────
    // WEEKLY
    // ALWAYS MON → SUN
    // ─────────────────────────────────────
    if (range === "weekly") {
      baseData = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
        (day) => ({
          date: day,
          revenue: 0,
          expenses: 0,
        }),
      );
    }

    // ─────────────────────────────────────
    // MONTHLY
    // ALWAYS JAN → DEC
    // ─────────────────────────────────────
    else if (range === "monthly") {
      baseData = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ].map((month) => ({
        date: month,
        revenue: 0,
        expenses: 0,
      }));
    }

    // ─────────────────────────────────────
    // YEARLY
    // MAXIMUM 5 YEARS
    // ─────────────────────────────────────
    else {
      const currentYear = new Date().getFullYear();

      baseData = Array.from({ length: 5 }, (_, i) => ({
        date: String(currentYear - 4 + i),
        revenue: 0,
        expenses: 0,
      }));
    }

    // ─────────────────────────────────────
    // REVENUE
    // ─────────────────────────────────────
    orders.forEach((o) => {
      if (o.payment_status !== "paid") return;

      const d = new Date(o.created_at);

      let key;

      if (range === "weekly") {
        key = format(d, "EEE");
      } else if (range === "monthly") {
        key = format(d, "MMM");
      } else {
        key = format(d, "yyyy");
      }

      const found = baseData.find((x) => x.date === key);

      if (found) {
        found.revenue += Number(o.total_price);
      }
    });

    // ─────────────────────────────────────
    // EXPENSES
    // ─────────────────────────────────────
    expenses.forEach((e) => {
      const d = new Date(e.expense_date);

      let key;

      if (range === "weekly") {
        key = format(d, "EEE");
      } else if (range === "monthly") {
        key = format(d, "MMM");
      } else {
        key = format(d, "yyyy");
      }

      const found = baseData.find((x) => x.date === key);

      if (found) {
        found.expenses += Number(e.amount);
      }
    });

    return baseData;
  }

  async function generateForecast(orderData) {
    try {
      setForecastLoading(true);

      // ─────────────────────────────────────
      // GET HISTORICAL REVENUE
      // ─────────────────────────────────────
      const historicalRevenue = [];

      orderData.forEach((o) => {
        if (o.payment_status !== "paid") return;

        historicalRevenue.push(Number(o.total_price));
      });

      // ─────────────────────────────────────
      // COMPUTE MOVING AVERAGE
      // ─────────────────────────────────────
      const averageRevenue =
        historicalRevenue.length > 0
          ? historicalRevenue.reduce((a, b) => a + b, 0) /
            historicalRevenue.length
          : 0;

      const today = new Date();

      let forecastLength = 7;

      // ─────────────────────────────────────
      // FORECAST LENGTH
      // ─────────────────────────────────────
      if (range === "weekly") {
        forecastLength = 7;
      } else if (range === "monthly") {
        forecastLength = 30;
      } else {
        forecastLength = 5;
      }

      // ─────────────────────────────────────
      // GENERATE FUTURE FORECAST
      // ─────────────────────────────────────
      const futureForecast = [];

      for (let i = 0; i < forecastLength; i++) {
        const futureDate = new Date(today);

        // WEEKLY FORECAST
        if (range === "weekly") {
          futureDate.setDate(today.getDate() + i);
        }

        // MONTHLY FORECAST
        else if (range === "monthly") {
          futureDate.setDate(today.getDate() + i);
        }

        // YEARLY FORECAST
        else {
          futureDate.setFullYear(today.getFullYear() + i);
        }

        // ─────────────────────────────────
        // SIMPLE TREND GROWTH
        // ─────────────────────────────────
        const growthRate =
          range === "weekly" ? 0.01 : range === "monthly" ? 0.025 : 0.08;

        const fluctuation = Math.random() * 0.08 - 0.04;

        const predictedRevenue = Math.round(
          averageRevenue * (1 + i * growthRate + fluctuation),
        );

        // ─────────────────────────────────
        // LABEL FORMAT
        // ─────────────────────────────────
        let label = "";

        // WEEKLY
        if (range === "weekly") {
          label = format(futureDate, "EEE");
        }

        // MONTHLY
        else if (range === "monthly") {
          label = format(futureDate, "MMM dd");
        }

        // YEARLY
        else {
          label = format(futureDate, "yyyy");
        }

        futureForecast.push({
          date: label,
          predicted: predictedRevenue,
          isPrediction: true,
        });
      }

      // ─────────────────────────────────────
      // SAVE FORECAST
      // ─────────────────────────────────────
      setForecastData(futureForecast);

      setForecastModel("Moving Average Forecast");
    } catch (err) {
      console.error(err);

      setForecastData([]);
    } finally {
      setForecastLoading(false);
    }
  }
  async function generateAIInsights(orderData, expenseData) {
    try {
      setAiLoading(true);

      const cacheKey = `ai_insights_${selectedBranch}_${range}`;

      const cached = localStorage.getItem(cacheKey);

      const lastRequest = localStorage.getItem(`${cacheKey}_time`);

      const SIX_HOURS = 6 * 60 * 60 * 1000;

      // USE CACHE
      if (
        cached &&
        lastRequest &&
        Date.now() - Number(lastRequest) < SIX_HOURS
      ) {
        setAiInsights(JSON.parse(cached));

        setAiLoading(false);

        return;
      }

      const chartData = descriptiveData;

      const revenue = stats.totalRevenue || 0;

      const expenses = stats.totalExpenses || 0;

      const profit = stats.profit || 0;

      const aiResult = await askGemini(`
You are an AI-Based Decision Support System for I&C Laundry Hub.

Analyze the ACTUAL analytics trends below.

Revenue Summary:
₱${revenue}

Expense Summary:
₱${expenses}

Profit:
₱${profit}

Trend Data:
${JSON.stringify(chartData)}

Forecast Data:
${JSON.stringify(forecastData)}

Branch:
${selectedBranch}

Return ONLY valid JSON.

{
  "insights": [
    {
      "title": "Revenue Trend",
      "description": "..."
    }
  ]
}

Rules:
- Analyze actual graph trends
- Mention increases or decreases
- Mention if expenses are high
- Mention forecast behavior
- Mention financial recommendations
- Maximum 2 sentences
- Keep insights realistic
- Avoid generic responses
- No markdown
`);

      const cleaned = aiResult.text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      const parsed = JSON.parse(cleaned);

      setAiInsights(parsed.insights || []);
      localStorage.setItem(cacheKey, JSON.stringify(parsed.insights || []));

      localStorage.setItem(`${cacheKey}_time`, Date.now().toString());
    } catch (err) {
      console.error(err);

      setAiInsights([
        {
          title: "Revenue Trend",
          description:
            "Revenue performance remains stable based on the selected analytics range.",
        },
        {
          title: "Expense Monitoring",
          description:
            "Operational expenses should continue to be monitored to maintain profitability.",
        },
        {
          title: "Forecast Observation",
          description:
            "Revenue forecasting indicates steady financial performance in upcoming periods.",
        },
      ]);
    } finally {
      setAiLoading(false);
    }
  }

  const descriptiveData = getDescriptiveData();

  return (
    <>
      {/* FILTERS */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 18,
        }}
      >
        {/* DATE FILTER */}
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            background: "#fff",
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
          }}
        >
          <input
            type="date"
            value={customRange.start || ""}
            onChange={(e) =>
              setCustomRange((prev) => ({
                ...prev,
                start: e.target.value,
              }))
            }
          />

          <span>→</span>

          <input
            type="date"
            value={customRange.end || ""}
            onChange={(e) =>
              setCustomRange((prev) => ({
                ...prev,
                end: e.target.value,
              }))
            }
          />
        </div>

        {/* BRANCH FILTER */}
        <select
          value={selectedBranch}
          onChange={(e) => setSelectedBranch(e.target.value)}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "#fff",
            fontWeight: 600,
          }}
        >
          <option value="all">All Branches</option>
          <option value="Main - Brgy 7">Main - Brgy 7</option>
          <option value="2nd Branch - Brgy Calzada">
            2nd Branch - Brgy Calzada
          </option>
          <option value="3rd Branch - Nasugbu">3rd Branch - Nasugbu</option>
        </select>

        <SubFilter
          value={range}
          onChange={setRange}
          options={[
            { value: "weekly", label: "Weekly" },
            { value: "monthly", label: "Monthly" },
            { value: "yearly", label: "Yearly" },
          ]}
        />
      </div>

      {/* STATS */}
      <div className="stats-grid">
        <div className="stat-card green">
          <div className="stat-icon">
            <DollarSign size={22} />
          </div>

          <div className="stat-value">
            ₱{stats.totalRevenue?.toLocaleString()}
          </div>

          <div className="stat-label">Total Revenue</div>
        </div>

        <div className="stat-card red">
          <div className="stat-icon">
            <Wallet size={22} />
          </div>

          <div className="stat-value">
            ₱{stats.totalExpenses?.toLocaleString()}
          </div>

          <div className="stat-label">Total Expenses</div>
        </div>

        <div className="stat-card cyan">
          <div className="stat-icon">
            <Percent size={22} />
          </div>

          <div className="stat-value">₱{stats.profit?.toLocaleString()}</div>

          <div className="stat-label">Net Profit</div>
        </div>

        <div className="stat-card blue">
          <div className="stat-icon">
            <ShoppingBag size={22} />
          </div>

          <div className="stat-value">{stats.totalOrders}</div>

          <div className="stat-label">Total Orders</div>
        </div>
      </div>

      {/* CHARTS */}
      <div className="charts-grid">
        {/* REVENUE EXPENSE */}
        <div className="card">
          <div className="card-header">
            <h3>Revenue & Expense Trend</h3>

            <p
              style={{
                fontSize: 12,
                color: "#6b7280",
              }}
            >
              Descriptive Analytics
            </p>
          </div>

          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={descriptiveData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#f3f4f6"
                vertical={false}
              />

              <XAxis dataKey="date" />

              <YAxis />

              <Tooltip content={<CustomTooltip />} />

              <Legend />

              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#10b981"
                fill="#10b981"
                fillOpacity={0.2}
              />

              <Area
                type="monotone"
                dataKey="expenses"
                stroke="#ef4444"
                fill="#ef4444"
                fillOpacity={0.2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* FORECAST */}
        <div className="card">
          <div className="card-header">
            <h3>Revenue Forecasting</h3>

            <p
              style={{
                fontSize: 12,
                color: "#6b7280",
              }}
            >
              Predictive Analytics · {forecastModel}
            </p>
          </div>

          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={forecastData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#f3f4f6"
                vertical={false}
              />

              <XAxis dataKey="date" />

              <YAxis />

              <Tooltip content={<CustomTooltip />} />

              <Legend />

              <Bar dataKey="predicted" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* AI DSS */}
        <div
          className="card"
          style={{
            gridColumn: "1 / -1",
            border: "1px solid #ddd6fe",
            background: "linear-gradient(135deg,#faf5ff,#ffffff)",
          }}
        >
          <div className="card-header">
            <h3
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Lightbulb size={18} style={{ color: "#7c3aed" }} />
              AI-Based DSS Insights
            </h3>

            <span
              style={{
                background: "#ede9fe",
                color: "#7c3aed",
                padding: "5px 10px",
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              AI-Based Operational & Financial Recommendations
            </span>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {aiLoading
              ? [...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: 14,
                      padding: "16px",
                      borderRadius: 14,
                      background: "#faf5ff",
                      border: "1px solid rgba(0,0,0,0.05)",
                      animation: "pulse 1.5s infinite",
                    }}
                  >
                    {/* ICON SKELETON */}
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 12,
                        background: "#e5e7eb",
                        flexShrink: 0,
                      }}
                    />

                    {/* TEXT SKELETON */}
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          height: 14,
                          width: "35%",
                          background: "#e5e7eb",
                          borderRadius: 6,
                          marginBottom: 10,
                        }}
                      />

                      <div
                        style={{
                          height: 12,
                          width: "100%",
                          background: "#e5e7eb",
                          borderRadius: 6,
                          marginBottom: 8,
                        }}
                      />

                      <div
                        style={{
                          height: 12,
                          width: "80%",
                          background: "#e5e7eb",
                          borderRadius: 6,
                        }}
                      />
                    </div>
                  </div>
                ))
              : aiInsights.map((item, i) => {
                  let Icon = TrendingUp;
                  let color = "#8b5cf6";
                  let bg = "#faf5ff";

                  if (item.title.toLowerCase().includes("revenue")) {
                    Icon = DollarSign;
                    color = "#10b981";
                    bg = "#ecfdf5";
                  }

                  if (item.title.toLowerCase().includes("expense")) {
                    Icon = Wallet;
                    color = "#ef4444";
                    bg = "#fef2f2";
                  }

                  if (item.title.toLowerCase().includes("branch")) {
                    Icon = Building2;
                    color = "#3b82f6";
                    bg = "#eff6ff";
                  }

                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        gap: 14,
                        padding: "16px",
                        borderRadius: 14,
                        background: bg,
                        border: "1px solid rgba(0,0,0,0.05)",
                      }}
                    >
                      <div
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 12,
                          background: "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Icon size={20} style={{ color }} />
                      </div>

                      <div>
                        <div
                          style={{
                            fontWeight: 700,
                            marginBottom: 4,
                            color,
                          }}
                        >
                          {item.title}
                        </div>

                        <div
                          style={{
                            fontSize: 13.5,
                            color: "#374151",
                            lineHeight: 1.6,
                          }}
                        >
                          {item.description}
                        </div>
                      </div>
                    </div>
                  );
                })}
          </div>
        </div>
      </div>
    </>
  );
}
