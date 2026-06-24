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

    const status = await ctx.reply('⏳ работаю…')
    let buffer = ''
    let lastEdit = 0

    const flush = async (final: boolean) => {
      const now = Date.now()
      if (!final && now - lastEdit < 1500) return // троттлинг edit'ов Telegram
      lastEdit = now
      const text = truncate(buffer || '…', TG_LIMIT)
      await ctx.api.editMessageText(status.chat.id, status.message_id, text).catch(() => {})
    }

    try {
      await core.handle(DEFAULT_PROJECT, prompt, (ev) => {
        if (ev.kind === 'assistant_text') { buffer += ev.text; void flush(false) }
        else if (ev.kind === 'tool_use') { void ctx.reply(toolUseLine(ev.name, ev.input)) }
        else if (ev.kind === 'result') { buffer += '\n\n' + resultFooter(ev); void flush(true) }
        else if (ev.kind === 'rate_limit') { console.log('[rate_limit]', ev.rateLimitType, ev.utilization, 'resetsAt', ev.resetsAt) }
        // status/init — в M1 не показываем
      })
      await flush(true)
    } catch (err) {
      await ctx.reply('❌ Сбой: ' + (err instanceof Error ? err.message : String(err)))
    }
  })

  return bot
}
