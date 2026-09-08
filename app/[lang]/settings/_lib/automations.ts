import { listForScreen, type ScreenAutomation } from "@/lib/automations/screen"

// АВТОМАТИЗАЦИЯ — ОДНА СВЯЗАННАЯ ЦЕПОЧКА ЗАПРОСОВ, И У НЕЁ ЕСТЬ СВОЯ СТРАНИЦА.
//
// 🎯 СЛОВА ВЛАДЕЛЬЦА 2026-09-06: «для каждой самостоятельной автоматизации —
// речь о каждом запросе и о связанных запросах, тех, что имеют начало во вкладке
// логи — мы должны создать кнопку и здесь же показывать страницу».
//
// 🔒 ИМЯ АВТОМАТИЗАЦИИ РАЗБИРАЕТСЯ ИЗ ИМЕНИ ФАЙЛА, А НЕ ХРАНИТСЯ ВТОРЫМ ПОЛЕМ.
// Формат тот же, что у приёмной заявок: `dd-mm-yyyy_hh-mm-ss`, дальше
// человеческое имя. Второе поле рядом с именем файла разошлось бы с ним в первый
// же день, когда файл переименуют, а поле забудут.
//
// 🔒 ОТБОР, СОРТИРОВКА И СТРАНИЦЫ СЧИТАЮТСЯ ЗДЕСЬ, НА СЕРВЕРЕ (2026-09-06, слово
// владельца: «это будет серверная пагинация»). Экран получает готовую страницу и
// не знает, сколько записей всего: когда цепочек станет тысячи, клиентский отбор
// означал бы тысячу записей в браузере ради двадцати показанных.
//
// 🛑 ДАННЫЕ СЕГОДНЯ ВЫДУМАННЫЕ, И ЭТО НАЗВАНО ЗДЕСЬ, А НЕ СПРЯТАНО. Владелец
// просил отрисовать на фейковых данных; настоящие записи придут из логов
// следующим шагом. Каждая запись несёт `demo: true`, и экран говорит это
// словами — заглушка, не объявившая себя заглушкой, есть ложь о работе системы.

/** Состояние цепочки: закончена или ещё идёт. */
export type AutomationStatus = "done" | "running"

export type Automation = {
  /** Имя файла целиком — вечный ключ и единственный источник имени и времени. */
  file: string
  /** Человеческое имя, разобранное из имени файла. */
  name: string
  /** Время из имени файла, как его писал автор: `dd-mm-yyyy hh:mm:ss`. */
  at: string
  /** Мгновение для сортировки. Ноль — время из имени не разобралось. */
  atUnix: number
  /** Адресный ключ страницы: имя файла без расширения. */
  id: string
  /** Сколько сообщений в цепочке. */
  steps: number
  status: AutomationStatus
  /** Порождена расписанием или порождает отложенное действие. */
  calendar: boolean
  /** Есть точки на карте. */
  map: boolean
  /** Свободные метки: по ним же идёт поиск. */
  tags: string[]
  /**
   * Вердикт человека: понравилось.
   *
   * 🔒 ТРИ СОСТОЯНИЯ, А НЕ ДВА: `yes` · `no` · **`null` — не спрашивали**.
   * Молчание не равно одобрению; слив «неизвестно» с «нет», мы наполнили бы
   * память отзывами, которых человек не давал.
   */
  liked: "yes" | "no" | null
  /** Вердикт человека: нужно доработать. Те же три состояния. */
  needsWork: "yes" | "no" | null
  /** Выдуманная запись, а не настоящая. */
  demo: boolean
}

/**
 * Разобрать имя файла `dd-mm-yyyy_hh-mm-ss_имя-цепочки.md`.
 *
 * 🔒 НЕРАЗБОРНОЕ ИМЯ НЕ ОТБРАСЫВАЕТСЯ, А ПОКАЗЫВАЕТСЯ КАК ЕСТЬ. Файл, чьё имя не
 * по формату, — это всё равно автоматизация; спрятав её, мы получили бы список,
 * который молча короче правды. Время у такой записи пустое, и сортировка кладёт
 * её в конец: выдумать ей дату значило бы соврать о цепочке.
 */
export function parseAutomationFile(file: string): {
  name: string
  at: string
  atUnix: number
  id: string
} {
  const id = file.replace(/\.[a-z]+$/i, "")
  const m = id.match(/^(\d{2})-(\d{2})-(\d{4})_(\d{2})-(\d{2})-(\d{2})_?(.*)$/)
  if (!m) {
    return { at: "", atUnix: 0, id, name: id }
  }
  const [, dd, mm, yyyy, hh, mi, ss, rest] = m
  return {
    at: `${dd}-${mm}-${yyyy} ${hh}:${mi}:${ss}`,
    atUnix: Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss)) / 1000,
    id,
    name: rest ? rest.replace(/[-_]+/g, " ") : id,
  }
}

