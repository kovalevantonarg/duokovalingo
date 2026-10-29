import { describe, it, expect, vi } from 'vitest'
import { createLogBuffer, createTailFollower, type LogView } from '@lab/log-tail-2'

/** Ручные кадры вместо requestAnimationFrame: кадр наступает, только когда тест вызовет frame(). */
function frames() {
  let queue: (() => void)[] = []
  const schedule = vi.fn((cb: () => void) => {
    queue.push(cb)
    return () => {
      queue = queue.filter((x) => x !== cb)
    }
  })
  return {
    schedule,
    frame: () => {
      const due = queue
      queue = []
      for (const cb of due) cb()
    },
    pending: () => queue.length,
  }
}

/** Буфер, который записывает каждый view; last() это то, что сейчас на экране. */
function setup(maxLines = 1000) {
  const f = frames()
  const views: LogView[] = []
  const buf = createLogBuffer({ schedule: f.schedule, maxLines, onFlush: (v) => views.push(v) })
  return { ...f, buf, views, last: () => views[views.length - 1] }
}

const view = (rows: number, dropped = 0, partial = ''): LogView => ({
  lines: Array.from({ length: rows }, (_, i) => `line ${dropped + i + 1}`),
  partial,
  dropped,
})

describe('06 повторение: буфер строк лога (createLogBuffer)', () => {
  it('write не рендерит: много чанков до кадра → один кадр, целые строки в lines, хвост в partial', () => {
    const t = setup()
    t.buf.write('step 1\nst')
    t.buf.write('ep 2\n')
    t.buf.write('step 3')
    expect(t.views).toEqual([])
    expect(t.schedule).toHaveBeenCalledTimes(1)
    t.frame()
    expect(t.views).toEqual([{ lines: ['step 1', 'step 2'], partial: 'step 3', dropped: 0 }])
    t.frame()
    expect(t.schedule).toHaveBeenCalledTimes(1)
    expect(t.views).toHaveLength(1)
  })

  it('недописанная строка доклеивается следующим кадром', () => {
    const t = setup()
    t.buf.write('npm i')
    t.frame()
    expect(t.last()).toEqual({ lines: [], partial: 'npm i', dropped: 0 })
    t.buf.write('nstall\nok\n')
    t.frame()
    expect(t.last()).toEqual({ lines: ['npm install', 'ok'], partial: '', dropped: 0 })
  })

  it('CRLF, в том числе \\r и \\n в разных чанках: без \\r в строках и без лишних пустых строк', () => {
    const t = setup()
    t.buf.write('a\r\nb\r')
    t.frame()
    expect(t.last()).toEqual({ lines: ['a'], partial: 'b', dropped: 0 })
    t.buf.write('\nc\r\n')
    t.frame()
    expect(t.last()).toEqual({ lines: ['a', 'b', 'c'], partial: '', dropped: 0 })
  })

  it('\\r без \\n (прогресс-бар) переписывает текущую строку, а не плодит новые', () => {
    const t = setup()
    t.buf.write('Загрузка 10%\rЗагрузка 55%')
    t.frame()
    expect(t.last()).toEqual({ lines: [], partial: 'Загрузка 55%', dropped: 0 })
    t.buf.write('\rЗагрузка 100%\nГотово\n')
    t.frame()
    expect(t.last()!.lines).toEqual(['Загрузка 100%', 'Готово'])
  })

  it('maxLines: старые строки выкидываются сверху, dropped считает выкинутые', () => {
    const t = setup(3)
    t.buf.write('1\n2\n3\n4\n5\n')
    t.frame()
    expect(t.last()).toEqual({ lines: ['3', '4', '5'], partial: '', dropped: 2 })
    t.buf.write('6\n')
    t.frame()
    expect(t.last()).toEqual({ lines: ['4', '5', '6'], partial: '', dropped: 3 })

    const big = setup(100)
    big.buf.write(Array.from({ length: 10_000 }, (_, i) => `line ${i + 1}\n`).join(''))
    big.frame()
    expect(big.last()!.lines).toHaveLength(100)
    expect(big.last()!.dropped).toBe(9900)
    expect(big.last()!.lines[0]).toBe('line 9901') // номер строки = dropped + i + 1
  })

  it('каждый flush отдаёт новый массив, прошлый view не меняется', () => {
    const t = setup()
    t.buf.write('a\n')
    t.frame()
    const first = t.last()!
    t.buf.write('b\n')
    t.frame()
    expect(t.last()!.lines).not.toBe(first.lines)
    expect(first.lines).toEqual(['a'])
    expect(t.last()!.lines).toEqual(['a', 'b'])
  })

  it('end(): недописанная строка становится последней, сброс сразу, без кадра', () => {
    const t = setup()
    t.buf.write('build ok\nexit 0')
    t.buf.end()
    expect(t.views).toEqual([{ lines: ['build ok', 'exit 0'], partial: '', dropped: 0 }])
    expect(t.pending()).toBe(0)
    t.buf.write('ещё\n')
    t.buf.end()
    t.frame()
    expect(t.views).toHaveLength(1)
  })

  it('cancel(): кадр снят, после отмены ни одного onFlush', () => {
    const t = setup()
    t.buf.write('a\n')
    t.frame()
    t.buf.write('b\n')
    t.buf.cancel()
    expect(t.pending()).toBe(0)
    t.frame()
    t.buf.write('c\n')
    t.buf.end()
    expect(t.views).toHaveLength(1)
  })
})

