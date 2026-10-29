export type SSEEvent = { event: string; data: string }

export type StreamResult = {
  text: string
  toolCalls: { id: string; name: string; input: unknown }[]
  stopReason: string | null
  complete: boolean // пришёл ли message_stop
  error?: { type: string; message: string }
}

/**
 * Разбор SSE (Server-Sent Events) из сырых байтов.
 * Правила формата: событие = несколько строк "поле: значение", заканчивается пустой строкой.
 * Подсказки: TextDecoder и его второй аргумент; буфер для недописанной строки;
 * перевод строки бывает \n, \r\n и \r.
 */
export async function* parseSSE(stream: ReadableStream<Uint8Array>): AsyncGenerator<SSEEvent> {
  throw new Error('TODO: lab 02')
}

/**
 * Поверх parseSSE: собрать ответ Anthropic из событий
 * message_start, content_block_start/delta/stop, message_delta, message_stop, ping, error.
 */
export async function collectMessage(stream: ReadableStream<Uint8Array>): Promise<StreamResult> {
  throw new Error('TODO: lab 02')
}
