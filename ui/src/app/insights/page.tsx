import { getInsightsData } from "@/lib/data";
import { InsightsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const data = await getInsightsData();
  return <InsightsClient data={data} />;
}
