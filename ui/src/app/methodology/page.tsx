import { getModels } from "@/lib/data";
import { HowItWorksClient } from "./client";

export const revalidate = 300;

export const metadata = {
  title: "How It Works | Codenames LLM Benchmark",
  description:
    "Learn how AI models compete in Codenames — game mechanics, LLM integration, fair matchups, and the Bradley-Terry rating system.",
};

export default async function HowItWorksPage() {
  const models = await getModels();
  const topModels = models
    .filter((m) => m.solo_rating > 0 && m.solo_games > 0)
    .sort((a, b) => b.solo_rating - a.solo_rating)
    .slice(0, 4)
    .map((m) => ({
      display_name: m.display_name,
      solo_rating: m.solo_rating,
      solo_ci_lower: m.solo_ci_lower,
      solo_ci_upper: m.solo_ci_upper,
    }));

  return <HowItWorksClient topModels={topModels} />;
}
