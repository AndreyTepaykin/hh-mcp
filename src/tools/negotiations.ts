import { z } from "zod";
import { hhGet } from "../client.js";
import { requireToken } from "../auth.js";
import type {
  NegotiationsCollectionsResponse,
  NegotiationItem,
  NegotiationMessagesResponse,
  SearchResult,
} from "../types.js";
import {
  formatApplicationCollections,
  formatApplicationList,
  formatApplication,
  formatApplicationMessages,
  formatNegotiationsStatistics,
  formatPreferredOrder,
} from "../format.js";

const rawFlag = z
  .boolean()
  .optional()
  .describe("Return the full raw hh.ru JSON instead of the compact summary.");

const vacancyId = z.string().regex(/^\d+$/, "vacancy_id must be a numeric hh.ru id");
const employerId = z.string().regex(/^\d+$/, "employer_id must be a numeric hh.ru id");
const negotiationId = z
  .string()
  .regex(/^\d+$/, "id must be a numeric hh.ru negotiation id");
const collectionId = z
  .string()
  .regex(/^[a-zA-Z0-9_-]+$/, "collection must be an hh.ru collection id");

export const listApplicationCollectionsSchema = z.object({
  vacancy_id: vacancyId.describe("Vacancy ID to list negotiation collections for"),
  raw: rawFlag,
});

export async function handleListApplicationCollections(
  params: z.infer<typeof listApplicationCollectionsSchema>,
): Promise<string> {
  requireToken();
  const query = new URLSearchParams();
  query.set("vacancy_id", params.vacancy_id);
  const result = await hhGet(`/negotiations?${query.toString()}`);
  if (params.raw) return JSON.stringify(result, null, 2);
  return formatApplicationCollections(result as NegotiationsCollectionsResponse);
}

export const listApplicationsSchema = z.object({
  collection: collectionId.describe(
    "Collection id from list_application_collections (e.g. response, invited)",
  ),
  vacancy_id: vacancyId.describe("Vacancy ID"),
  page: z.number().int().min(0).default(0).describe("Page number (0-based)"),
  per_page: z.number().int().min(1).max(50).default(20).describe("Results per page"),
  order_by: z
    .string()
    .optional()
    .describe(
      "Sort order (e.g. created_at, relevance, last_change_time_except_employer_inbox). Use get_preferred_negotiations_order for the vacancy default.",
    ),
  raw: rawFlag,
});

export async function handleListApplications(
  params: z.infer<typeof listApplicationsSchema>,
): Promise<string> {
  requireToken();
  const query = new URLSearchParams();
  query.set("vacancy_id", params.vacancy_id);
  query.set("page", String(params.page));
  query.set("per_page", String(params.per_page));
  if (params.order_by) query.set("order_by", params.order_by);
  const result = await hhGet(
    `/negotiations/${encodeURIComponent(params.collection)}?${query.toString()}`,
  );
  if (params.raw) return JSON.stringify(result, null, 2);
  return formatApplicationList(result as SearchResult<NegotiationItem>);
}

export const getApplicationSchema = z.object({
  id: negotiationId.describe("Negotiation / application topic ID"),
  raw: rawFlag,
});

export async function handleGetApplication(
  params: z.infer<typeof getApplicationSchema>,
): Promise<string> {
  requireToken();
  const result = await hhGet(`/negotiations/${encodeURIComponent(params.id)}`);
  if (params.raw) return JSON.stringify(result, null, 2);
  return formatApplication(result as NegotiationItem);
}

export const getApplicationMessagesSchema = z.object({
  nid: negotiationId.describe("Negotiation / application topic ID"),
  raw: rawFlag,
});

export async function handleGetApplicationMessages(
  params: z.infer<typeof getApplicationMessagesSchema>,
): Promise<string> {
  requireToken();
  const result = await hhGet(`/negotiations/${encodeURIComponent(params.nid)}/messages`);
  if (params.raw) return JSON.stringify(result, null, 2);
  return formatApplicationMessages(result as NegotiationMessagesResponse);
}

export const getNegotiationsStatisticsSchema = z.object({
  employer_id: employerId.describe("Employer ID"),
  raw: rawFlag,
});

export async function handleGetNegotiationsStatistics(
  params: z.infer<typeof getNegotiationsStatisticsSchema>,
): Promise<string> {
  requireToken();
  const result = await hhGet(
    `/employers/${encodeURIComponent(params.employer_id)}/negotiations_statistics`,
  );
  if (params.raw) return JSON.stringify(result, null, 2);
  return formatNegotiationsStatistics(result);
}

export const getPreferredNegotiationsOrderSchema = z.object({
  vacancy_id: vacancyId.describe("Vacancy ID"),
  raw: rawFlag,
});

export async function handleGetPreferredNegotiationsOrder(
  params: z.infer<typeof getPreferredNegotiationsOrderSchema>,
): Promise<string> {
  requireToken();
  const result = await hhGet(
    `/vacancies/${encodeURIComponent(params.vacancy_id)}/preferred_negotiations_order`,
  );
  if (params.raw) return JSON.stringify(result, null, 2);
  return formatPreferredOrder(result);
}
