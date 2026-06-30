import { Bot, InlineKeyboard, InputFile } from 'grammy'
import type { AppConfig } from './config.ts'
import { Core } from './core.ts'
import { Registry } from './registry.ts'
import { TopicMap } from './topics.ts'
import { SettingsStore } from './settingsStore.ts'
import { SessionStore } from './sessionStore.ts'
import { ensureTopics } from './topicSetup.ts'
import { resolveProject } from './route.ts'
import { isAllowed } from './auth.ts'
import { renderToolUse, resultFooter } from './render.ts'
import { mdToHtml } from './mdToHtml.ts'
import { splitForTelegram } from './chunk.ts'
import { MODELS, EFFORTS, FALLBACK_MODELS, parseSettingAction, settingPatch, renderSettings, checkPin } from './settings.ts'
import { ApprovalRegistry, renderApprovalRequest, parseApprovalCallback } from './approvals.ts'
import { renderStatus, type StatusItem } from './status.ts'
import { LimitsStore, type QueueItem } from './limitsStore.ts'
import { classifyLimit, formatReset, renderLimits } from './limits.ts'
import { shouldAutoFailover } from './providers.ts'
import { SpendStore, todayStr } from './spendStore.ts'
import { renderSpend } from './spendView.ts'
import { getRouteraiBalance } from './routeraiBalance.ts'
import { RunStore } from './runStore.ts'
import { parseRecoveryCallback } from './recovery.ts'
import { ProjectStore } from './projectStore.ts'
import { listSubdirs, resolveInsideRoot } from './dirBrowser.ts'
import { toSlug, dedupeSlug } from './slug.ts'
import {
  startWizard, selectRoot, enterSegment, goUp, setPage, selectCurrent, awaitNewFolder,
  setLabel, setMode, PAGE_SIZE, type WizardState,
} from './projectWizard.ts'
import { mkdirSync, existsSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { log } from './logger.ts'

const DEFAULT_PROJECT = 'spike' // маршрут для личного чата (запасной)
const TG_LIMIT = 4096
const FILE_THRESHOLD = 20000 // сырой markdown длиннее — отдаём .md файлом
const MAX_ANSWER_CHUNKS = 8 // больше кусков — лучше файлом
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000
const APPROVAL_REMINDER_MS = 2 * 60 * 1000 // напомнить, если апрув висит дольше 2 мин
const CONTINUE_BUFFER_MS = 5000 // запас после resetsAt перед авто-продолжением

function settingsKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard()
  for (const m of MODELS) kb.text(m.label, `set:model:${m.id}`)
  kb.row()
  for (const e of EFFORTS) kb.text(e, `set:effort:${e}`)
  kb.row()
  kb.text('accept edits', 'set:mode:acceptEdits').text('default', 'set:mode:default').text('auto 🔒', 'mode:auto-locked')
  kb.row()
  for (const m of FALLBACK_MODELS) kb.text('FB: ' + m.label, `set:fallback:${m.id}`)
  kb.row()
  kb.text('🟦 Claude', 'provider:claude').text('🟠 Fallback', 'provider:fallback')
  kb.row()
  kb.text('авто-FB вкл', 'set:autofailover:on').text('авто-FB выкл', 'set:autofailover:off')
  return kb
}

