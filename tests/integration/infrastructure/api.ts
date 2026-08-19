import { integrationContext } from "./global-setup.js";

export const apiUrl = (path: string) =>
  `${integrationContext().apiBaseUrl}${path}`;

export const authenticatedHeaders = (
  userId: string,
  headers: Readonly<Record<string, string>> = {},
): Record<string, string> => ({
  "x-dev-user": userId,
  ...headers,
});
