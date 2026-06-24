export interface RouteInput {
  chatType: string // 'private' | 'group' | 'supergroup' | 'channel'
  threadId: number | undefined
  defaultProject: string | null
  projectForThread: (threadId: number) => string | null
}

// Определяет имя проекта по контексту сообщения. Чистая функция.
export function resolveProject(i: RouteInput): string | null {
  if (i.chatType === 'private') return i.defaultProject
  if (i.threadId === undefined) return null // General/не-тема в группе
  return i.projectForThread(i.threadId)
}
