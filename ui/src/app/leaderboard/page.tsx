import { getModels } from "@/lib/data";
import { LeaderboardClient } from "./client";

export const revalidate = 300; // re-fetch at most every 5 minutes

export default async function LeaderboardPage() {
  const models = await getModels();
  return <LeaderboardClient models={models} />;
}
