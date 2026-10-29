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

export function createDeltaBuffer({ schedule, onFlush }: DeltaBufferOptions): DeltaBuffer {
  let parts: string[] = [] // дельты с прошлого кадра; append только кладёт сюда
  let text = ''
  let scheduled = false
  let cancelFrame: (() => void) | null = null
  let closed = false

  function flush() {
    scheduled = false
    cancelFrame = null
    // closed: кадр, который планировщик не смог снять, после cancel/end ничего не делает
    if (closed || parts.length === 0) return
    const delta = parts.join('')
    parts = []
    text += delta
    onFlush(text, delta)
  }

  return {
    append(delta) {
      if (closed || delta === '') return
      parts.push(delta)
      if (scheduled) return // кадр уже ждёт, он заберёт и эту дельту
      scheduled = true
      cancelFrame = schedule(flush) ?? null
    },
    end() {
      if (closed) return
      cancelFrame?.()
      flush() // остаток сразу: поток кончился, ждать кадр незачем
      closed = true
    },
    cancel() {
      if (closed) return
      closed = true
      cancelFrame?.()
      cancelFrame = null
      scheduled = false
      parts = []
    },
  }
}

export type StableSplit = {
  blocks: string[] // законченные блоки: больше не меняются, их можно мемоизировать
  tail: string // живой хвост: только его парсим и рендерим заново каждый кадр
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/
const LIST_ITEM = /^([-*+]|\d{1,9}[.)])[ \t]/ // пункт списка верхнего уровня, без отступа
const BLANK = /^[ \t]*$/

/** blocks.join('') + tail === markdown с \r\n, заменёнными на \n. */
export function splitStable(markdown: string): StableSplit {
  const text = markdown.replace(/\r\n/g, '\n')
  const blocks: string[] = []
  let start = 0 // начало текущего, ещё не законченного блока
  let hasContent = false // в текущем блоке есть что-то кроме пустых строк
  let fence: string | null = null // открывающая ограда, пока мы внутри блока кода
  let pos = 0

  const cut = (end: number) => {
    blocks.push(text.slice(start, end))
    start = end
    hasContent = false
  }

  while (true) {
    const nl = text.indexOf('\n', pos)
    if (nl === -1) break // последняя строка не дописана: она всегда в хвосте
    const line = text.slice(pos, nl)
    const next = nl + 1

    if (fence) {
      // внутри кода ничего не режем, ждём закрывающую ограду: тот же символ, не короче, без текста после
      const m = line.match(FENCE)
      const close = m && m[1]![0] === fence[0] && m[1]!.length >= fence.length && BLANK.test(line.slice(m[0].length))
      if (close) {
        fence = null
        cut(next)
      }
    } else if (BLANK.test(line)) {
      if (hasContent) cut(next) // пустая строка закрывает абзац; пустые строки подряд уходят в следующий блок
    } else {
      const m = line.match(FENCE)
      // новый блок кода или новый пункт списка закрывают то, что было до них
      if ((m || LIST_ITEM.test(line)) && hasContent) cut(pos)
      if (m) fence = m[1]!
      hasContent = true
    }
    pos = next
  }

  return { blocks, tail: text.slice(start) }
}

export type ScrollMetrics = { scrollTop: number; scrollHeight: number; clientHeight: number }

/** Пользователь у низа: до конца прокрутки не больше threshold пикселей. */
export function shouldStick({ scrollTop, scrollHeight, clientHeight, threshold = 40 }: ScrollMetrics & { threshold?: number }): boolean {
  return scrollHeight - clientHeight - scrollTop <= threshold
}

export type ScrollFollower = {
  onUserScroll: (m: ScrollMetrics) => void
  onContentGrow: (m: ScrollMetrics) => number | null
  following: () => boolean
}

export function createScrollFollower({ threshold = 40 }: { threshold?: number } = {}): ScrollFollower {
  let following = true // новый ответ начинается внизу
  let lastTop = 0

  return {
    onUserScroll(m) {
      if (shouldStick({ ...m, threshold })) following = true
      // отлипаем только от прокрутки ВВЕРХ: эхо нашего же scrollTo вниз сюда не попадает,
      // даже если пока оно летело, текста стало больше
      else if (m.scrollTop < lastTop) following = false
      lastTop = m.scrollTop
    },
    onContentGrow(m) {
      // решение по состоянию ДО роста: большой кусок текста не повод перестать следовать
      return following ? Math.max(0, m.scrollHeight - m.clientHeight) : null
    },
    following: () => following,
  }
}
