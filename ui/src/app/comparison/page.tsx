import { getModels } from "@/lib/data";
import { ComparisonClient } from "./client";

export const dynamic = "force-dynamic";

export default function ComparisonPage() {
  const models = getModels();
  return <ComparisonClient models={models} />;
}
