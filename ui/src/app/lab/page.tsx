import { getModels } from "@/lib/data";
import { LabClient } from "./client";

export const revalidate = 300;

export default async function LabPage() {
  const models = await getModels();
  return <LabClient models={models} />;
}
