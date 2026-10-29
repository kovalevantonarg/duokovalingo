export type ChatToolCall = { id: string; name: string; args: unknown }

export type ChatResult = {
  text: string
  toolCalls: ChatToolCall[]
  finishReason: string | null
  complete: boolean // пришла ли строка {"done":true}
  error?: { code: string; message: string }
}

/**
 * NDJSON (newline-delimited JSON): одна JSON-строка на объект, разделитель \n.
 *
 * Порядок мыслей:
 * - reader из stream.getReader(), TextDecoder и его второй аргумент, иначе кириллица на стыке чанков ломается;
 * - буфер-строка: дописываешь в него декодированный чанк, отрезаешь всё до последнего \n, хвост ждёт следующего чанка;
 * - \r в конце строки (CRLF) срезать, пустые строки пропускать;
 * - когда поток кончился: decoder.decode() без аргументов и непустой хвост буфера тоже строка (в SSE его бы выбросили);
 * - строка не парсится как JSON: Error, в сообщении номер строки ("строка 2");
 * - finally: reader.releaseLock().
 */
export async function* parseNDJSON(stream: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  throw new Error('TODO: повторение 02')
}

/**
 * Поверх parseNDJSON: собрать ответ из OpenAI-чанков шлюза.
 *
 * Порядок мыслей:
 * - результат по умолчанию: text '', toolCalls [], finishReason null, complete false;
 * - строка с error: заполнить error и сразу вернуть то, что уже собрано;
 * - строка {"done":true}: complete = true;
 * - choices[0] может не быть (чанк с usage): пропустить;
 * - delta.content (бывает null) дописать в text;
 * - delta.tool_calls: копить arguments в Map по index, id и name есть только в первом куске;
 * - finish_reason: запомнить и только теперь JSON.parse аргументов (пустая строка это {}), по возрастанию index.
 */
export async function collectChat(stream: ReadableStream<Uint8Array>): Promise<ChatResult> {
  throw new Error('TODO: повторение 02')
}
