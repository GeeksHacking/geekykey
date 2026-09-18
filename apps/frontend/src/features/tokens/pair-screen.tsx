import { PageHeader } from "@/components/layout/page-header";
import { PairForm } from "@/features/tokens/pair-form";
import { TokenList } from "@/features/tokens/token-list";
import { useMe } from "@/lib/session";

export function PairScreen() {
  const { me, refresh } = useMe();
  return (
    <div className="space-y-8">
      <PageHeader
        title="Your token"
        description="The physical NFC token linked to your account. You can pair more than one."
      />
      <TokenList tokens={me.tokens} onUnpaired={refresh} />
      <section className="space-y-4">
        <h2 className="text-base font-semibold">
          {me.tokens.length > 0 ? "Pair another token" : "Pair a token"}
        </h2>
        <PairForm onPaired={refresh} />
      </section>
    </div>
  );
}
