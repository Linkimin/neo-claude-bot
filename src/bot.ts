import { Bot } from 'grammy'
import type { AppConfig } from './config.ts'
import { Core } from './core.ts'
import { isAllowed } from './auth.ts'
import { truncate, toolUseLine, resultFooter } from './render.ts'

const DEFAULT_PROJECT = 'spike' // M1: один проект; выбор проекта/топики — M2
const TG_LIMIT = 4096

export function createBot(config: AppConfig, core: Core): Bot {
  const bot = new Bot(config.botToken)

  // Auth: пропускаем только разрешённого пользователя.
  bot.use(async (ctx, next) => {
    if (isAllowed(ctx.from?.id, config.allowedUserId)) return next()
    await ctx.reply('⛔ Доступ запрещён.')
  })

  bot.command('start', (ctx) =>
    ctx.reply('Привет! Пришли промпт — выполню его в проекте «' + DEFAULT_PROJECT + '».'),
  )

  bot.on('message:text', async (ctx) => {
    const prompt = ctx.message.text
    if (prompt.startsWith('/')) return // прочие команды игнорируем в M1

    // «⏳ работаю…» — мгновенный отклик; удаляем, как только пойдёт реальный вывод.
    const status = await ctx.reply('⏳ работаю…')
    let statusDropped = false
    const dropStatus = async () => {
      if (statusDropped) return
      statusDropped = true
      await ctx.api.deleteMessage(ctx.chat.id, status.message_id).catch(() => {})
    }

    // Текущий «пузырь» ответа: новое сообщение, которое дозаполняется по мере стрима.
    // Сбрасывается на каждом действии с инструментом, чтобы ответ всегда шёл ПОД заметками.
    let answerMsgId: number | null = null
    let answerBuf = ''
    let lastEdit = 0

    const renderAnswer = async (force: boolean) => {
      const text = truncate(answerBuf || '…', TG_LIMIT)
      if (answerMsgId === null) {
        const m = await ctx.reply(text)
        answerMsgId = m.message_id
        lastEdit = Date.now()
      } else {
        const now = Date.now()
        if (!force && now - lastEdit < 1500) return // троттлинг edit'ов Telegram
        lastEdit = now
        await ctx.api.editMessageText(ctx.chat.id, answerMsgId, text).catch(() => {})
      }
    }

    try {
      await core.handle(DEFAULT_PROJECT, prompt, async (ev) => {
        if (ev.kind === 'assistant_text') {
          await dropStatus()
          answerBuf += ev.text
          await renderAnswer(false)
        } else if (ev.kind === 'tool_use') {
          await dropStatus()
          if (answerMsgId !== null) await renderAnswer(true) // дофиксировать текущий ответ
          answerMsgId = null
          answerBuf = ''
          await ctx.reply(toolUseLine(ev.name, ev.input))
        } else if (ev.kind === 'result') {
          if (answerBuf) await renderAnswer(true) // дофиксировать текущий пузырь, если есть текст
          await ctx.reply(resultFooter(ev)) // футер — отдельным сообщением в самом низу
        } else if (ev.kind === 'rate_limit') {
          console.log('[rate_limit]', ev.rateLimitType, ev.utilization, 'resetsAt', ev.resetsAt)
        }
        // status/init — в M1 не показываем
      })
      await dropStatus()
    } catch (err) {
      await dropStatus()
      await ctx.reply('❌ Сбой: ' + (err instanceof Error ? err.message : String(err)))
    }
  })

  return bot
}