// 🔒 У ВЫДУМАННОЙ ЗАПИСИ ВЕРДИКТА НЕТ ПО ОПРЕДЕЛЕНИЮ: его даёт человек, а этих
// автоматизаций не было. Подставить "понравилось" образцу значило бы показать
// отзыв, которого никто не оставлял.
type Demo = Omit<Automation, "at" | "atUnix" | "id" | "name" | "demo" | "liked" | "needsWork">

const DEMO: Demo[] = [
  { calendar: false, file: "06-09-2026_14-32-10_zakaz-taksi-do-aeroporta.md", map: true, status: "running", steps: 4, tags: ["поездка", "деньги"] },
  { calendar: false, file: "06-09-2026_11-05-47_spisok-produktov-v-magazin.md", map: false, status: "done", steps: 7, tags: ["покупки"] },
  { calendar: true, file: "05-09-2026_19-48-02_napomnit-pro-vstrechu-v-chetverg.md", map: false, status: "running", steps: 2, tags: ["встреча", "напоминание"] },
  { calendar: false, file: "05-09-2026_09-14-33_chek-iz-kafe-i-summa-rashoda.md", map: true, status: "done", steps: 5, tags: ["деньги", "чек"] },
  { calendar: true, file: "04-09-2026_21-02-19_otchet-po-rashodam-za-nedelyu.md", map: false, status: "done", steps: 9, tags: ["деньги", "отчёт"] },
  { calendar: false, file: "04-09-2026_16-40-55_gde-nahoditsya-master-po-remontu.md", map: true, status: "done", steps: 3, tags: ["адрес"] },
  { calendar: true, file: "04-09-2026_08-11-04_poliv-cvetov-kazhdyy-vtornik.md", map: false, status: "running", steps: 1, tags: ["напоминание", "дом"] },
  { calendar: false, file: "03-09-2026_22-57-31_perevod-scheta-za-internet.md", map: false, status: "done", steps: 6, tags: ["деньги", "счёт"] },
  { calendar: false, file: "03-09-2026_13-25-08_marshrut-do-dachi-v-vyhodnye.md", map: true, status: "running", steps: 4, tags: ["поездка", "адрес"] },
  { calendar: true, file: "02-09-2026_18-03-44_prodlit-strahovku-do-dekabrya.md", map: false, status: "done", steps: 8, tags: ["документы", "напоминание"] },
  { calendar: false, file: "02-09-2026_10-19-12_zametka-pro-knigu-i-avtora.md", map: false, status: "done", steps: 2, tags: ["заметка"] },
  { calendar: false, file: "01-09-2026_20-45-59_foto-cheka-iz-apteki.md", map: false, status: "running", steps: 3, tags: ["деньги", "чек", "здоровье"] },
]

/** Все автоматизации, без отбора. Сегодня выдуманные — см. оговорку в шапке. */
export function listAutomations(): Automation[] {
  return DEMO.map((d) => ({ ...d, ...parseAutomationFile(d.file), demo: true, liked: null, needsWork: null }))
}

/** Одна автоматизация по адресному ключу. Пусто — такой нет. */
export function automationById(id: string): Automation | undefined {
  return listAutomations().find((a) => a.id === id)
}

/**
 * Одна автоматизация ИЗ БАЗЫ, по номеру.
 *
 * ✗ НАЙДЕНО ВЛАДЕЛЬЦЕМ 2026-09-08, И ЭТО ХУДШИЙ ИЗ КЛАССОВ: список показывал
 * ЖИВЫЕ автоматизации из базы, а страница карточки искала номер среди ДВЕНАДЦАТИ
 * ВЫДУМАННЫХ образцов — и отвечала «автоматизации с таким адресом нет» о записи,
 * которая существует. Список и карточка читали разные источники.
 * 🔒 ПРИЗНАК, ПО КОТОРОМУ ЭТО ЛОВИТСЯ: две поверхности одной сущности обязаны
 * брать её В ОДНОМ МЕСТЕ. Здесь их было два, и второй никто не подключил.
 * 🛑 ОБРАЗЦЫ ОСТАЮТСЯ ЖИТЬ РЯДОМ: они помечены `demo: true` и нужны, пока база
 * пуста, — но живая запись ищется ПЕРВОЙ, и выдуманная её больше не заслоняет.
 */
