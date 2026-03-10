import { getModels, getGames, getRatingHistory } from "@/lib/data";
import { ModelDetailClient } from "./client";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ModelDetailPage({
  params,
}: {
  params: Promise<{ modelId: string }>;
}) {
  const { modelId } = await params;
  const decodedId = decodeURIComponent(modelId);
  const models = getModels();
  const model = models.find((m) => m.model_id === decodedId);

  if (!model) {
    notFound();
  }

  const games = getGames();
  const ratingHistory = getRatingHistory();

  return (
    <ModelDetailClient
      model={model}
      models={models}
      games={games}
      ratingHistory={ratingHistory}
    />
  );
}
