// Compact, LLM-friendly formatters for hh.ru responses.
//
// hh.ru payloads are large and deeply nested; dumping raw JSON for every search
// result burns tokens and buries the signal. These helpers render concise text.
// Every tool that uses them still exposes `raw: true` to get the full JSON.
//
// Inputs are typed against ./types.ts (which was previously dead code) but kept
// defensive — the API returns more fields than we model, and some are optional.

import type {
  Vacancy,
  VacancyDetail,
  Employer,
  Resume,
  Area,
  SearchResult,
  NegotiationsCollectionsResponse,
  NegotiationItem,
  NegotiationMessagesResponse,
  NegotiationsHistory,
  EmployerManager,
  VacancyStats,
  SavedResumeSearch,
  NamedId,
} from "./types.js";

const RU = "ru-RU";

function stripTags(s: string): string {
  return s
    .replace(/<\/?[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

export interface SalaryLike {
  from?: number | null;
  to?: number | null;
  currency?: string | null;
  gross?: boolean | null;
}

export function formatSalary(salary?: SalaryLike | null): string {
  if (!salary || (salary.from == null && salary.to == null)) {
    return "з/п не указана";
  }
  const cur = salary.currency || "RUR";
  const sym = cur === "RUR" ? "₽" : cur;
  const fmt = (n: number) => n.toLocaleString(RU);
  let range: string;
  if (salary.from != null && salary.to != null) {
    range = `${fmt(salary.from)}–${fmt(salary.to)}`;
  } else if (salary.from != null) {
    range = `от ${fmt(salary.from)}`;
  } else {
    range = `до ${fmt(salary.to as number)}`;
  }
  const gross =
    salary.gross === true
      ? " (до вычета налога)"
      : salary.gross === false
        ? " (на руки)"
        : "";
  return `${range} ${sym}${gross}`;
}

function paginationHeader(
  noun: string,
  result: Pick<SearchResult<unknown>, "found" | "page" | "pages" | "items">,
): string {
  const found = typeof result.found === "number" ? result.found.toLocaleString(RU) : "?";
  const page = (result.page ?? 0) + 1;
  const pages = result.pages ?? 1;
  const shown = result.items?.length ?? 0;
  return `Найдено ${noun}: ${found} (страница ${page} из ${pages}, показано ${shown})`;
}

export function formatVacancyListItem(v: Vacancy, idx: number): string {
  const lines: string[] = [];
  lines.push(`${idx}. ${v.name} — ${v.employer?.name ?? "—"}`);
  const meta = [
    formatSalary(v.salary),
    v.area?.name,
    v.schedule?.name,
    v.experience?.name,
  ].filter(Boolean);
  lines.push(`   ${meta.join(" · ")}`);
  const snippet = [v.snippet?.requirement, v.snippet?.responsibility]
    .filter(Boolean)
    .map((s) => stripTags(String(s)))
    .join(" ")
    .trim();
  if (snippet) lines.push(`   ${truncate(snippet, 220)}`);
  lines.push(`   id=${v.id} · ${v.alternate_url ?? ""}`.trimEnd());
  return lines.join("\n");
}

export function formatVacancySearch(result: SearchResult<Vacancy>): string {
  const header = paginationHeader("вакансий", result);
  if (!result.items?.length) return `${header}\n(пусто)`;
  return (
    header +
    "\n\n" +
    result.items.map((v, i) => formatVacancyListItem(v, i + 1)).join("\n\n")
  );
}

export function formatVacancyDetail(v: VacancyDetail): string {
  const lines: string[] = [];
  lines.push(`# ${v.name}`);
  lines.push(
    `Работодатель: ${v.employer?.name ?? "—"}` +
      (v.employer?.alternate_url ? ` (${v.employer.alternate_url})` : ""),
  );
  lines.push(`Зарплата: ${formatSalary(v.salary)}`);
  if (v.area?.name) lines.push(`Регион: ${v.area.name}`);
  const conditions = [v.experience?.name, v.employment?.name, v.schedule?.name].filter(Boolean);
  if (conditions.length) lines.push(`Условия: ${conditions.join(" · ")}`);
  if (v.key_skills?.length) {
    lines.push(`Ключевые навыки: ${v.key_skills.map((s) => s.name).join(", ")}`);
  }
  if (v.description) {
    lines.push(`\nОписание:\n${truncate(stripTags(v.description), 4000)}`);
  }
  if (v.contacts) {
    const phones = v.contacts.phones?.map((p) => p.number).filter(Boolean).join(", ");
    const contact = [v.contacts.name, v.contacts.email, phones].filter(Boolean).join(" · ");
    if (contact) lines.push(`\nКонтакты: ${contact}`);
  }
  lines.push(`\nСсылка: ${v.alternate_url ?? ""}  ·  id=${v.id}`);
  return lines.join("\n");
}

export function formatEmployerListItem(e: Employer, idx: number): string {
  const meta = [
    e.area?.name,
    typeof e.open_vacancies === "number" ? `${e.open_vacancies} вакансий` : null,
  ].filter(Boolean);
  const tail = meta.length ? `\n   ${meta.join(" · ")}` : "";
  return `${idx}. ${e.name} (id=${e.id})${tail}\n   ${e.alternate_url ?? ""}`.trimEnd();
}

export function formatEmployerSearch(result: SearchResult<Employer>): string {
  const header = paginationHeader("работодателей", result);
  if (!result.items?.length) return `${header}\n(пусто)`;
  return (
    header +
    "\n\n" +
    result.items.map((e, i) => formatEmployerListItem(e, i + 1)).join("\n")
  );
}

export function formatEmployer(e: Employer): string {
  const lines: string[] = [];
  lines.push(`# ${e.name} (id=${e.id})`);
  if (e.area?.name) lines.push(`Регион: ${e.area.name}`);
  if (typeof e.open_vacancies === "number") {
    lines.push(`Открытых вакансий: ${e.open_vacancies}`);
  }
  if (e.industries?.length) {
    lines.push(`Отрасли: ${e.industries.map((i) => i.name).join(", ")}`);
  }
  if (e.site_url) lines.push(`Сайт: ${e.site_url}`);
  if (e.description) lines.push(`\n${truncate(stripTags(e.description), 1500)}`);
  lines.push(`\nСсылка: ${e.alternate_url ?? ""}`);
  return lines.join("\n");
}

export function formatResumeListItem(r: Resume, idx: number): string {
  const meta = [
    r.area?.name,
    r.age ? `${r.age} лет` : null,
    r.total_experience ? `опыт ${Math.round(r.total_experience.months / 12)} лет` : null,
    r.salary ? formatSalary({ from: r.salary.amount, currency: r.salary.currency }) : null,
  ].filter(Boolean);
  const tail = meta.length ? `\n   ${meta.join(" · ")}` : "";
  return `${idx}. ${r.title} (id=${r.id})${tail}\n   ${r.alternate_url ?? ""}`.trimEnd();
}

export function formatResumeSearch(result: SearchResult<Resume>): string {
  const header = paginationHeader("резюме", result);
  if (!result.items?.length) return `${header}\n(пусто)`;
  return (
    header +
    "\n\n" +
    result.items.map((r, i) => formatResumeListItem(r, i + 1)).join("\n")
  );
}

export function formatResume(r: Resume): string {
  const lines: string[] = [];
  lines.push(`# ${r.title} (id=${r.id})`);
  const head = [
    r.area?.name,
    r.age ? `${r.age} лет` : null,
    r.gender?.name,
    r.salary ? formatSalary({ from: r.salary.amount, currency: r.salary.currency }) : null,
  ].filter(Boolean);
  if (head.length) lines.push(head.join(" · "));
  if (r.total_experience) {
    lines.push(`Общий опыт: ${Math.round(r.total_experience.months / 12)} лет`);
  }
  if (r.experience?.length) {
    lines.push("\nОпыт работы:");
    for (const e of r.experience.slice(0, 10)) {
      const period = [e.start, e.end ?? "по наст. время"].filter(Boolean).join(" – ");
      lines.push(`  • ${[e.position, e.company].filter(Boolean).join(" @ ")} (${period})`);
    }
  }
  if (r.education?.primary?.length) {
    lines.push("\nОбразование:");
    for (const ed of r.education.primary.slice(0, 5)) {
      lines.push(`  • ${[ed.name, ed.organization, ed.year].filter(Boolean).join(", ")}`);
    }
  }
  if (r.skill_set?.length) lines.push(`\nНавыки: ${r.skill_set.join(", ")}`);
  lines.push(`\nСсылка: ${r.alternate_url ?? ""}`);
  return lines.join("\n");
}

/** Flatten the (large) /areas or /professional_roles tree into "id — name" lines. */
export function flattenAreaTree(areas: Area[], depth = 0): string {
  const out: string[] = [];
  for (const a of areas) {
    out.push(`${"  ".repeat(depth)}${a.id} — ${a.name}`);
    if (a.areas?.length) out.push(flattenAreaTree(a.areas, depth + 1));
  }
  return out.join("\n");
}

export function formatNamedIdList(items: NamedId[] | undefined, empty = "(пусто)"): string {
  if (!items?.length) return empty;
  return items.map((i) => `${i.id} — ${i.name}`).join("\n");
}

export function formatApplicationCollections(data: NegotiationsCollectionsResponse): string {
  const cols = data.collections ?? [];
  const states = data.employer_states ?? [];
  const lines: string[] = [];
  lines.push(`Коллекции откликов: ${cols.length}`);
  if (!cols.length) {
    lines.push("(пусто)");
  } else {
    for (const c of cols) {
      const desc = c.description ? ` — ${c.description}` : "";
      lines.push(`• ${c.id}: ${c.name}${desc}`);
    }
  }
  if (states.length) {
    lines.push(`\nСостояния работодателя:`);
    lines.push(formatNamedIdList(states));
  }
  return lines.join("\n");
}

function formatNegotiationListItem(n: NegotiationItem, idx: number): string {
  const name = [n.resume?.first_name, n.resume?.last_name].filter(Boolean).join(" ");
  const title = n.resume?.title ?? "—";
  const state = n.employer_state?.name ?? n.state?.name ?? "—";
  const meta = [
    name || null,
    n.resume?.area?.name,
    n.resume?.age != null ? `${n.resume.age} лет` : null,
    n.has_updates ? "есть обновления" : null,
  ].filter(Boolean);
  const lines: string[] = [];
  lines.push(`${idx}. ${title} · ${state} (id=${n.id})`);
  if (meta.length) lines.push(`   ${meta.join(" · ")}`);
  if (n.resume?.id) lines.push(`   resume_id=${n.resume.id}`);
  if (n.created_at || n.updated_at) {
    lines.push(`   создан=${n.created_at ?? "—"} · обновлён=${n.updated_at ?? "—"}`);
  }
  if (n.resume?.alternate_url) lines.push(`   ${n.resume.alternate_url}`);
  return lines.join("\n");
}

export function formatApplicationList(result: SearchResult<NegotiationItem>): string {
  const header = paginationHeader("откликов", result);
  if (!result.items?.length) return `${header}\n(пусто)`;
  return (
    header +
    "\n\n" +
    result.items.map((n, i) => formatNegotiationListItem(n, i + 1)).join("\n\n")
  );
}

export function formatApplication(n: NegotiationItem): string {
  const lines: string[] = [];
  const name = [n.resume?.first_name, n.resume?.last_name].filter(Boolean).join(" ");
  lines.push(`# Отклик ${n.id}`);
  lines.push(`Статус: ${n.employer_state?.name ?? n.state?.name ?? "—"}`);
  if (n.vacancy?.name) {
    lines.push(`Вакансия: ${n.vacancy.name}${n.vacancy.id ? ` (id=${n.vacancy.id})` : ""}`);
  }
  if (n.resume) {
    lines.push(
      `Резюме: ${n.resume.title ?? "—"}${n.resume.id ? ` (id=${n.resume.id})` : ""}` +
        (name ? ` · ${name}` : ""),
    );
    if (n.resume.alternate_url) lines.push(`Ссылка: ${n.resume.alternate_url}`);
  }
  if (n.created_at) lines.push(`Создан: ${n.created_at}`);
  if (n.updated_at) lines.push(`Обновлён: ${n.updated_at}`);
  if (n.messages_url) lines.push(`Сообщения: get_application_messages с nid=${n.id}`);
  return lines.join("\n");
}

export function formatApplicationMessages(data: NegotiationMessagesResponse): string {
  const items = data.items ?? [];
  const found = data.found ?? items.length;
  const lines: string[] = [`Сообщений: ${found}`];
  if (!items.length) {
    lines.push("(пусто)");
    return lines.join("\n");
  }
  for (const m of items) {
    const who = m.author?.participant_type ?? "?";
    const when = m.created_at ?? "";
    const text = m.text ? truncate(stripTags(m.text), 400) : "(без текста)";
    lines.push(`• [${who}] ${when}: ${text}`);
  }
  return lines.join("\n");
}

export function formatNegotiationsHistory(data: NegotiationsHistory): string {
  const items = data.negotiations ?? data.items ?? [];
  const vac = data.vacancy?.name
    ? `Вакансия: ${data.vacancy.name}${data.vacancy.id ? ` (id=${data.vacancy.id})` : ""}\n`
    : "";
  if (!items.length) return `${vac}История откликов: (пусто)`;
  const lines = items.map((h, i) => {
    const state = h.employer_state?.name ?? "—";
    const v = h.vacancy?.name
      ? ` · ${h.vacancy.name}${h.vacancy.id ? ` (${h.vacancy.id})` : ""}`
      : "";
    return `${i + 1}. ${state}${v}${h.created_at ? ` · ${h.created_at}` : ""}`;
  });
  return `${vac}История откликов (${items.length}):\n` + lines.join("\n");
}

export function formatNegotiationsStatistics(data: unknown): string {
  if (data == null || typeof data !== "object") return String(data);
  const obj = data as Record<string, unknown>;
  const lines: string[] = ["Статистика откликов:"];
  for (const [k, v] of Object.entries(obj)) {
    if (v != null && typeof v === "object" && !Array.isArray(v)) {
      const nested = Object.entries(v as Record<string, unknown>)
        .map(([nk, nv]) => `${nk}=${nv}`)
        .join(", ");
      lines.push(`• ${k}: ${nested || JSON.stringify(v)}`);
    } else if (Array.isArray(v)) {
      lines.push(`• ${k}: ${v.length} записей`);
    } else {
      lines.push(`• ${k}: ${v}`);
    }
  }
  return lines.join("\n");
}

export function formatPreferredOrder(data: unknown): string {
  if (data == null || typeof data !== "object") return String(data);
  const obj = data as { order_by?: string; preferred?: string; id?: string; name?: string };
  if (obj.order_by) return `Предпочтительная сортировка: ${obj.order_by}`;
  if (obj.preferred) return `Предпочтительная сортировка: ${obj.preferred}`;
  if (obj.id || obj.name) return `Предпочтительная сортировка: ${obj.id ?? obj.name}`;
  return JSON.stringify(data, null, 2);
}

export function formatManagerListItem(m: EmployerManager, idx: number): string {
  const meta = [m.email, m.phone, m.manager_type?.name].filter(Boolean);
  const flag = m.is_main_contact_person ? " · основной контакт" : "";
  return `${idx}. ${m.full_name ?? "—"} (id=${m.id})${flag}${
    meta.length ? `\n   ${meta.join(" · ")}` : ""
  }`;
}

export function formatManagerList(
  result: SearchResult<EmployerManager> | { items?: EmployerManager[] },
): string {
  const items = result.items ?? [];
  const found =
    "found" in result && typeof result.found === "number" ? result.found : items.length;
  if (!items.length) return `Менеджеров: ${found}\n(пусто)`;
  return (
    `Менеджеров: ${found}\n\n` +
    items.map((m, i) => formatManagerListItem(m, i + 1)).join("\n")
  );
}

export function formatManager(m: EmployerManager): string {
  const lines: string[] = [`# ${m.full_name ?? "Менеджер"} (id=${m.id})`];
  if (m.email) lines.push(`Email: ${m.email}`);
  if (m.phone) lines.push(`Телефон: ${m.phone}`);
  if (m.manager_type?.name) lines.push(`Тип: ${m.manager_type.name}`);
  if (m.is_main_contact_person) lines.push("Основной контакт: да");
  return lines.join("\n");
}

export function formatVacancyStats(stats: VacancyStats): string {
  const lines: string[] = ["Статистика вакансии:"];
  const known = ["views", "responses", "invitations"] as const;
  for (const key of known) {
    const block = stats[key];
    if (block && typeof block === "object") {
      const b = block as { total?: number; previous?: number };
      const prev = b.previous != null ? ` (ранее ${b.previous})` : "";
      lines.push(`• ${key}: ${b.total ?? "—"}${prev}`);
    }
  }
  for (const [k, v] of Object.entries(stats)) {
    if ((known as readonly string[]).includes(k)) continue;
    if (v != null && typeof v !== "object") lines.push(`• ${k}: ${v}`);
  }
  return lines.length > 1 ? lines.join("\n") : JSON.stringify(stats, null, 2);
}

export function formatSavedResumeSearchList(
  result: SearchResult<SavedResumeSearch> | { items?: SavedResumeSearch[] },
): string {
  const items = result.items ?? [];
  const found =
    "found" in result && typeof result.found === "number" ? result.found : items.length;
  if (!items.length) return `Сохранённых поисков: ${found}\n(пусто)`;
  return (
    `Сохранённых поисков: ${found}\n\n` +
    items
      .map((s, i) => {
        const meta = [
          s.subscription ? "подписка" : null,
          s.items?.count != null ? `всего ${s.items.count}` : null,
          s.new_items?.count != null ? `новых ${s.new_items.count}` : null,
          s.created_at,
        ].filter(Boolean);
        return `${i + 1}. ${s.name ?? "—"} (id=${s.id})${
          meta.length ? `\n   ${meta.join(" · ")}` : ""
        }`;
      })
      .join("\n")
  );
}

export function formatSavedResumeSearch(s: SavedResumeSearch): string {
  const lines: string[] = [`# ${s.name ?? "Поиск"} (id=${s.id})`];
  if (s.created_at) lines.push(`Создан: ${s.created_at}`);
  if (s.subscription != null) lines.push(`Подписка: ${s.subscription ? "да" : "нет"}`);
  if (s.items?.count != null) lines.push(`Всего результатов: ${s.items.count}`);
  if (s.new_items?.count != null) lines.push(`Новых: ${s.new_items.count}`);
  return lines.join("\n");
}
