import { Schema } from "effect";

const CalendarDate = Schema.String.pipe(
  Schema.pattern(/^\d{4}-\d{2}-\d{2}$/),
);

const Rating = Schema.NullOr(
  Schema.Number.pipe(Schema.between(0, 10)),
);

export const StoredBrew = Schema.Struct({
  id: Schema.String,
  beanId: Schema.String,
  method: Schema.String,
  date: CalendarDate,
  time: Schema.String,
  rating: Rating,
  recipeNotes: Schema.optional(Schema.String),
  aroma: Schema.optional(Schema.String),
  flavor: Schema.optional(Schema.String),
  body: Schema.optional(Schema.String),
  finish: Schema.optional(Schema.String),
  descriptors: Schema.optional(Schema.Array(Schema.String)),
  favorite: Schema.optional(Schema.Boolean),
});
export type StoredBrew = typeof StoredBrew.Type;
export type BrewSummary = StoredBrew;

export const StoredBrewDetail = Schema.Struct({
  ...StoredBrew.fields,
  grinder: Schema.String,
  machine: Schema.optional(Schema.String),
  grindSetting: Schema.Number,
  doseIn: Schema.Number,
  yieldOut: Schema.Number,
  extractionTime: Schema.Number,
  temperature: Schema.Number,
  ratio: Schema.String,
  recipeId: Schema.optional(Schema.String),
  rating2: Schema.optional(Rating),
  withMilk: Schema.optional(Schema.Boolean),
  milkDrink: Schema.optional(Schema.NullOr(Schema.String)),
  espressoDrink: Schema.optional(Schema.NullOr(Schema.String)),
  cutsThruMilk: Schema.optional(Schema.Boolean),
  buyAgain: Schema.optional(Schema.NullOr(Schema.String)),
  bestFor: Schema.optional(Schema.NullOr(Schema.String)),
});
export type StoredBrewDetail = typeof StoredBrewDetail.Type;

export const StoredBeanSummary = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  roaster: Schema.String,
});
export type StoredBeanSummary = typeof StoredBeanSummary.Type;

export const StoredBean = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  roaster: Schema.String,
  origin: Schema.String,
  process: Schema.String,
  varietal: Schema.String,
  roast: Schema.Literal("light", "medium", "dark"),
  altitude: Schema.String,
  tasting: Schema.Array(Schema.String),
  dateOpened: CalendarDate,
  roastDate: CalendarDate,
  pricePerKg: Schema.Number,
  bagWeight: Schema.Number,
  brews: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  finished: Schema.optional(Schema.Boolean),
});
export type StoredBean = typeof StoredBean.Type;

export type BeanInventory = Omit<StoredBean, "brews"> & {
  /** Authoritative count of non-deleted brews linked to this bean. */
  readonly brews: number;
  /** Total recorded dose, in grams. */
  readonly consumedWeight: number;
  /** Grams remaining, or null when one or more linked brews has no valid dose. */
  readonly remainingWeight: number | null;
};

export const StoredMethodSummary = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  notes: Schema.optional(Schema.String),
});
export type StoredMethodSummary = typeof StoredMethodSummary.Type;

export const StoredGrinderSummary = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  maker: Schema.String,
  notes: Schema.optional(Schema.String),
});
export type StoredGrinderSummary = typeof StoredGrinderSummary.Type;

export const StoredMachineSummary = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  maker: Schema.String,
  type: Schema.String,
  notes: Schema.optional(Schema.String),
});
export type StoredMachineSummary = typeof StoredMachineSummary.Type;

export const StoredRecipeSummary = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  notes: Schema.optional(Schema.String),
});
export type StoredRecipeSummary = typeof StoredRecipeSummary.Type;

export type BrewDetail = Omit<
  StoredBrewDetail,
  "method" | "grinder" | "machine"
> & {
  readonly methodId: string;
  readonly grinderId: string;
  readonly machineId?: string;
  readonly bean: StoredBeanSummary | null;
  readonly method: StoredMethodSummary | null;
  readonly grinder: StoredGrinderSummary | null;
  readonly machine: StoredMachineSummary | null;
  readonly recipe: StoredRecipeSummary | null;
};

export interface BrewCursor {
  readonly date: string;
  readonly time: string;
  readonly id: string;
}

export interface BrewPage {
  readonly brews: readonly BrewSummary[];
  readonly nextCursor: BrewCursor | null;
}

export interface BeanCursor {
  readonly name: string;
  readonly id: string;
}

export interface BeanPage {
  readonly beans: readonly BeanInventory[];
  readonly nextCursor: BeanCursor | null;
}

export interface JournalSummary {
  readonly totalBrews: number;
  readonly ratedBrews: number;
  readonly averageRating: number | null;
  readonly favoriteBrews: number;
  readonly topMethods: readonly {
    readonly methodId: string;
    readonly label: string;
    readonly brewCount: number;
  }[];
  readonly topBeans: readonly {
    readonly beanId: string;
    readonly name: string;
    readonly roaster: string | null;
    readonly brewCount: number;
  }[];
}

export const NoteEntity = Schema.Literal(
  "brew",
  "bean",
  "recipe",
  "grinder",
  "machine",
  "method",
);
export type NoteEntity = typeof NoteEntity.Type;

export interface NoteSearchResult {
  readonly entity: NoteEntity;
  readonly id: string;
  readonly title: string;
  readonly text: string;
  readonly updatedAt: number;
}

export interface NoteSearchCursor {
  readonly updatedAt: number;
  readonly entity: NoteEntity;
  readonly id: string;
}

export interface NoteSearchPage {
  readonly results: readonly NoteSearchResult[];
  readonly nextCursor: NoteSearchCursor | null;
}
