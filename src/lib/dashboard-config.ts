import { z } from "zod";

export const widgetIds = ["briefing", "calendar", "plans", "life-dashboard", "memo", "alpha"] as const;
const widgetId = z.enum(widgetIds);
export type WidgetId = z.infer<typeof widgetId>;
export type DashboardConfig = { order: WidgetId[]; hidden: WidgetId[] };

export const defaultDashboardConfig: DashboardConfig = {
  order: [...widgetIds],
  hidden: [],
};

const configSchema = z.object({
  order: z.array(widgetId).max(widgetIds.length),
  hidden: z.array(widgetId).max(widgetIds.length),
}).strict();

export function parseDashboardConfig(input: unknown): DashboardConfig {
  const config = configSchema.parse(input);
  if (new Set(config.order).size !== config.order.length || new Set(config.hidden).size !== config.hidden.length)
    throw new Error("duplicate_widget");
  return config;
}
