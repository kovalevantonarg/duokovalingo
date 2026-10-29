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

/** Как строку видит терминал: \r от CRLF срезаем, а \r посреди строки (прогресс-бар) возвращает каретку в начало. */
function display(line: string): string {
  const s = line.endsWith('\r') ? line.slice(0, -1) : line
  return s.slice(s.lastIndexOf('\r') + 1)
}

export function createLogBuffer({ schedule, onFlush, maxLines }: LogBufferOptions): LogBuffer {
  let chunks: string[] = [] // чанки с прошлого кадра; write только кладёт сюда
  let raw = '' // недописанная строка как пришла, с \r: её \n может прийти в следующем чанке
  let lines: string[] = []
  let dropped = 0
  let scheduled = false
  let cancelFrame: (() => void) | null = null
  let closed = false

  function flush(final: boolean) {
    scheduled = false
    cancelFrame = null
    if (closed) return
    if (chunks.length === 0 && !(final && raw)) return
    const parts = (raw + chunks.join('')).split('\n')
    chunks = []
    raw = parts.pop()! // после последнего \n; '' если текст кончился на \n
    if (final && raw) {
      parts.push(raw) // процесс завершился без \n в конце: это всё равно строка
      raw = ''
    }
    // новый массив, а не push в старый: прошлый view не меняется, React видит новую ссылку
    let next = lines.concat(parts.map(display))
    if (next.length > maxLines) {
      dropped += next.length - maxLines
      next = next.slice(-maxLines) // одна обрезка на кадр, а не shift() на каждую строку
    }
    lines = next
    onFlush({ lines, partial: display(raw), dropped })
  }

  return {
    write(chunk) {
      if (closed || chunk === '') return
      chunks.push(chunk)
      if (scheduled) return
      scheduled = true
      cancelFrame = schedule(() => flush(false)) ?? null
    },
    end() {
      if (closed) return
      cancelFrame?.()
      flush(true)
      closed = true
    },
    cancel() {
      if (closed) return
      closed = true
      cancelFrame?.()
      cancelFrame = null
      scheduled = false
      chunks = []
    },
  }
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

export function createTailFollower({ lineHeight, viewportHeight, threshold = lineHeight }: TailFollowerOptions): TailFollower {
  let following = true // tail -f: новый лог смотрим с конца
  let top = 0 // последний известный scrollTop
  let rows = 0
  let seenDropped = 0

  const bottom = () => Math.max(0, rows * lineHeight - viewportHeight)

  return {
    onUserScroll(scrollTop) {
      if (bottom() - scrollTop <= threshold) following = true
      else if (scrollTop < top) following = false // отлипаем только от прокрутки вверх, эхо своей прокрутки вниз не в счёт
      top = scrollTop
    },
    onFlush(view) {
      const removed = view.dropped - seenDropped
      seenDropped = view.dropped
      rows = view.lines.length + (view.partial ? 1 : 0) // недописанная строка тоже занимает строку на экране
      if (following) return bottom()
      if (removed === 0) return null
      // сверху выкинули строки, весь текст уехал вверх: возвращаем строку, которую читают, на место
      top = Math.max(0, top - removed * lineHeight)
      return top
    },
    following: () => following,
  }
}
