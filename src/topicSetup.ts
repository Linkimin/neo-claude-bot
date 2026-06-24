import type { TopicMap } from './topics.ts'

// Минимальный интерфейс Bot API, нужный для создания тем (структурно совместим с grammy bot.api).
export interface TopicApi {
  createForumTopic(chatId: number, name: string): Promise<{ message_thread_id: number }>
}

// Создаёт темы только для проектов без сохранённого thread_id. Возвращает имена созданных.
export async function ensureTopics(
  api: TopicApi,
  groupId: number,
  projectNames: string[],
  topics: TopicMap,
): Promise<string[]> {
  const created: string[] = []
  for (const name of projectNames) {
    if (topics.get(name) === undefined) {
      const topic = await api.createForumTopic(groupId, name)
      topics.set(name, topic.message_thread_id)
      created.push(name)
    }
  }
  return created
}
