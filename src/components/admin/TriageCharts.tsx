"use client";

/* Interactive mini-charts for the triage telemetry strip (recharts).
   All three render inside clickable KPI cards, so they stay hover-only —
   clicks bubble to the card and keep toggling its segment filter. */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/* ------------------------------ Shared tooltip ----------------------------- */

function ChartTip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-900/95 px-2.5 py-1.5 text-[10px] font-semibold text-white shadow-lg ring-1 ring-slate-700">
      {children}
    </div>
  );
}

/* --------------------- Daily count column chart (shared) -------------------- */

export interface DayCount {
  /** Axis label under the bar, e.g. "Sep 14". */
  label: string;
  count: number;
}

export function DailyColumnChart({
  data,
  color = "#10B981",
  verb = "filed",
}: {
  data: DayCount[];
  /** Bar + accent color, e.g. "#10B981". */
  color?: string;
  /** Tooltip verb, e.g. "filed" or "resolved". */
  verb?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={112}>
      <BarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 0 }} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 9, fill: "#94A3B8", fontWeight: 600 }}
          axisLine={{ stroke: "#E2E8F0" }}
          tickLine={false}
          interval={0}
          dy={3}
        />
        <YAxis
          width={26}
          allowDecimals={false}
          tick={{ fontSize: 9, fill: "#94A3B8", fontWeight: 600 }}
          axisLine={false}
          tickLine={false}
          domain={[0, "dataMax + 1"]}
        />
        <Tooltip
          cursor={{ fill: "rgba(15, 23, 42, 0.05)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as DayCount;
            return (
              <ChartTip>
                <span className="font-mono font-bold" style={{ color }}>
                  {p.count}
                </span>{" "}
                {verb} · {p.label}
              </ChartTip>
            );
          }}
        />
        <Bar
          dataKey="count"
          fill={color}
          radius={[3, 3, 0, 0]}
          maxBarSize={22}
          animationDuration={450}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ------------------------- Severity mix column chart ----------------------- */

export interface SeveritySlice {
  name: string;
  value: number;
  color: string;
}

export function SeverityBars({ data }: { data: SeveritySlice[] }) {
  const total = data.reduce((sum, slice) => sum + slice.value, 0);
  return (
    <ResponsiveContainer width="100%" height={112}>
      <BarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 0 }} barCategoryGap="32%">
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 9, fill: "#94A3B8", fontWeight: 600 }}
          axisLine={{ stroke: "#E2E8F0" }}
          tickLine={false}
          interval={0}
          dy={3}
        />
        <YAxis
          width={26}
          allowDecimals={false}
          tick={{ fontSize: 9, fill: "#94A3B8", fontWeight: 600 }}
          axisLine={false}
          tickLine={false}
          domain={[0, "dataMax + 1"]}
        />
        <Tooltip
          cursor={{ fill: "rgba(15, 23, 42, 0.05)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as SeveritySlice;
            return (
              <ChartTip>
                <span
                  className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
                  style={{ backgroundColor: p.color }}
                />
                {p.name} · <span className="font-mono font-bold">{p.value}</span> of{" "}
                {total} open
              </ChartTip>
            );
          }}
        />
        <Bar
          dataKey="value"
          radius={[3, 3, 0, 0]}
          maxBarSize={26}
          animationDuration={450}
        >
          {data.map((slice) => (
            <Cell key={slice.name} fill={slice.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
