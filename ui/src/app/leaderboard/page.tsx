import { getModels } from "@/lib/data";
import { LeaderboardClient } from "./client";

export const dynamic = "force-dynamic";

export default function LeaderboardPage() {
  const models = getModels();
  return <LeaderboardClient models={models} />;
}
