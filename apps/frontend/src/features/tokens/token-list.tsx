import { Key } from "@phosphor-icons/react";

import type { Token } from "@/api/types";
import { EmptyState } from "@/components/layout/empty-state";
import { TokenRow } from "@/features/tokens/token-row";

interface TokenListProps {
  tokens: Token[];
  onUnpaired: () => Promise<void> | void;
}

export function TokenList({ tokens, onUnpaired }: TokenListProps) {
  if (tokens.length === 0) {
    return (
      <EmptyState
        icon={Key}
        title="No token paired"
        description="Pair the token you received at the registration desk using the form below."
      />
    );
  }
  return (
    <ul className="divide-y rounded-lg border" aria-label="Paired tokens">
      {tokens.map((token) => (
        <TokenRow key={token.uid} token={token} onUnpaired={onUnpaired} />
      ))}
    </ul>
  );
}
