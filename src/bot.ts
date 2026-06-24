import { Bot, InlineKeyboard } from 'grammy'
import type { AppConfig } from './config.ts'
import { Core } from './core.ts'
import { Registry } from './registry.ts'
import { TopicMap } from './topics.ts'
import { SettingsStore } from './settingsStore.ts'
import { ensureTopics } from './topicSetup.ts'
import { resolveProject } from './route.ts'
import { isAllowed } from './auth.ts'
import { truncate, toolUseLine, resultFooter } from './render.ts'
import { MODELS, EFFORTS, parseSettingAction, settingPatch, renderSettings, checkPin } from './settings.ts'
import { ApprovalRegistry, renderApprovalRequest, parseApprovalCallback } from './approvals.ts'
import { SessionStore } from './sessionStore.ts'
import { renderStatus, type StatusItem } from './status.ts'

const DEFAULT_PROJECT = 'spike' // маршрут для личного чата (запасной)
const TG_LIMIT = 4096
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000 // авто-отклонение, если не ответили за 5 минут

// Строит клавиатуру настроек: модели, effort, режимы (без auto — он через /auto <PIN>).
function settingsKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard()
  for (const m of MODELS) kb.text(m.label, `set:model:${m.id}`)
  kb.row()
  for (const e of EFFORTS) kb.text(e, `set:effort:${e}`)
  kb.row()
  kb.text('accept edits', 'set:mode:acceptEdits').text('default', 'set:mode:default').text('auto 🔒', 'mode:auto-locked')
  return kb
}

