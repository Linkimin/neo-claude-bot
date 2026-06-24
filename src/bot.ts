import { Bot } from 'grammy'
import type { AppConfig } from './config.ts'
import { Core } from './core.ts'
import { Registry } from './registry.ts'
import { TopicMap } from './topics.ts'
import { ensureTopics } from './topicSetup.ts'
import { resolveProject } from './route.ts'
import { isAllowed } from './auth.ts'
import { truncate, toolUseLine, resultFooter } from './render.ts'

const DEFAULT_PROJECT = 'spike' // маршрут для личного чата (запасной)
const TG_LIMIT = 4096

export function createBot(config: AppConfig, core: Core, registry: Registry, topics: TopicMap): Bot {
  const bot = new Bot(config.botToken)

  // Auth: пропускаем только разрешённого пользователя. В группах чужих игнорируем молча.
  bot.use(async (ctx, next) => {
    if (isAllowed(ctx.from?.id, config.allowedUserId)) return next()
    if (ctx.chat?.type === 'private') await ctx.reply('⛔ Доступ запрещён.')
  })

  bot.command('start', (ctx) =>
    ctx.reply('Привет! Пиши промпт в теме проекта. Команда /setup создаст недостающие темы.'),
  )

  // /setup — создать недостающие темы в группе по реестру.
  bot.command('setup', async (ctx) => {
    const created = await ensureTopics(bot.api, config.groupId, registry.names(), topics)
    await ctx.reply(created.length ? 'Созданы темы: ' + created.join(', ') : 'Все темы уже существуют.')
  })

  bot.on('message:text', async (ctx) => {
    const prompt = ctx.message.text
    if (prompt.startsWith('/')) return // прочие команды игнорируем

    const threadId = ctx.message.message_thread_id
    const projectName = resolveProject({
      chatType: ctx.chat.type,
      threadId,
      defaultProject: DEFAULT_PROJECT,
      projectForThread: (id) => topics.projectForThread(id),
    })

    // Хелпер: ответ уходит в ту же тему, откуда пришёл (или в личку).
    const send = (text: string) => ctx.reply(text, threadId ? { message_thread_id: threadId } : {})

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
        } else if (ev.kind === 'rate_limit') {
          console.log('[rate_limit]', ev.rateLimitType, ev.utilization, 'resetsAt', ev.resetsAt)
        }
      })
      await dropStatus()
    } catch (err) {
      await dropStatus()
      await send('❌ Сбой: ' + (err instanceof Error ? err.message : String(err)))
    }
  })

  return bot
}
