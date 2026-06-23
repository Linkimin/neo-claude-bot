// Печатает любое SDK-сообщение в компактном виде. DRY между спайками.
export function logMessage(msg: any): void {
  switch (msg.type) {
    case 'system':
      console.log(`[system:${msg.subtype}]`, msg.subtype === 'init'
        ? `model=${msg.model} mode=${msg.permissionMode}`
        : JSON.stringify(msg).slice(0, 200))
      break
    case 'assistant':
    case 'user':
      for (const block of msg.message.content ?? []) {
        if (block.type === 'text') console.log(`[${msg.type}:text]`, block.text.slice(0, 300))
        else if (block.type === 'tool_use') console.log(`[${msg.type}:tool_use]`, block.name, JSON.stringify(block.input).slice(0, 200))
        else if (block.type === 'tool_result') console.log(`[${msg.type}:tool_result]`, JSON.stringify(block.content).slice(0, 200))
        else console.log(`[${msg.type}:${block.type}]`)
      }
      break
    case 'result':
      console.log(`[result:${msg.subtype}] is_error=${msg.is_error} turns=${msg.num_turns} cost=${msg.total_cost_usd}`)
      console.log('  usage=', JSON.stringify(msg.usage))
      if ('errors' in msg) console.log('  errors=', JSON.stringify(msg.errors))
      break
    default:
      console.log(`[${msg.type}]`)
  }
}