export function createBot(
  config: AppConfig,
  core: Core,
  registry: Registry,
  topics: TopicMap,
  settings: SettingsStore,
  sessions: SessionStore,
): Bot {
  const bot = new Bot(config.botToken)
  const approvals = new ApprovalRegistry()

  // Резолв проекта по контексту любого апдейта (сообщение или callback).
  const projectFor = (chatType: string | undefined, threadId: number | undefined) =>
    resolveProject({
      chatType: chatType ?? 'private',
      threadId,
      defaultProject: DEFAULT_PROJECT,
      projectForThread: (id) => topics.projectForThread(id),
    })

  // Auth: пропускаем только разрешённого пользователя. В группах чужих игнорируем молча.
  bot.use(async (ctx, next) => {
    if (isAllowed(ctx.from?.id, config.allowedUserId)) return next()
    if (ctx.chat?.type === 'private') await ctx.reply('⛔ Доступ запрещён.')
  })

  bot.command('start', (ctx) =>
    ctx.reply('Привет! Пиши промпт в теме проекта. /settings — настройки, /auto <PIN> — включить auto, /setup — создать темы.'),
  )

  bot.command('setup', async (ctx) => {
    const created = await ensureTopics(bot.api, config.groupId, registry.names(), topics)
    await ctx.reply(created.length ? 'Созданы темы: ' + created.join(', ') : 'Все темы уже существуют.')
  })

  // /status — обзор проектов: настройки + состояние сессии.
  bot.command('status', async (ctx) => {
    const items: StatusItem[] = registry.names().map((p) => {
      const eff = settings.effective(p, registry.get(p).defaultMode)
      return {
        project: p,
        mode: eff.mode,
        model: eff.model,
        effort: eff.effort,
        hasSession: sessions.getSessionId(p) !== undefined,
        running: core.isRunning(p),
      }
    })
    await ctx.reply(renderStatus(items), ctx.message?.message_thread_id ? { message_thread_id: ctx.message.message_thread_id } : {})
  })

  // /new — сбросить сессию проекта текущей темы (следующий промпт начнётся с чистого листа).
  bot.command('new', async (ctx) => {
    const threadId = ctx.message?.message_thread_id
    const project = projectFor(ctx.chat?.type, threadId)
    if (!project) { await ctx.reply('Эта тема не привязана к проекту.'); return }
    sessions.clear(project)
    await ctx.reply(`🆕 ${project}: начнётся новая сессия.`, threadId ? { message_thread_id: threadId } : {})
  })

  // /settings — показать панель для проекта текущей темы.
  bot.command('settings', async (ctx) => {
    const threadId = ctx.message?.message_thread_id
    const project = projectFor(ctx.chat?.type, threadId)
    if (!project) { await ctx.reply('Эта тема не привязана к проекту.'); return }
    const eff = settings.effective(project, registry.get(project).defaultMode)
    await ctx.reply(`Проект: ${project}\n${renderSettings(eff)}`, {
      reply_markup: settingsKeyboard(),
      ...(threadId ? { message_thread_id: threadId } : {}),
    })
  })

  // /auto <PIN> — включить bypass-режим для проекта текущей темы.
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

  // Диспетчер нажатий: апрувы → кнопка auto → настройки.
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data

    // 1) Апрувы.
    const appr = parseApprovalCallback(data)
    if (appr) {
      const ok = approvals.resolve(appr.id, appr.decision)
      await ctx.answerCallbackQuery(ok ? (appr.decision === 'approve' ? '✔ Разрешено' : '✖ Отклонено') : 'Запрос уже неактивен')
      return
    }

    // 2) Кнопка auto — только подсказка (auto под PIN через команду).
    if (data === 'mode:auto-locked') {
      await ctx.answerCallbackQuery({ text: 'Включить auto: отправь команду /auto <PIN>', show_alert: true })
      return
    }

    // 3) Настройки (модель/effort/режим).
    const action = parseSettingAction(data)
    const patch = action ? settingPatch(action) : null
    const threadId = ctx.callbackQuery.message?.message_thread_id
    const project = projectFor(ctx.callbackQuery.message?.chat.type, threadId)
    if (!patch || !project) { await ctx.answerCallbackQuery('Не удалось применить'); return }

    settings.set(project, patch)
    const eff = settings.effective(project, registry.get(project).defaultMode)
    // .catch — на случай «message is not modified» (повторный тап той же кнопки).
    await ctx.editMessageText(`Проект: ${project}\n${renderSettings(eff)}`, { reply_markup: settingsKeyboard() }).catch(() => {})
    await ctx.answerCallbackQuery('Сохранено')
  })

  bot.on('message:text', async (ctx) => {
    const prompt = ctx.message.text
    if (prompt.startsWith('/')) return

    const threadId = ctx.message.message_thread_id
    const projectName = projectFor(ctx.chat.type, threadId)
    const send = (text: string) => ctx.reply(text, threadId ? { message_thread_id: threadId } : {})

    // Колбэк апрува: рисует кнопки в теме и ждёт решение (или таймаут → отклонение).
    const onApproval = async (toolName: string, input: unknown) => {
      const { id, promise } = approvals.register()
      const kb = new InlineKeyboard().text('✔ Разрешить', `appr:approve:${id}`).text('✖ Отклонить', `appr:deny:${id}`)
      const m = await ctx.reply(renderApprovalRequest(toolName, input), {
        reply_markup: kb,
        ...(threadId ? { message_thread_id: threadId } : {}),
      })
      const timer = setTimeout(() => { approvals.resolve(id, 'deny') }, APPROVAL_TIMEOUT_MS)
      const decision = await promise
      clearTimeout(timer)
      const verdict = decision.allow ? '✅ Разрешено' : '🚫 ' + decision.message
      await ctx.api.editMessageText(m.chat.id, m.message_id, renderApprovalRequest(toolName, input) + '\n' + verdict).catch(() => {})
      return decision
    }

    if (projectName === null) {
      await send('Эта тема не привязана к проекту. Запусти /setup или пиши в теме проекта.')
      return
    }

    const status = await send('⏳ работаю…')
    let statusDropped = false
    const dropStatus = async () => {
      if (statusDropped) return
      statusDropped = true
      await ctx.api.deleteMessage(status.chat.id, status.message_id).catch(() => {})
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
        await ctx.api.editMessageText(status.chat.id, answerMsgId, text).catch(() => {})
      }
    }

    try {
      await core.handle(projectName, prompt, async (ev) => {
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
          await send(resultFooter(ev))
        } else if (ev.kind === 'init') {
          console.log('[run]', projectName, 'model=', ev.model, 'mode=', ev.mode)
        } else if (ev.kind === 'rate_limit') {
          console.log('[rate_limit]', ev.rateLimitType, ev.utilization, 'resetsAt', ev.resetsAt)
        }
      }, onApproval)
      await dropStatus()
    } catch (err) {
      await dropStatus()
      await send('❌ Сбой: ' + (err instanceof Error ? err.message : String(err)))
    }
  })

  return bot
}