export async function automationByIdLive(id: string): Promise<Automation | undefined> {
  const num = Number(id)
  if (Number.isInteger(num) && num > 0) {
    const { ok, rows } = await listForScreen()
    if (ok) {
      const found = rows.find(r => r.id === num)
      if (found) return fromRow(found)
    }
  }
  return automationById(id)
}

/** Адрес страницы автоматизации. */
export function hrefOfAutomation(lang: string, id: string): string {
  return `/${lang}/automation/${id}`
}

// ── ОТБОР, СОРТИРОВКА, СТРАНИЦЫ ──────────────────────────────────────────────

/** Сколько записей на странице. Первое значение — умолчание. */
export const PER_PAGE = [10, 25, 50, 100] as const
export type PerPage = (typeof PER_PAGE)[number]

/** Троичный фильтр: «всё равно» — не то же самое, что «нет». */
export type Tri = "any" | "yes" | "no"
export type SortDir = "new" | "old"

export type AutomationQuery = {
  q: string
  status: "any" | AutomationStatus
  calendar: Tri
  map: Tri
  sort: SortDir
  page: number
  per: PerPage
}

const isTri = (v: unknown): v is Tri => v === "any" || v === "yes" || v === "no"

/**
 * Привести сырые параметры адреса к запросу.
 *
 * 🔒 ЧУЖОЕ ЗНАЧЕНИЕ СТАНОВИТСЯ УМОЛЧАНИЕМ, А НЕ ОТКАЗОМ. Адрес правит человек и
 * присылает ссылку другому; `?per=999999` не имеет права ни уронить страницу, ни
 * вытащить всё разом.
 */
export function readAutomationQuery(raw: Record<string, string | undefined>): AutomationQuery {
  const per = Number(raw.per)
  const page = Number(raw.page)
  return {
    calendar: isTri(raw.calendar) ? raw.calendar : "any",
    map: isTri(raw.map) ? raw.map : "any",
    page: Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1,
    per: (PER_PAGE as readonly number[]).includes(per) ? (per as PerPage) : PER_PAGE[0],
    q: (raw.q ?? "").trim(),
    sort: raw.sort === "old" ? "old" : "new",
    status: raw.status === "done" || raw.status === "running" ? raw.status : "any",
  }
}

export type AutomationPage = {
  items: Automation[]
  /** Сколько записей прошло отбор — всего, а не на странице. */
  total: number
  /** Страниц всего; ноль записей — одна пустая страница, а не ноль страниц. */
  pages: number
  /** Какая страница показана на самом деле: запрошенная могла выйти за край. */
  page: number
  /** Номер первой и последней записи на странице, для строки «показано». */
  from: number
  to: number
}

const matchTri = (flag: boolean, want: Tri) => want === "any" || (want === "yes") === flag

/**
 * Отобрать, отсортировать и вырезать страницу.
 *
 * 🔒 ПОИСК ИДЁТ ПО ИМЕНИ И ПО МЕТКАМ ОДНОЙ СТРОКОЙ — прямое требование владельца:
 * «поиск по названию или по этим тегам». Два раздельных поля заставили бы
 * человека знать заранее, где искомое лежит.
 * 🔒 СТРАНИЦА ЗА КРАЕМ ПРИЖИМАЕТСЯ К ПОСЛЕДНЕЙ, А НЕ ОТДАЁТ ПУСТОТУ. Так бывает
 * от каждого сужения фильтра: человек был на пятой, отфильтровал — и записей
 * осталось на две. Пустой экран он прочитает как «ничего не нашлось».
 */
/**
 * Страница перечня — из НАСТОЯЩЕЙ таблицы, если в ней что-то есть (147-2).
 *
 * 🔒 ТРИ ИСХОДА, А НЕ ДВА, И ЭКРАН РАЗЛИЧАЕТ ИХ СЛОВАМИ:
 *   `db`     — записи есть, показываем их;
 *   `empty`  — база отвечает, записей ноль: разбор сообщений не построен (§1),
 *              номера присваивать нечему. Это НОРМА, и она объясняется;
 *   `down`   — до слоя данных не достучались. Это ПОЛОМКА.
 * Пустой список и недоступная база выглядят одинаково и значат противоположное;
 * слив их, мы показали бы человеку норму вместо аварии.
 *
 * 🛑 ВЫДУМАННЫЕ ЗАПИСИ ОСТАЮТСЯ ТОЛЬКО ПРИ `empty` И ТОЛЬКО НАЗВАННЫМИ. Экран
 * говорит, что это образец: заглушка, не объявившая себя заглушкой, есть ложь о
 * работе системы.
 */
