import { getModels } from "@/lib/data";
import { ComparisonClient } from "./client";

export const revalidate = 300; // re-fetch at most every 5 minutes

export default async function ComparisonPage() {
  const models = await getModels();
  return <ComparisonClient models={models} />;
}
