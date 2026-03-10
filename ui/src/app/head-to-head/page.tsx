import { getModels, getGames, getRatingHistory } from "@/lib/data";
import { HeadToHeadClient } from "./client";

export const dynamic = "force-dynamic";

export default function HeadToHeadPage() {
  const models = getModels();
  const games = getGames();
  const ratingHistory = getRatingHistory();

  return (
    <HeadToHeadClient
      models={models}
      games={games}
      ratingHistory={ratingHistory}
    />
  );
}