export async function queryAutomationsLive(query: AutomationQuery): Promise<AutomationPage & { source: "db" | "empty" | "down" }> {
  const { ok, rows } = await listForScreen()
  if (!ok) return { ...queryAutomations(query, []), source: "down" }
  if (rows.length === 0) return { ...queryAutomations(query), source: "empty" }
  return { ...queryAutomations(query, rows.map(fromRow)), source: "db" }
}

/** Строка базы — в запись перечня. Имя берётся из саммари, а его пока нет. */
/**
 * Строка базы — в запись перечня.
 *
 * ✗ ЗДЕСЬ БЫЛИ ТРИ ЛЖИВЫХ ПОЛЯ, И ИСПРАВЛЕНЫ ОНИ ИЗМЕРЕНИЕМ 2026-09-08 (144):
 *   `calendar` стоял `false` ВСЕГДА — при живых строках расписания;
 *   `map` брался как `Boolean(scopeKey)`, то есть ОХВАТ выдавался за ГЕОМЕТКУ;
 *   `status` брался из `confirm_state`, а состояние РАБОТЫ на экран не ехало;
 *   `steps` стоял `0` при существующей ленте прогона.
 * 🔒 РАЗНИЦА МЕЖДУ ПУСТЫМ И `false` — НЕ ПРИДИРКА: пустое человек читает как
 * «пока нет», а `false` — как «проверено, нет», и второе останавливает поиск.
 */
function fromRow(r: ScreenAutomation): Automation {
  const at = r.createdAt.replace("T", " ").replace("Z", "")
  return {
    // 🛑 ФАЙЛА У ЖИВОЙ ЗАПИСИ НЕТ, И ЗДЕСЬ ЛЕЖИТ ПУСТОТА, А НЕ НОМЕР.
    // ✗ найдено владельцем 2026-09-09: карточка показывала «Файл: №47» — подпись
    // про файл при значении, файлом не являющемся. Номер уже назван именем и
    // адресом; повторить его под чужой подписью значит соврать о природе записи.
    file: "",
    // 🔒 БЕЗ САММАРИ ИМЕНЕМ СЛУЖИТ НОМЕР, А НЕ ВЫДУМАННОЕ НАЗВАНИЕ: номер —
    // это то, что человек произносит вслух, и он всегда верен.
    name: r.summary ?? `Автоматизация № ${r.id}`,
    at,
    atUnix: Date.parse(r.createdAt) || 0,
    id: String(r.id),
    // 🔒 СТРОКИ ЛЕНТЫ, А НЕ ВЫДУМАННЫЙ НОЛЬ. Сегодня их по одной на сообщение:
    // разбор, пишущий `resolve`/`reveal`, — следующий слой (§3ж).
    steps: r.rows,
    // 🔒 СОСТОЯНИЕ РАБОТЫ (§3е), А НЕ ПОДТВЕРЖДЁННОСТЬ НОМЕРА. Это разные
    // вопросы: «человек подтвердил номер» и «работа идёт или закончена».
    status: r.state === "closed" ? "done" : "running",
    calendar: r.calendar,
    // 🛑 ГЕОМЕТКА, А НЕ ОХВАТ (§3к). «Я в Мадриде» задаёт охват разговора;
    // отметку на карте даёт присланное МЕСТО. Прежний код зажигал карту на
    // любом названном городе — у автоматизации, где карты не было вовсе.
    map: r.geo,
    tags: r.tags,
    liked: r.liked,
    needsWork: r.needsWork,
    demo: false,
  }
}

export function queryAutomations(query: AutomationQuery, source?: Automation[]): AutomationPage {
  const needle = query.q.toLowerCase()

  const found = (source ?? listAutomations())
    .filter((a) => {
      if (query.status !== "any" && a.status !== query.status) {
        return false
      }
      if (!(matchTri(a.calendar, query.calendar) && matchTri(a.map, query.map))) {
        return false
      }
      if (!needle) {
        return true
      }
      return (
        a.name.toLowerCase().includes(needle) ||
        a.tags.some((t) => t.toLowerCase().includes(needle))
      )
    })
    .sort((x, y) => (query.sort === "new" ? y.atUnix - x.atUnix : x.atUnix - y.atUnix))

  const total = found.length
  const pages = Math.max(1, Math.ceil(total / query.per))
  const page = Math.min(query.page, pages)
  const start = (page - 1) * query.per
  const items = found.slice(start, start + query.per)

  return {
    from: total === 0 ? 0 : start + 1,
    items,
    page,
    pages,
    to: start + items.length,
    total,
  }
}
