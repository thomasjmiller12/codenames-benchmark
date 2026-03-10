import { getModels } from "@/lib/data";
import { LeaderboardClient } from "./client";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const models = await getModels();
  return <LeaderboardClient models={models} />;
}