export function createBot(
  config: AppConfig,
  core: Core,
  registry: Registry,
  topics: TopicMap,
  settings: SettingsStore,
  sessions: SessionStore,
  limits: LimitsStore,
  runs: RunStore,
  spend: SpendStore,
  projects: ProjectStore,
): Bot {
  const bot = new Bot(config.botToken)
  const approvals = new ApprovalRegistry()

  // Состояние мастера добавления проекта (in-memory, один активный на юзера).
  const wizards = new Map<number, WizardState>()
  const pending = new Map<number, { kind: 'wizard:newfolder' | 'proj:rename'; slug?: string }>()

  bot.catch((err) => {
    log.error('bot.catch:', err.error instanceof Error ? err.error.message : String(err.error))
    void bot.api.sendMessage(config.allowedUserId, '⚠️ Ошибка обработки апдейта: ' + (err.error instanceof Error ? err.error.message : String(err.error))).catch(() => {})
  })

  const projectFor = (chatType: string | undefined, threadId: number | undefined) =>
    resolveProject({
      chatType: chatType ?? 'private',
      threadId,
      defaultProject: DEFAULT_PROJECT,
      projectForThread: (id) => topics.projectForThread(id),
    })

  // Планировщик авто-продолжения: по наступлении resetsAt дозапускает запрос из очереди.
  function scheduleContinue(item: QueueItem): void {
    const delay = Math.max(0, item.resetsAt * 1000 - Date.now()) + CONTINUE_BUFFER_MS
    setTimeout(async () => {
      limits.removeQueue(item.id)
      const opts = item.threadId ? { message_thread_id: item.threadId } : {}
      await bot.api.sendMessage(item.chatId, `▶️ Лимиты восстановлены — продолжаю «${item.project}».`, opts).catch(() => {})
      await executeRun(item.chatId, item.threadId ?? undefined, item.project, item.prompt)
    }, delay)
  }

  // Возврат на Claude по наступлении resetsAt после авто-фолбэка.
  function scheduleSwitchBack(project: string, resetsAt: number, chatId: number, threadId: number | undefined): void {
    const delay = Math.max(0, resetsAt * 1000 - Date.now()) + CONTINUE_BUFFER_MS
    setTimeout(async () => {
      core.setProvider(project, 'claude')
      const opts = threadId ? { message_thread_id: threadId } : {}
      await bot.api.sendMessage(chatId, `▶️ Лимиты Claude вернулись — «${project}» снова на Claude.`, opts).catch(() => {})
    }, delay)
  }

  // Дедуп анонсов сброса окна: window -> уже анонсированный resetsAt.
  const announcedReset = new Map<string, number>()
  let spendAlertedDay = ''
  function scheduleLimitResetNotice(window: string, resetsAt: number): void {
    if (resetsAt * 1000 <= Date.now()) return
    if (announcedReset.get(window) === resetsAt) return
    announcedReset.set(window, resetsAt)
    const delay = resetsAt * 1000 - Date.now() + 1000
    setTimeout(async () => {
      await bot.api.sendMessage(config.allowedUserId, `📊 Лимиты Claude сбросились (${window}) — снова полные.`).catch(() => {})
    }, delay)
  }

  // Единая обработка прогона: статус → стрим → апрувы → детект исчерпания/очередь.
  // Работает через bot.api (без ctx), чтобы её мог вызвать и планировщик.
  async function executeRun(chatId: number, threadId: number | undefined, project: string, prompt: string): Promise<void> {
    const opts = threadId ? { message_thread_id: threadId } : {}
    const send = (text: string) => bot.api.sendMessage(chatId, text, opts)
    const runId = runs.start(project, chatId, threadId ?? null, prompt)
    try {

    const onApproval = async (toolName: string, input: unknown) => {
      const { id, promise } = approvals.register()
      const kb = new InlineKeyboard().text('✔ Разрешить', `appr:approve:${id}`).text('✖ Отклонить', `appr:deny:${id}`)
      const m = await bot.api.sendMessage(chatId, renderApprovalRequest(toolName, input), { ...opts, reply_markup: kb })
      const denyTimer = setTimeout(() => { approvals.resolve(id, 'deny') }, APPROVAL_TIMEOUT_MS)
      const remindTimer = setTimeout(() => {
        void bot.api.sendMessage(chatId, `⏰ Всё ещё ждёт разрешения: 🔧 ${toolName}`, opts).catch(() => {})
      }, APPROVAL_REMINDER_MS)
      const decision = await promise
      clearTimeout(denyTimer)
      clearTimeout(remindTimer)
      const verdict = decision.allow ? '✅ Разрешено' : '🚫 ' + decision.message
      await bot.api.editMessageText(chatId, m.message_id, renderApprovalRequest(toolName, input) + '\n' + verdict).catch(() => {})
      return decision
    }

    const stopKb = new InlineKeyboard().text('⏹ Стоп', `stop:${project}`)
    const status = await bot.api.sendMessage(chatId, '⏳ работаю…', { ...opts, reply_markup: stopKb })
    let statusDropped = false
    const dropStatus = async () => {
      if (statusDropped) return
      statusDropped = true
      await bot.api.deleteMessage(chatId, status.message_id).catch(() => {})
    }

    let answerMsgId: number | null = null
    let answerBuf = ''
    let lastEdit = 0
    let lastHead = ''
    const sendHtml = (text: string) => bot.api.sendMessage(chatId, text, { ...opts, parse_mode: 'HTML' })
    // Стримим первый чанк в живое сообщение; при финале доносим остальные чанки,
    // а очень длинный ответ — файлом answer.md (вместо обрезки на 4096).
    const renderAnswer = async (force: boolean) => {
      const html = mdToHtml(answerBuf || '…')
      const chunks = splitForTelegram(html, TG_LIMIT)
      const head = chunks[0]
      if (answerMsgId === null) {
        const m = await sendHtml(head)
        answerMsgId = m.message_id
        lastHead = head
        lastEdit = Date.now()
      } else if (head !== lastHead) {
        const now = Date.now()
        if (!force && now - lastEdit < 1500) return
        lastEdit = now
        lastHead = head
        await bot.api.editMessageText(chatId, answerMsgId, head, { parse_mode: 'HTML' }).catch(() => {})
      }
      if (!force) return
      if (answerBuf.length > FILE_THRESHOLD || chunks.length > MAX_ANSWER_CHUNKS) {
        await bot.api.sendDocument(chatId, new InputFile(Buffer.from(answerBuf, 'utf8'), 'answer.md'), { ...opts, caption: '📄 полный ответ' }).catch(() => {})
        return
      }
      for (let i = 1; i < chunks.length; i++) await sendHtml(chunks[i])
    }

    let limitBlocked = false
    let blockedResetsAt = 0
    let stopped = false
    try {
      await core.handle(project, prompt, async (ev) => {
        if (ev.kind === 'assistant_text') {
          answerBuf += ev.text
          await renderAnswer(false)
        } else if (ev.kind === 'tool_use') {
          if (answerMsgId !== null) await renderAnswer(true)
          answerMsgId = null
          answerBuf = ''
          lastHead = ''
          await bot.api.sendMessage(chatId, renderToolUse(ev.name, ev.input), { ...opts, parse_mode: 'HTML' })
        } else if (ev.kind === 'result') {
          if (answerBuf) await renderAnswer(true)
          if (ev.interrupted) {
            if (!stopped) await send('⏹ Остановлено.')
            stopped = true
          } else if (!limitBlocked) {
            await send(resultFooter(ev))
          }
          spend.add(project, core.getProvider(project), ev.costUsd)
          const day = todayStr()
          if (config.spendAlertUsd !== null && spendAlertedDay !== day && spend.todayTotal(day) >= config.spendAlertUsd) {
            spendAlertedDay = day
            void bot.api.sendMessage(config.allowedUserId, `💰 Дневная оценка трат превысила $${config.spendAlertUsd}.`).catch(() => {})
          }
        } else if (ev.kind === 'init') {
          log.info('[run]', project, 'model=', ev.model, 'mode=', ev.mode)
        } else if (ev.kind === 'rate_limit') {
          // Некоторые rate_limit-события приходят без utilization/resetsAt — их в БД не пишем (колонки NOT NULL).
          if (typeof ev.utilization === 'number' && typeof ev.resetsAt === 'number') {
            scheduleLimitResetNotice(ev.rateLimitType, ev.resetsAt)
            limits.upsertLimit({ window: ev.rateLimitType, utilization: ev.utilization, resetsAt: ev.resetsAt, status: ev.status })
            if (classifyLimit(ev.status) === 'blocked') { limitBlocked = true; blockedResetsAt = ev.resetsAt }
          } else {
            log.info('[rate_limit] неполное событие, пропуск:', ev.status)
          }
        }
      }, onApproval)
    } catch (err) {
      const aborted = err instanceof Error && (err.name === 'AbortError' || /abort/i.test(err.message))
      if (aborted) {
        if (!stopped) await send('⏹ Остановлено.')
      } else {
        const msg = err instanceof Error ? err.message : String(err)
        log.error('[run error]', project, msg)
        if (!limitBlocked) await send('❌ Сбой: ' + msg)
      }
    }
    await dropStatus()

    // Исчерпание: авто-фолбэк (если включён) или очередь+ожидание (M5.5).
    if (limitBlocked) {
      const eff = settings.effective(project, registry.get(project).defaultMode)
      if (shouldAutoFailover(eff.autoFailover, config.fallback !== null, core.getProvider(project))) {
        core.setProvider(project, 'fallback')
        const fbLabel = FALLBACK_MODELS.find((m) => m.id === eff.fallbackModel)?.label ?? eff.fallbackModel
        await send(`⛔ Лимиты Claude кончились — перехожу на fallback (${fbLabel}). Возврат в ${formatReset(blockedResetsAt, Date.now())}.`)
        scheduleSwitchBack(project, blockedResetsAt, chatId, threadId)
        void executeRun(chatId, threadId, project, prompt)
      } else {
        const base = { project, chatId, threadId: threadId ?? null, prompt, resetsAt: blockedResetsAt }
        const id = limits.enqueue(base)
        await send(`⛔ Лимиты закончились.\nВосстановление ${formatReset(blockedResetsAt, Date.now())}.\nПродолжу запрос автоматически.`)
        scheduleContinue({ id, ...base })
      }
    }
    } finally {
      runs.remove(runId)
    }
  }

  // ── Мастер добавления проекта: рендеры экранов ──
  function renderPickRoot(roots: string[]): { text: string; kb: InlineKeyboard } {
    const kb = new InlineKeyboard()
    roots.forEach((r, i) => { kb.text(r, `wiz:root:${i}`).row() })
    kb.text('✖️ Отмена', 'wiz:cancel')
    return { text: 'Выбери корень:', kb }
  }

  function renderBrowse(state: Extract<WizardState, { stage: 'browse' }>): { text: string; kb: InlineKeyboard } {
    let page
    try { page = listSubdirs(state.currentPath, state.page, PAGE_SIZE) }
    catch (e) { return { text: `Ошибка чтения: ${e instanceof Error ? e.message : String(e)}`, kb: new InlineKeyboard().text('✖️ Отмена', 'wiz:cancel') } }
    const kb = new InlineKeyboard()
    page.items.forEach((name, i) => { kb.text(`📁 ${name}`, `wiz:enter:${i}`).row() })
    const totalPages = Math.max(1, Math.ceil(page.total / PAGE_SIZE))
    if (totalPages > 1) {
      if (state.page > 0) kb.text('◀️', 'wiz:page:prev')
      kb.text(`${state.page + 1}/${totalPages}`, 'wiz:nop')
      if (state.page < totalPages - 1) kb.text('▶️', 'wiz:page:next')
      kb.row()
    }
    const atRoot = resolve(state.currentPath) === resolve(state.rootPath)
    if (!atRoot) kb.text('⬆️ Вверх', 'wiz:up').row()
    kb.text('✅ Выбрать эту', 'wiz:select').row()
    kb.text('➕ Новая папка…', 'wiz:newfolder').row()
    if (state.roots.length > 1) kb.text('🏠 Сменить корень', 'wiz:home')
    kb.text('✖️ Отмена', 'wiz:cancel')
    const header = state.awaitingNewFolder
      ? `📁 ${state.currentPath}\n\nПришли имя новой папки сообщением.`
      : `📁 ${state.currentPath}\n(папок: ${page.total})`
    return { text: header, kb }
  }

  function renderAwaitLabel(dir: string): { text: string; kb: InlineKeyboard } {
    const def = basename(dir)
    return {
      text: `Папка: ${dir}\n\nКак назвать проект? Пришли имя сообщением или жми кнопку.`,
      kb: new InlineKeyboard().text(`Назвать «${def}»`, 'wiz:labeldef').text('✖️ Отмена', 'wiz:cancel'),
    }
  }

  function renderPickMode(): { text: string; kb: InlineKeyboard } {
    return {
      text: 'Режим по умолчанию:',
      kb: new InlineKeyboard()
        .text('acceptEdits', 'wiz:mode:acceptEdits')
        .text('default', 'wiz:mode:default')
        .row()
        .text('✖️ Отмена', 'wiz:cancel'),
    }
  }

  async function showWizard(chatId: number, state: WizardState): Promise<void> {
    let view: { text: string; kb: InlineKeyboard } | undefined
    if (state.stage === 'pickRoot') view = renderPickRoot(state.roots)
    else if (state.stage === 'browse') view = renderBrowse(state)
    else if (state.stage === 'awaitLabel') view = renderAwaitLabel(state.dir)
    else if (state.stage === 'pickMode') view = renderPickMode()
    if (!view) return
    await bot.api.sendMessage(chatId, view.text, { reply_markup: view.kb })
  }

  async function finishWizard(chatId: number, userId: number, st: Extract<WizardState, { stage: 'done' }>): Promise<void> {
    wizards.delete(userId); pending.delete(userId)
    if (projects.isDirTaken(st.dir)) {
      await bot.api.sendMessage(chatId, `Эта папка уже привязана к проекту: ${st.dir}`)
      return
    }
    const slug = dedupeSlug(toSlug(st.label), new Set(projects.list().map((p) => p.slug)))
    let threadId: number
    try {
      const t = await bot.api.createForumTopic(config.groupId, st.label)
      threadId = t.message_thread_id
    } catch (e) {
      await bot.api.sendMessage(chatId, `Не удалось создать топик: ${e instanceof Error ? e.message : String(e)}. Проект не сохранён.`)
      return
    }
    projects.add({ slug, label: st.label, dir: st.dir, defaultMode: st.defaultMode, threadId })
    topics.set(slug, threadId)
    await bot.api.sendMessage(
      chatId,
      `✅ Проект создан\n• имя: ${st.label}\n• slug: ${slug}\n• папка: ${st.dir}\n• режим: ${st.defaultMode}\n• топик: ${threadId}`,
    )
  }

  // Auth.
  bot.use(async (ctx, next) => {
    if (isAllowed(ctx.from?.id, config.allowedUserId)) return next()
    if (ctx.chat?.type === 'private') await ctx.reply('⛔ Доступ запрещён.')
  })

  bot.command('start', (ctx) =>
    ctx.reply('Привет! Пиши промпт в теме проекта. /status /settings /limits /new /setup, auto — /auto <PIN>.'),
  )

  bot.command('setup', async (ctx) => {
    const created = await ensureTopics(bot.api, config.groupId, registry.names(), topics)
    await ctx.reply(created.length ? 'Созданы темы: ' + created.join(', ') : 'Все темы уже существуют.')
  })

  bot.command('status', async (ctx) => {
    const items: StatusItem[] = registry.names().map((p) => {
      const eff = settings.effective(p, registry.get(p).defaultMode)
      return { project: p, mode: eff.mode, model: eff.model, effort: eff.effort, hasSession: sessions.getSessionId(p) !== undefined, running: core.isRunning(p) }
    })
    await ctx.reply(renderStatus(items), ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {})
  })

  bot.command('limits', async (ctx) => {
    await ctx.reply(renderLimits(limits.listLimits(), Date.now()), ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {})
  })

  bot.command('spend', async (ctx) => {
    let balance: number | null = null
    if (config.fallback) {
      balance = await getRouteraiBalance(config.fallback.baseUrl, config.fallback.apiKey).catch(() => null)
    }
    await ctx.reply(renderSpend(spend.today(), balance), ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {})
  })

  bot.command('new', async (ctx) => {
    const threadId = ctx.message?.message_thread_id
    const project = projectFor(ctx.chat?.type, threadId)
    if (!project) { await ctx.reply('Эта тема не привязана к проекту.'); return }
    sessions.clear(project)
    await ctx.reply(`🆕 ${project}: начнётся новая сессия.`, threadId ? { message_thread_id: threadId } : {})
  })

  bot.command('addproject', async (ctx) => {
    const roots = projects.roots().map((r) => r.path)
    if (roots.length === 0) { await ctx.reply('Нет корней. Добавь: /roots add <абсолютный путь>'); return }
    const state = startWizard(roots)
    wizards.set(ctx.from!.id, state)
    pending.delete(ctx.from!.id)
    await showWizard(ctx.chat!.id, state)
  })

  bot.command('projects', async (ctx) => {
    const rows = projects.list()
    if (rows.length === 0) { await ctx.reply('Проектов нет. /addproject'); return }
    const kb = new InlineKeyboard()
    for (const p of rows) {
      const tag = core.isRunning(p.slug) ? ' ▶️' : ''
      kb.text(`${p.label}${tag}`, 'wiz:nop').row()
      kb.text('✏️', `proj:rename:${p.slug}`).text('🗑', `proj:del:${p.slug}`).row()
    }
    kb.text('➕ Добавить проект', 'proj:add')
    await ctx.reply('Проекты:', { reply_markup: kb })
  })

  bot.command('roots', async (ctx) => {
    const arg = (ctx.match ?? '').toString().trim()
    if (arg.startsWith('add ')) {
      const path = resolve(arg.slice(4).trim())
      if (!existsSync(path)) { await ctx.reply(`Не существует: ${path}`); return }
      projects.addRoot(path)
      await ctx.reply(`✅ Корень добавлен: ${path}`)
      return
    }
    if (arg.startsWith('rm ')) {
      const path = resolve(arg.slice(3).trim())
      projects.removeRoot(path)
      await ctx.reply(`🗑 Корень удалён: ${path}`)
      return
    }
    const list = projects.roots()
    if (list.length === 0) { await ctx.reply('Корней нет. Добавь: /roots add <абсолютный путь>'); return }
    await ctx.reply('Корни:\n' + list.map((r) => `• ${r.path}`).join('\n'))
  })

  bot.command('stop', async (ctx) => {
    const threadId = ctx.message?.message_thread_id
    const project = projectFor(ctx.chat?.type, threadId)
    if (!project) { await ctx.reply('Эта тема не привязана к проекту.'); return }
    const ok = core.interrupt(project)
    await ctx.reply(ok ? '⏹ Останавливаю…' : 'Нечего останавливать.', threadId ? { message_thread_id: threadId } : {})
  })

  // /simlimit [промпт] — DEV: симулирует исчерпание (reset через 30с) и ставит запрос в очередь,
  // чтобы вживую показать авто-продолжение без реального упора в лимит.
  bot.command('simlimit', async (ctx) => {
    const threadId = ctx.message?.message_thread_id
    const project = projectFor(ctx.chat?.type, threadId)
    if (!project || !ctx.chat) { await ctx.reply('Эта тема не привязана к проекту.'); return }
    const prompt = (ctx.match ?? '').toString().trim() || 'Скажи одно слово: готово.'
    const resetsAt = Math.floor(Date.now() / 1000) + 30
    const base = { project, chatId: ctx.chat.id, threadId: threadId ?? null, prompt, resetsAt }
    const id = limits.enqueue(base)
    await ctx.reply(`⛔ [симуляция] Лимиты закончились. Восстановление ${formatReset(resetsAt, Date.now())}. Продолжу автоматически.`, threadId ? { message_thread_id: threadId } : {})
    scheduleContinue({ id, ...base })
  })

  // /simfail [промпт] — DEV: симулирует авто-фолбэк (переход на fallback + дозапуск + возврат через 30с).
  bot.command('simfail', async (ctx) => {
    const threadId = ctx.message?.message_thread_id
    const project = projectFor(ctx.chat?.type, threadId)
    if (!project || !ctx.chat) { await ctx.reply('Эта тема не привязана к проекту.'); return }
    if (!config.fallback) { await ctx.reply('Фолбэк не настроен (ROUTERAI_API_KEY).'); return }
    const prompt = (ctx.match ?? '').toString().trim() || 'Скажи одно слово: готово.'
    core.setProvider(project, 'fallback')
    const eff = settings.effective(project, registry.get(project).defaultMode)
    const fbLabel = FALLBACK_MODELS.find((m) => m.id === eff.fallbackModel)?.label ?? eff.fallbackModel
    const resetsAt = Math.floor(Date.now() / 1000) + 30
    await ctx.reply(`⛔ [симуляция] Лимиты Claude кончились — перехожу на fallback (${fbLabel}). Возврат через ~30с.`, threadId ? { message_thread_id: threadId } : {})
    scheduleSwitchBack(project, resetsAt, ctx.chat.id, threadId ?? undefined)
    void executeRun(ctx.chat.id, threadId ?? undefined, project, prompt)
  })

  bot.command('settings', async (ctx) => {
    const threadId = ctx.message?.message_thread_id
    const project = projectFor(ctx.chat?.type, threadId)
    if (!project) { await ctx.reply('Эта тема не привязана к проекту.'); return }
    const eff = settings.effective(project, registry.get(project).defaultMode)
    await ctx.reply(`Проект: ${project}\nПровайдер: ${core.getProvider(project)}\n${renderSettings(eff)}`, {
      reply_markup: settingsKeyboard(),
      ...(threadId ? { message_thread_id: threadId } : {}),
    })
  })

  bot.command('auto', async (ctx) => {
    const threadId = ctx.message?.message_thread_id
    const project = projectFor(ctx.chat?.type, threadId)
    if (!project) { await ctx.reply('Эта тема не привязана к проекту.'); return }
    const arg = (ctx.match ?? '').toString()
    if (!checkPin(arg, config.pin)) {
      await ctx.reply('❌ Неверный PIN. Использование: /auto <PIN>', threadId ? { message_thread_id: threadId } : {})
      return
    }
    settings.set(project, { mode: 'bypassPermissions' })
    await ctx.reply(`🔴 ${project}: режим auto (bypass) включён.`, threadId ? { message_thread_id: threadId } : {})
  })

  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data
    const userId = ctx.from.id
    const chatId = ctx.chat?.id ?? userId

    // ── Мастер добавления / CRUD проектов ──
    if (data === 'proj:add') {
      const roots = projects.roots().map((r) => r.path)
      if (roots.length === 0) { await ctx.answerCallbackQuery({ text: 'Нет корней (/roots add)', show_alert: true }); return }
      const st = startWizard(roots)
      wizards.set(userId, st); pending.delete(userId)
      await ctx.answerCallbackQuery()
      await showWizard(chatId, st); return
    }

    if (data.startsWith('wiz:')) {
      await ctx.answerCallbackQuery()
      const st = wizards.get(userId)
      if (!st) return
      if (data === 'wiz:cancel') { wizards.delete(userId); pending.delete(userId); await bot.api.sendMessage(chatId, '✖️ Отменено.'); return }
      if (data === 'wiz:nop') return
      if (data === 'wiz:home') { const next = startWizard(projects.roots().map((r) => r.path)); wizards.set(userId, next); await showWizard(chatId, next); return }
      if (st.stage === 'pickRoot' && data.startsWith('wiz:root:')) {
        const next = selectRoot(st, Number(data.slice('wiz:root:'.length))); wizards.set(userId, next); await showWizard(chatId, next); return
      }
      if (st.stage === 'browse') {
        if (data === 'wiz:up') { const next = goUp(st, (seg) => resolveInsideRoot(st.rootPath, st.currentPath, seg)); wizards.set(userId, next); await showWizard(chatId, next); return }
        if (data === 'wiz:select') { const next = selectCurrent(st); wizards.set(userId, next); await showWizard(chatId, next); return }
        if (data === 'wiz:newfolder') { const next = awaitNewFolder(st); wizards.set(userId, next); pending.set(userId, { kind: 'wizard:newfolder' }); await showWizard(chatId, next); return }
        if (data === 'wiz:page:prev') { const next = setPage(st, st.page - 1); wizards.set(userId, next); await showWizard(chatId, next); return }
        if (data === 'wiz:page:next') { const next = setPage(st, st.page + 1); wizards.set(userId, next); await showWizard(chatId, next); return }
        if (data.startsWith('wiz:enter:')) {
          const page = listSubdirs(st.currentPath, st.page, PAGE_SIZE)
          const name = page.items[Number(data.slice('wiz:enter:'.length))]
          if (!name) return
          const next = enterSegment(st, name, (seg) => resolveInsideRoot(st.rootPath, st.currentPath, seg))
          wizards.set(userId, next); await showWizard(chatId, next); return
        }
        return
      }
      if (st.stage === 'awaitLabel' && data === 'wiz:labeldef') {
        const next = setLabel(st, basename(st.dir)); wizards.set(userId, next); await showWizard(chatId, next); return
      }
      if (st.stage === 'pickMode' && data.startsWith('wiz:mode:')) {
        const next = setMode(st, data.slice('wiz:mode:'.length) as 'acceptEdits' | 'default')
        if (next.stage === 'done') await finishWizard(chatId, userId, next)
        return
      }
      return
    }

    if (data.startsWith('proj:del:yes:')) {
      const slug = data.slice('proj:del:yes:'.length)
      await ctx.answerCallbackQuery()
      if (core.isRunning(slug)) { await bot.api.sendMessage(chatId, `«${slug}» сейчас выполняется — сначала /stop.`); return }
      const row = projects.get(slug)
      projects.remove(slug); topics.remove(slug); settings.remove(slug); sessions.clear(slug)
      if (row?.threadId) { try { await bot.api.closeForumTopic(config.groupId, row.threadId) } catch { /* ignore */ } }
      await ctx.editMessageText(`🗑 Удалено: ${row?.label ?? slug}`).catch(() => {})
      return
    }
    if (data.startsWith('proj:del:no:')) { await ctx.answerCallbackQuery(); await ctx.editMessageText('Отмена удаления.').catch(() => {}); return }
    if (data.startsWith('proj:del:')) {
      const slug = data.slice('proj:del:'.length)
      const row = projects.get(slug)
      await ctx.answerCallbackQuery()
      const kb = new InlineKeyboard().text('Да, удалить', `proj:del:yes:${slug}`).text('Нет', `proj:del:no:${slug}`)
      await bot.api.sendMessage(chatId, `Удалить «${row?.label ?? slug}»? Файлы на диске останутся.`, { reply_markup: kb })
      return
    }
    if (data.startsWith('proj:rename:')) {
      const slug = data.slice('proj:rename:'.length)
      pending.set(userId, { kind: 'proj:rename', slug })
      await ctx.answerCallbackQuery()
      await bot.api.sendMessage(chatId, `Пришли новое имя для «${slug}».`)
      return
    }

    if (data.startsWith('stop:')) {
      const ok = core.interrupt(data.slice(5))
      await ctx.answerCallbackQuery(ok ? '⏹ Останавливаю…' : 'Нечего останавливать')
      return
    }

    const rec = parseRecoveryCallback(data)
    if (rec) {
      const r = runs.get(rec.id)
      if (!r) { await ctx.answerCallbackQuery('Запрос уже неактивен'); return }
      runs.remove(rec.id)
      await ctx.editMessageText('Восстановление: ' + (rec.action === 'continue' ? '▶️ продолжаю' : rec.action === 'restart' ? '🔄 заново' : '✖️ отменено')).catch(() => {})
      await ctx.answerCallbackQuery('Ок')
      if (rec.action === 'continue') void executeRun(r.chatId, r.threadId ?? undefined, r.project, 'Продолжи прерванную задачу, которую не успел закончить.')
      else if (rec.action === 'restart') void executeRun(r.chatId, r.threadId ?? undefined, r.project, r.prompt)
      return
    }

    const appr = parseApprovalCallback(data)
    if (appr) {
      const ok = approvals.resolve(appr.id, appr.decision)
      await ctx.answerCallbackQuery(ok ? (appr.decision === 'approve' ? '✔ Разрешено' : '✖ Отклонено') : 'Запрос уже неактивен')
      return
    }

    if (data === 'mode:auto-locked') {
      await ctx.answerCallbackQuery({ text: 'Включить auto: отправь команду /auto <PIN>', show_alert: true })
      return
    }

    if (data === 'provider:claude' || data === 'provider:fallback') {
      const tId = ctx.callbackQuery.message?.message_thread_id
      const proj = projectFor(ctx.callbackQuery.message?.chat.type, tId)
      if (!proj) { await ctx.answerCallbackQuery('Нет проекта'); return }
      const want = data === 'provider:fallback' ? 'fallback' : 'claude'
      if (want === 'fallback' && !config.fallback) { await ctx.answerCallbackQuery({ text: 'Фолбэк не настроен (ROUTERAI_API_KEY)', show_alert: true }); return }
      core.setProvider(proj, want)
      await ctx.answerCallbackQuery(want === 'fallback' ? '🟠 Fallback' : '🟦 Claude')
      const eff = settings.effective(proj, registry.get(proj).defaultMode)
      await ctx.editMessageText(`Проект: ${proj}\nПровайдер: ${core.getProvider(proj)}\n${renderSettings(eff)}`, { reply_markup: settingsKeyboard() }).catch(() => {})
      return
    }

    const action = parseSettingAction(data)
    const patch = action ? settingPatch(action) : null
    const threadId = ctx.callbackQuery.message?.message_thread_id
    const project = projectFor(ctx.callbackQuery.message?.chat.type, threadId)
    if (!patch || !project) { await ctx.answerCallbackQuery('Не удалось применить'); return }

    settings.set(project, patch)
    const eff = settings.effective(project, registry.get(project).defaultMode)
    await ctx.editMessageText(`Проект: ${project}\n${renderSettings(eff)}`, { reply_markup: settingsKeyboard() }).catch(() => {})
    await ctx.answerCallbackQuery('Сохранено')
  })

  bot.on('message:text', async (ctx) => {
    const prompt = ctx.message.text

    // ── Текстовый ввод для мастера/CRUD (имеет приоритет над промптом) ──
    const userId = ctx.from.id
    const exp = pending.get(userId)
    if (exp) {
      const text = ctx.message.text.trim()
      pending.delete(userId)
      if (exp.kind === 'wizard:newfolder') {
        const st = wizards.get(userId)
        if (!st || st.stage !== 'browse') return
        const target = resolveInsideRoot(st.rootPath, st.currentPath, text)
        if (!target) { await ctx.reply('Имя недопустимо.'); return }
        try { mkdirSync(target, { recursive: false }) }
        catch (e) { await ctx.reply(`Не создал: ${e instanceof Error ? e.message : String(e)}`); return }
        const next = enterSegment(st, text, () => target)
        wizards.set(userId, next); await showWizard(ctx.chat.id, next); return
      }
      if (exp.kind === 'proj:rename' && exp.slug) {
        const row = projects.get(exp.slug)
        if (!row) { await ctx.reply('Проект не найден.'); return }
        projects.rename(exp.slug, text)
        if (row.threadId) { try { await bot.api.editForumTopic(config.groupId, row.threadId, { name: text }) } catch { /* ignore */ } }
        await ctx.reply(`✅ ${exp.slug} → «${text}»`)
        return
      }
    }

    const wst = wizards.get(userId)
    if (wst?.stage === 'awaitLabel') {
      const label = ctx.message.text.trim()
      if (label) { const next = setLabel(wst, label); wizards.set(userId, next); await showWizard(ctx.chat.id, next); return }
    }

    if (prompt.startsWith('/')) return

    const threadId = ctx.message.message_thread_id
    const projectName = projectFor(ctx.chat.type, threadId)
    if (projectName === null) {
      await ctx.reply('Эта тема не привязана к проекту. Запусти /setup или пиши в теме проекта.', threadId ? { message_thread_id: threadId } : {})
      return
    }
    await executeRun(ctx.chat.id, threadId, projectName, prompt)
  })

  // На старте — переочередь незавершённых авто-продолжений из БД.
  for (const item of limits.listQueue()) scheduleContinue(item)

  // На старте — переочередь анонсов сброса по сохранённым окнам.
  for (const s of limits.listLimits()) scheduleLimitResetNotice(s.window, s.resetsAt)

  // На старте — восстановление прерванных прогонов (кнопками).
  for (const r of runs.listInterrupted()) {
    const kb = new InlineKeyboard()
      .text('▶️ Продолжить', `recover:continue:${r.id}`)
      .text('🔄 Заново', `recover:restart:${r.id}`)
      .text('✖️ Отмена', `recover:cancel:${r.id}`)
    void bot.api.sendMessage(
      r.chatId,
      `⚠️ Запрос в «${r.project}» прервался рестартом:\n«${r.prompt.slice(0, 200)}»\nЧто делать?`,
      { reply_markup: kb, ...(r.threadId ? { message_thread_id: r.threadId } : {}) },
    ).catch(() => {})
  }

  return bot
}
