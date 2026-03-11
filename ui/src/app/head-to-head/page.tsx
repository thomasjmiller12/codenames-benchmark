import { getModels, getGames, getRatingHistory } from "@/lib/data";
import { HeadToHeadClient } from "./client";

export const revalidate = 300; // re-fetch at most every 5 minutes

export default async function HeadToHeadPage() {
  const [models, games, ratingHistory] = await Promise.all([
    getModels(),
    getGames(),
    getRatingHistory(),
  ]);

  return (
    <HeadToHeadClient
      models={models}
      games={games}
      ratingHistory={ratingHistory}
    />
  );
}
