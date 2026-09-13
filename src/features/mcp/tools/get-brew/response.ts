import { z } from "zod";

const Bean = z.object({
  id: z.string(),
  name: z.string(),
  roaster: z.string(),
});

const Method = z.object({
  id: z.string(),
  label: z.string(),
  notes: z.string().optional(),
});

const Grinder = z.object({
  id: z.string(),
  name: z.string(),
  maker: z.string(),
  notes: z.string().optional(),
});

const Machine = z.object({
  id: z.string(),
  name: z.string(),
  maker: z.string(),
  type: z.string(),
  notes: z.string().optional(),
});

const Recipe = z.object({
  id: z.string(),
  name: z.string(),
  notes: z.string().optional(),
});

const Brew = z.object({
  id: z.string(),
  beanId: z.string(),
  methodId: z.string(),
  date: z.string(),
  time: z.string(),
  grinderId: z.string(),
  machineId: z.string().optional(),
  grindSetting: z.number(),
  doseIn: z.number(),
  yieldOut: z.number(),
  extractionTime: z.number(),
  temperature: z.number(),
  ratio: z.string(),
  recipeId: z.string().optional(),
  recipeNotes: z.string().optional(),
  rating: z.number().nullable(),
  rating2: z.number().nullable().optional(),
  aroma: z.string().optional(),
  flavor: z.string().optional(),
  body: z.string().optional(),
  finish: z.string().optional(),
  descriptors: z.array(z.string()).optional(),
  withMilk: z.boolean().optional(),
  milkDrink: z.string().nullable().optional(),
  espressoDrink: z.string().nullable().optional(),
  cutsThruMilk: z.boolean().optional(),
  buyAgain: z.string().nullable().optional(),
  bestFor: z.string().nullable().optional(),
  favorite: z.boolean().optional(),
});

export const GetBrewResponse = z.object({
  brew: z
    .object({
      ...Brew.shape,
      bean: Bean.nullable(),
      method: Method.nullable(),
      grinder: Grinder.nullable(),
      machine: Machine.nullable(),
      recipe: Recipe.nullable(),
    })
    .nullable(),
});

export type GetBrewResponse = z.infer<typeof GetBrewResponse>;
