import { getModels } from "@/lib/data";
import { ComparisonClient } from "./client";

export const dynamic = "force-dynamic";

export default async function ComparisonPage() {
  const models = await getModels();
  return <ComparisonClient models={models} />;
}
