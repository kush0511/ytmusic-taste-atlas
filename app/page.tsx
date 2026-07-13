import cosmos from "@/data/cosmos.json";
import model from "@/data/taste-model.json";
import TasteCosmos from "@/components/TasteCosmos";

export default function Page() {
  return <TasteCosmos cosmos={cosmos} model={model} />;
}
