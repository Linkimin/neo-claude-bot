import { Bot, InlineKeyboard } from 'grammy'
import type { AppConfig } from './config.ts'
import { Core } from './core.ts'
import { Registry } from './registry.ts'
import { TopicMap } from './topics.ts'
import { SettingsStore } from './settingsStore.ts'
import { SessionStore } from './sessionStore.ts'
import { ensureTopics } from './topicSetup.ts'
import { resolveProject } from './route.ts'
import { isAllowed } from './auth.ts'
import { truncate, toolUseLine, resultFooter } from './render.ts'
import { MODELS, EFFORTS, FALLBACK_MODELS, parseSettingAction, settingPatch, renderSettings, checkPin } from './settings.ts'
import { ApprovalRegistry, renderApprovalRequest, parseApprovalCallback } from './approvals.ts'
import { renderStatus, type StatusItem } from './status.ts'
import { LimitsStore, type QueueItem } from './limitsStore.ts'
import { classifyLimit, formatReset, renderLimits } from './limits.ts'
import { shouldAutoFailover } from './providers.ts'
import { RunStore } from './runStore.ts'
import { parseRecoveryCallback } from './recovery.ts'
import { log } from './logger.ts'

const DEFAULT_PROJECT = 'spike' // маршрут для личного чата (запасной)
const TG_LIMIT = 4096
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000
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
): Bot {
  const bot = new Bot(config.botToken)
  const approvals = new ApprovalRegistry()

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
      const timer = setTimeout(() => { approvals.resolve(id, 'deny') }, APPROVAL_TIMEOUT_MS)
      const decision = await promise
      clearTimeout(timer)
      const verdict = decision.allow ? '✅ Разрешено' : '🚫 ' + decision.message
      await bot.api.editMessageText(chatId, m.message_id, renderApprovalRequest(toolName, input) + '\n' + verdict).catch(() => {})
      return decision
    }

    const status = await send('⏳ работаю…')
    let statusDropped = false
    const dropStatus = async () => {
      if (statusDropped) return
      statusDropped = true
      await bot.api.deleteMessage(chatId, status.message_id).catch(() => {})
    }

    let answerMsgId: number | null = null
    let answerBuf = ''
    let lastEdit = 0
    const renderAnswer = async (force: boolean) => {
      const text = truncate(answerBuf || '…', TG_LIMIT)
      if (answerMsgId === null) {
        const m = await send(text)
        answerMsgId = m.message_id
        lastEdit = Date.now()
      } else {
        const now = Date.now()
        if (!force && now - lastEdit < 1500) return
        lastEdit = now
        await bot.api.editMessageText(chatId, answerMsgId, text).catch(() => {})
      }
    }

    let limitBlocked = false
    let blockedResetsAt = 0
    try {
      await core.handle(project, prompt, async (ev) => {
        if (ev.kind === 'assistant_text') {
          await dropStatus()
          answerBuf += ev.text
          await renderAnswer(false)
        } else if (ev.kind === 'tool_use') {
          await dropStatus()
          if (answerMsgId !== null) await renderAnswer(true)
          answerMsgId = null
          answerBuf = ''
          await send(toolUseLine(ev.name, ev.input))
        } else if (ev.kind === 'result') {
          if (answerBuf) await renderAnswer(true)
          if (!limitBlocked) await send(resultFooter(ev))
        } else if (ev.kind === 'init') {
          log.info('[run]', project, 'model=', ev.model, 'mode=', ev.mode)
        } else if (ev.kind === 'rate_limit') {
          // Некоторые rate_limit-события приходят без utilization/resetsAt — их в БД не пишем (колонки NOT NULL).
          if (typeof ev.utilization === 'number' && typeof ev.resetsAt === 'number') {
            limits.upsertLimit({ window: ev.rateLimitType, utilization: ev.utilization, resetsAt: ev.resetsAt, status: ev.status })
            if (classifyLimit(ev.status) === 'blocked') { limitBlocked = true; blockedResetsAt = ev.resetsAt }
          } else {
            log.info('[rate_limit] неполное событие, пропуск:', ev.status)
          }
        }
      }, onApproval)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error('[run error]', project, msg)
      if (!limitBlocked) await send('❌ Сбой: ' + msg)
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

  bot.command('new', async (ctx) => {
    const threadId = ctx.message?.message_thread_id
    const project = projectFor(ctx.chat?.type, threadId)
    if (!project) { await ctx.reply('Эта тема не привязана к проекту.'); return }
    sessions.clear(project)
    await ctx.reply(`🆕 ${project}: начнётся новая сессия.`, threadId ? { message_thread_id: threadId } : {})
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
