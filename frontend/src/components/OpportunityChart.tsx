"use client";

import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { OpportunityItem } from "@/lib/types";

interface OpportunityChartProps {
  opportunities: OpportunityItem[];
}

export function OpportunityChart({ opportunities }: OpportunityChartProps) {
  if (opportunities.length === 0) return null;

  const data = opportunities.map((o) => ({
    x: o.effort_score,
    y: o.impact_score,
    z: 220,
    title: o.title,
    horizon: o.horizon,
  }));

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-md p-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
          Impact vs. Effort Matrix (Top-Left = Quick Wins)
        </h4>
        <span className="text-[11px] text-slate-500">
          X: Effort (1-10) · Y: Impact (1-10)
        </span>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 12, right: 20, bottom: 12, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              type="number"
              dataKey="x"
              name="Effort"
              domain={[0, 10]}
              tick={{ fontSize: 11, fill: "#475569" }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="Impact"
              domain={[0, 10]}
              tick={{ fontSize: 11, fill: "#475569" }}
            />
            <ZAxis type="number" dataKey="z" range={[120, 260]} />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const item = payload[0].payload as (typeof data)[number];
                return (
                  <div className="bg-white border border-slate-200 rounded shadow-sm p-2.5 text-xs">
                    <p className="font-semibold text-slate-900">{item.title}</p>
                    <p className="text-slate-600 mt-0.5">
                      Impact {item.y}/10 · Effort {item.x}/10 · {item.horizon}
                    </p>
                  </div>
                );
              }}
            />
            <Scatter data={data} fill="#0f766e" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
