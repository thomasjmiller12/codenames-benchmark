import { getInsightsData } from "@/lib/data";
import { InsightsClient } from "./client";

export const revalidate = 300; // re-fetch at most every 5 minutes

export default async function InsightsPage() {
  const data = await getInsightsData();
  return <InsightsClient data={data} />;
}
