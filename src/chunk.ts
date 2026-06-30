// Режет HTML-текст на куски ≤ limit для Telegram, не разрывая <pre>-блоки:
// если блок не влезает, текущий кусок закрывается </pre>, следующий открывается <pre>.
// Примечание: одиночная строка длиннее limit передаётся как есть (для очень длинного
// единичного payload в bot.ts действует фолбэк в файл ДО вызова этой функции).
export function splitForTelegram(html: string, limit = 4096): string[] {
  if (html.length <= limit) return [html]
  const lines = html.split('\n')
  const out: string[] = []
  let cur = ''
  let inPre = false
  const flush = () => {
    if (!cur) return
    out.push(inPre ? `${cur}\n</pre>` : cur)
    cur = inPre ? '<pre>' : ''
  }
  for (const line of lines) {
    const joiner = cur && cur !== '<pre>' ? '\n' : ''
    if (cur && (cur.length + joiner.length + line.length + (inPre ? 7 : 0)) > limit) flush()
    cur = cur && cur !== '<pre>' ? `${cur}\n${line}` : `${cur}${line}`
    if (line.includes('<pre>') && !line.includes('</pre>')) inPre = true
    else if (line.includes('</pre>') && !line.includes('<pre>')) inPre = false
  }
  if (cur && cur !== '<pre>') out.push(cur)
  return out
}
