import { getModels, getGames, getRatingHistory } from "@/lib/data";
import { ModelDetailClient } from "./client";
import { notFound } from "next/navigation";

export const revalidate = 300; // re-fetch at most every 5 minutes

export default async function ModelDetailPage({
  params,
}: {
  params: Promise<{ modelId: string }>;
}) {
  const { modelId } = await params;
  const decodedId = decodeURIComponent(modelId);
  const models = await getModels();
  const model = models.find((m) => m.model_id === decodedId);

  if (!model) {
    notFound();
  }

  const [games, ratingHistory] = await Promise.all([
    getGames(),
    getRatingHistory(),
  ]);

  return (
    <ModelDetailClient
      model={model}
      models={models}
      games={games}
      ratingHistory={ratingHistory}
    />
  );
}
