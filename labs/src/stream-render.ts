/** Планировщик кадра. В браузере: cb => { const id = requestAnimationFrame(cb); return () => cancelAnimationFrame(id) } */
export type Schedule = (cb: () => void) => (() => void) | void

export type DeltaBufferOptions = {
  schedule: Schedule
  onFlush: (text: string, delta: string) => void // text: весь текст на сейчас, delta: что пришло с прошлого кадра
}

export type DeltaBuffer = {
  append: (delta: string) => void
  end: () => void
  cancel: () => void
}

/**
 * Буфер дельт: токены приходят 50-200 раз в секунду, а рендерить надо не чаще раза за кадр.
 * Порядок мыслей:
 *  1. append только кладёт дельту в массив, без рендера и без склейки всего текста.
 *  2. Первый append после кадра планирует ОДИН кадр через schedule; остальные append до кадра просто ждут.
 *  3. Кадр склеивает всё, что накопилось, и зовёт onFlush(весь текст, новая часть).
 *  4. Нечего показать (пустая дельта, ничего нового): кадр не планируется.
 *  5. end(): остаток сразу, запланированный кадр снять. cancel(): кадр снять, остаток выбросить.
 *  6. После end/cancel ничего не сбрасывается, даже если планировщик не смог снять кадр.
 */
export function createDeltaBuffer(o: DeltaBufferOptions): DeltaBuffer {
  throw new Error('TODO: lab 06')
}

export type StableSplit = {
  blocks: string[] // законченные блоки: больше не меняются, их можно мемоизировать
  tail: string // живой хвост: только его парсим и рендерим заново каждый кадр
}

/**
 * Разрезать накопленный markdown на законченные блоки и живой хвост.
 * Инвариант: blocks.join('') + tail === markdown с \r\n, заменёнными на \n.
 * Порядок мыслей:
 *  1. Решают только целые строки (с \n на конце); недописанная последняя строка всегда в хвосте.
 *  2. Пустая строка закрывает абзац. Одиночный \n абзац не закрывает.
 *  3. Внутри ``` ничего не режется, даже по пустой строке; закрытый блок кода сам становится блоком.
 *  4. Новый пункт списка верхнего уровня (или начало блока кода) закрывает то, что было до него.
 *  5. Готовый блок не должен меняться, когда текста станет больше.
 */
export function splitStable(markdown: string): StableSplit {
  throw new Error('TODO: lab 06')
}

export type ScrollMetrics = { scrollTop: number; scrollHeight: number; clientHeight: number }

/** Пользователь у низа: до конца прокрутки не больше threshold пикселей (по умолчанию 40). */
export function shouldStick(m: ScrollMetrics & { threshold?: number }): boolean {
  throw new Error('TODO: lab 06')
}

export type ScrollFollower = {
  /** Пришло событие scroll (от пользователя или эхо нашей же прокрутки). */
  onUserScroll: (m: ScrollMetrics) => void
  /** Контент вырос, m это размеры уже после роста. Вернуть scrollTop, куда прокрутить, или null: не трогать. */
  onContentGrow: (m: ScrollMetrics) => number | null
  following: () => boolean
}

/**
 * Автоскролл чата. Подумай до кода: почему решение «скроллить ли вниз» нельзя принимать
 * по размерам после роста, и как отличить прокрутку пользователя вверх от эха своей прокрутки вниз.
 */
export function createScrollFollower(o: { threshold?: number } = {}): ScrollFollower {
  throw new Error('TODO: lab 06')
}
