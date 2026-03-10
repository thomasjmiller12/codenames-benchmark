import { getInsightsData } from "@/lib/data";
import { InsightsClient } from "./client";

export const dynamic = "force-dynamic";

export default function InsightsPage() {
  const data = getInsightsData();
  return <InsightsClient data={data} />;
}
