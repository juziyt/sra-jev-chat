import type { Card, CardType } from "@jev-chat/server/types";
import type { FC } from "react";

import { keyed } from "../ui/keyed.ts";
import {
  ActionCard,
  CapabilitiesCard,
  ChoicesCard,
  ConfirmCard,
  ErrorCard,
  SuggestionCard,
} from "./ActionCards.tsx";
import { OrderCard } from "./OrderCard.tsx";
import type { CardActions, CardComponent } from "./types.ts";

/** Renders any card with the component registered for its type. */
export function CardView({ card, ...actions }: { card: Card } & CardActions) {
  const Component = CARDS[card.type] as FC<{ card: Card } & CardActions>;
  return <Component card={card} {...actions} />;
}

const BundleCard: CardComponent<"bundle"> = ({ card, ...actions }) => (
  <div className="space-y-2">
    {keyed(card.cards, (inner) => inner.type).map(({ key, item }) => (
      <CardView key={key} card={item} {...actions} />
    ))}
  </div>
);

const CARDS: { [K in CardType]: CardComponent<K> } = {
  capabilities: CapabilitiesCard,
  action: ActionCard,
  confirm: ConfirmCard,
  choices: ChoicesCard,
  error: ErrorCard,
  order: OrderCard,
  suggestion: SuggestionCard,
  bundle: BundleCard,
};

export type { CardAction } from "./types.ts";
