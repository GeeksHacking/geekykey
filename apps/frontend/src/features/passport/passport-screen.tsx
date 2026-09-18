import { PageHeader } from "@/components/layout/page-header";
import { StampGrid } from "@/features/passport/stamp-grid";
import { useMe } from "@/lib/session";

export function PassportScreen() {
  const { me } = useMe();
  const earned = me.stamps.filter((stamp) => stamp.earned_at !== null).length;
  const description =
    me.stamps.length === 0
      ? "Your stamp book for this event."
      : `${earned} of ${me.stamps.length} stamps collected. Tap your token at a station to fill the next slot.`;
  return (
    <div className="space-y-6">
      <PageHeader title="Passport" description={description} />
      <StampGrid stamps={me.stamps} />
    </div>
  );
}
