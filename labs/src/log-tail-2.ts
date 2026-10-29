/** Планировщик кадра. В браузере: cb => { const id = requestAnimationFrame(cb); return () => cancelAnimationFrame(id) } */
export type Schedule = (cb: () => void) => (() => void) | void

export type LogView = {
  lines: string[] // законченные строки, не больше maxLines, самые свежие в конце
  partial: string // недописанная последняя строка, как её показать сейчас ('' если её нет)
  dropped: number // сколько строк выкинуто сверху за всё время; номер lines[i] = dropped + i + 1
}

export type LogBufferOptions = {
  schedule: Schedule
  onFlush: (view: LogView) => void
  maxLines: number
}

export type LogBuffer = {
  write: (chunk: string) => void
  end: () => void
  cancel: () => void
}

/**
 * Буфер строк для живого лога сборки. Порядок мыслей:
 *  1. write только кладёт чанк в массив; первый write после кадра планирует один кадр через schedule.
 *  2. Кадр склеивает недописанную строку с прошлого раза и новые чанки, режет по \n.
 *     Всё до последнего \n это целые строки, остаток ждёт следующего кадра.
 *  3. Как показать строку: \r в конце (от CRLF) срезать, а \r посередине (прогресс-бар) значит
 *     «каретка в начало», видно только то, что после последнего \r.
 *  4. Храни недописанную строку сырой, с \r: её \n может прийти следующим чанком.
 *  5. Строки дописываются в НОВЫЙ массив; если их больше maxLines, обрезать сверху и прибавить к dropped.
 *  6. end(): сбросить сразу, недописанная строка становится последней. cancel(): кадр снять, остаток выбросить.
 *  7. Нечего показать: кадр не планируется. После end/cancel ни одного onFlush.
 */
export function createLogBuffer(o: LogBufferOptions): LogBuffer {
  throw new Error('TODO: повторение 06')
}

export type TailFollowerOptions = {
  lineHeight: number // моноширинный лог: все строки одной высоты
  viewportHeight: number
  threshold?: number // насколько близко к низу считается «внизу», по умолчанию одна строка
}

export type TailFollower = {
  onUserScroll: (scrollTop: number) => void
  /** Вернуть scrollTop, который надо выставить после этого flush, или null: не трогать. */
  onFlush: (view: LogView) => number | null
  following: () => boolean
}

/**
 * Follow tail, как tail -f. Порядок мыслей:
 *  1. Состояние: следуем ли, последний известный scrollTop, сколько строк на экране, сколько уже было выкинуто.
 *  2. Высота лога: строки плюс недописанная строка, если она есть, умножить на lineHeight. Низ: высота минус окно, не меньше 0.
 *  3. onUserScroll: у низа (не дальше threshold) значит следуем; отлипаем, только если scrollTop уменьшился.
 *  4. onFlush при следовании: вернуть низ. Решение по состоянию, а не по новой высоте.
 *  5. Не следуем и сверху выкинули строки: вернуть scrollTop меньше на их высоту (не меньше 0), иначе null.
 */
export function createTailFollower(o: TailFollowerOptions): TailFollower {
  throw new Error('TODO: повторение 06')
}
