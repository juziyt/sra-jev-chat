import { climateSet, homeStatus, lightSet, turnAdapter } from "./home/home.ts";
import { verifyIdentity } from "./identity/identity.ts";
import type { Adapter } from "./kit/adapter.ts";
import { getOrder, initiateRefund } from "./orders/orders.ts";
import { findRecipes, getRecipe } from "./recipes/recipes.ts";
import { webAnswer, webSearch } from "./search/search.ts";
import { addTask, completeTask, findTasks } from "./todoist/todoist.ts";
import { calculate, convertUnits } from "./units/units.ts";
import { weather } from "./weather/weather.ts";
import { wikiFact } from "./wiki/wiki.ts";

/** Every Adapter Jev can choose between. */
export const ADAPTERS: Adapter[] = [
  weather,
  convertUnits,
  calculate,
  webSearch,
  webAnswer,
  addTask,
  findTasks,
  completeTask,
  turnAdapter(true),
  turnAdapter(false),
  lightSet,
  climateSet,
  homeStatus,
  wikiFact,
  findRecipes,
  getRecipe,
  getOrder,
  initiateRefund,
  verifyIdentity,
];

/** Identity, order lookup, and refund — the tools the assist copilot may call. */
export const CS_ADAPTERS: Adapter[] = [verifyIdentity, getOrder, initiateRefund];

/** The registered adapter with this id, or undefined. */
export function adapterById(id: string): Adapter | undefined {
  return ADAPTERS.find((a) => a.id === id);
}

export type {
  Adapter,
  BuildResult,
  MultiStepAdapter,
  Presented,
  RunContext,
  SingleStepAdapter,
} from "./kit/adapter.ts";
export {
  ensureHomeCatalog,
  getHomeCatalog,
  type HomeCatalog,
  homeTargetPool,
  homeTargetsFrom,
  homeWords,
  parseLiveContext,
  setHomeCatalogFromText,
} from "./home/catalog.ts";
export { fold, isPlace } from "./search/places.ts";
