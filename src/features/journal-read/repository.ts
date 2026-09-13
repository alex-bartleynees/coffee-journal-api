import { Context, Effect } from "effect";
import type { DbError } from "../../shared/persistence/errors.js";
import type {
  BeanCursor,
  BeanPage,
  BrewCursor,
  BrewDetail,
  BrewPage,
  JournalSummary,
  NoteEntity,
  NoteSearchCursor,
  NoteSearchPage,
} from "./model.js";

export interface ListBrewsQuery {
  readonly limit: number;
  readonly cursor?: BrewCursor;
  readonly from?: string;
  readonly to?: string;
  readonly method?: string;
  readonly minimumRating?: number;
  readonly beanId?: string;
}

export interface ListBeansQuery {
  readonly limit: number;
  readonly cursor?: BeanCursor;
  readonly status: "active" | "finished" | "all";
  readonly roaster?: string;
}

export interface JournalSummaryQuery {
  readonly from?: string;
  readonly to?: string;
}

export interface SearchNotesQuery {
  readonly query: string;
  readonly entities: readonly NoteEntity[];
  readonly limit: number;
  readonly cursor?: NoteSearchCursor;
}

export interface JournalReadRepositoryService {
  readonly listBrews: (
    userId: string,
    query: ListBrewsQuery,
  ) => Effect.Effect<BrewPage, DbError>;
  readonly getBrew: (
    userId: string,
    brewId: string,
  ) => Effect.Effect<BrewDetail | null, DbError>;
  readonly listBeans: (
    userId: string,
    query: ListBeansQuery,
  ) => Effect.Effect<BeanPage, DbError>;
  readonly getSummary: (
    userId: string,
    query: JournalSummaryQuery,
  ) => Effect.Effect<JournalSummary, DbError>;
  readonly searchNotes: (
    userId: string,
    query: SearchNotesQuery,
  ) => Effect.Effect<NoteSearchPage, DbError>;
}

export class JournalReadRepository extends Context.Tag("JournalReadRepository")<
  JournalReadRepository,
  JournalReadRepositoryService
>() {}