describe('06 повторение: follow tail (createTailFollower)', () => {
  it('по умолчанию следуем: каждый flush возвращает низ, недописанная строка тоже занимает строку', () => {
    const s = createTailFollower({ lineHeight: 20, viewportHeight: 400 })
    expect(s.onFlush(view(5))).toBe(0) // лог короче окна
    expect(s.onFlush(view(30))).toBe(200)
    expect(s.onFlush(view(30, 0, 'Загрузка 55%'))).toBe(220)
  })

  it('ушёл вверх читать → flush его не двигает; вернулся к низу → снова следуем', () => {
    const s = createTailFollower({ lineHeight: 20, viewportHeight: 400 })
    expect(s.onFlush(view(100))).toBe(1600)
    s.onUserScroll(1600) // эхо нашей прокрутки
    s.onUserScroll(1000) // пользователь крутит вверх
    expect(s.onFlush(view(120))).toBeNull()
    expect(s.following()).toBe(false)
    s.onUserScroll(1990) // до низа (2000) меньше одной строки
    expect(s.onFlush(view(130))).toBe(2200)
  })

  it('ушёл вверх, а сверху выкинули строки: scrollTop меньше на их высоту, но не меньше 0', () => {
    const s = createTailFollower({ lineHeight: 20, viewportHeight: 400 })
    s.onFlush(view(100))
    s.onUserScroll(1600)
    s.onUserScroll(600)
    expect(s.onFlush(view(100, 10))).toBe(400) // выкинули 10 строк по 20 px
    s.onUserScroll(400) // эхо компенсации
    expect(s.following()).toBe(false)
    expect(s.onFlush(view(100, 40))).toBe(0)
  })

  it('эхо нашей прокрутки пришло после следующего flush: это не прокрутка вверх', () => {
    const s = createTailFollower({ lineHeight: 20, viewportHeight: 400 })
    expect(s.onFlush(view(100))).toBe(1600)
    expect(s.onFlush(view(120))).toBe(2000)
    s.onUserScroll(1600) // запоздалое эхо первой прокрутки: до низа уже 400 px
    expect(s.following()).toBe(true)
    expect(s.onFlush(view(140))).toBe(2400)
  })
})

describe('06 повторение: вместе', () => {
  it('буфер + follower: строка, которую читают, остаётся на месте, пока сверху выкидывают старое', () => {
    const f = frames()
    const s = createTailFollower({ lineHeight: 10, viewportHeight: 50 })
    const tops: (number | null)[] = []
    let shown: LogView | undefined
    const buf = createLogBuffer({
      schedule: f.schedule,
      maxLines: 20,
      onFlush: (v) => {
        shown = v
        tops.push(s.onFlush(v))
      },
    })
    for (let i = 1; i <= 20; i++) buf.write(`line ${i}\n`)
    f.frame()
    s.onUserScroll(150) // эхо: мы внизу
    s.onUserScroll(60) // пользователь поднялся, наверху окна line 7
    for (let i = 21; i <= 25; i++) buf.write(`line ${i}\n`)
    f.frame()
    expect(tops).toEqual([150, 10])
    expect(shown!.lines[10 / 10]).toBe('line 7') // наверху окна всё ещё line 7
    buf.write('exit 0')
    buf.end()
    expect(tops).toEqual([150, 10, 0])
    expect(shown!.lines[0]).toBe('line 7')
  })
})
