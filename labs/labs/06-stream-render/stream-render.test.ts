import { describe, it, expect, vi } from 'vitest'
import { createDeltaBuffer, splitStable, shouldStick, createScrollFollower } from '@lab/stream-render'

/**
 * Ручные кадры вместо requestAnimationFrame: schedule кладёт колбэк в очередь и возвращает отмену
 * (как cancelAnimationFrame), а кадр наступает, только когда тест вызовет frame().
 */
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

describe('06 createDeltaBuffer: один рендер на кадр, а не на токен (билеты 20, 41)', () => {
  it('append не рендерит: 200 дельт до кадра → один schedule и один onFlush со всем текстом', () => {
    const f = frames()
    const onFlush = vi.fn()
    const buf = createDeltaBuffer({ schedule: f.schedule, onFlush })
    const tokens = Array.from({ length: 200 }, (_, i) => `t${i} `)
    for (const t of tokens) buf.append(t)
    expect(onFlush).not.toHaveBeenCalled()
    expect(f.schedule).toHaveBeenCalledTimes(1)
    f.frame()
    expect(onFlush).toHaveBeenCalledTimes(1)
    expect(onFlush).toHaveBeenCalledWith(tokens.join(''), tokens.join(''))
  })

  it('следующая порция планирует новый кадр; text копится, delta только новое', () => {
    const f = frames()
    const onFlush = vi.fn()
    const buf = createDeltaBuffer({ schedule: f.schedule, onFlush })
    buf.append('При')
    buf.append('вет')
    f.frame()
    buf.append(', мир')
    expect(f.schedule).toHaveBeenCalledTimes(2)
    f.frame()
    expect(onFlush).toHaveBeenNthCalledWith(1, 'Привет', 'Привет')
    expect(onFlush).toHaveBeenNthCalledWith(2, 'Привет, мир', ', мир')
  })

  it('нечего показать → кадр не планируется: ни пустая дельта, ни кадр без новых дельт', () => {
    const f = frames()
    const onFlush = vi.fn()
    const buf = createDeltaBuffer({ schedule: f.schedule, onFlush })
    buf.append('')
    expect(f.schedule).not.toHaveBeenCalled()
    buf.append('ok')
    f.frame()
    f.frame()
    expect(f.pending()).toBe(0)
    expect(f.schedule).toHaveBeenCalledTimes(1)
    expect(onFlush).toHaveBeenCalledTimes(1)
  })

  it('end() сбрасывает остаток сразу, без кадра, и снимает запланированный кадр', () => {
    const f = frames()
    const onFlush = vi.fn()
    const buf = createDeltaBuffer({ schedule: f.schedule, onFlush })
    buf.append('Конец ')
    buf.append('ответа')
    buf.end()
    expect(onFlush).toHaveBeenCalledWith('Конец ответа', 'Конец ответа')
    expect(f.pending()).toBe(0)
    buf.end()
    buf.append('после конца')
    f.frame()
    expect(onFlush).toHaveBeenCalledTimes(1)
    expect(f.schedule).toHaveBeenCalledTimes(1)
  })

  it('cancel() (Stop или unmount): кадр снят, после отмены ни одного onFlush', () => {
    const f = frames()
    const onFlush = vi.fn()
    const buf = createDeltaBuffer({ schedule: f.schedule, onFlush })
    buf.append('a')
    f.frame()
    buf.append('b')
    buf.cancel()
    expect(f.pending()).toBe(0)
    f.frame()
    buf.append('c')
    buf.end()
    f.frame()
    expect(onFlush).toHaveBeenCalledTimes(1)
    expect(onFlush).toHaveBeenCalledWith('a', 'a')
  })

  it('планировщик не умеет отменять кадр: устаревший кадр после cancel всё равно ничего не сбрасывает', () => {
    const queue: (() => void)[] = []
    const onFlush = vi.fn()
    const buf = createDeltaBuffer({ schedule: (cb) => { queue.push(cb) }, onFlush })
    buf.append('a')
    buf.cancel()
    for (const cb of queue) cb() // кадр всё-таки наступил, а компонента уже нет
    expect(onFlush).not.toHaveBeenCalled()
  })
})

describe('06 splitStable: парсим и рендерим только живой хвост (билеты 20, 41)', () => {
  it('пустая строка закрывает абзац; одиночный \\n абзац не закрывает', () => {
    expect(splitStable('Первый абзац.\n\nВторой')).toEqual({ blocks: ['Первый абзац.\n\n'], tail: 'Второй' })
    expect(splitStable('Строка один\nстрока два\n')).toEqual({ blocks: [], tail: 'Строка один\nстрока два\n' })
  })

  it('недописанный жирный текст или ссылка в конце остаются в хвосте', () => {
    expect(splitStable('Готово.\n\n**Важно: не')).toEqual({ blocks: ['Готово.\n\n'], tail: '**Важно: не' })
    expect(splitStable('См.\n\nподробнее [в доке](https://exa')).toEqual({ blocks: ['См.\n\n'], tail: 'подробнее [в доке](https://exa' })
  })

  it('незакрытый блок кода: всё от открывающей ограды в хвосте, пустая строка внутри кода не режет', () => {
    const md = 'Вот код:\n\n```ts\nconst a = 1\n\nconst b'
    expect(splitStable(md)).toEqual({ blocks: ['Вот код:\n\n'], tail: '```ts\nconst a = 1\n\nconst b' })
  })

  it('закрытый блок кода становится блоком, даже без пустой строки после; недописанная закрывающая ограда ещё не закрывает', () => {
    const code = '```ts\nconst a = 1\n\nconst b = 2\n```\n'
    expect(splitStable('Код:\n' + code + 'Дальше')).toEqual({ blocks: ['Код:\n', code], tail: 'Дальше' })
    expect(splitStable('```ts\nconst a = 1\n```')).toEqual({ blocks: [], tail: '```ts\nconst a = 1\n```' })
  })

  it('пункт списка закончен, когда дописана строка следующего; вложенный пункт остаётся с родителем', () => {
    expect(splitStable('- раз\n- два\n- три\n')).toEqual({ blocks: ['- раз\n', '- два\n'], tail: '- три\n' })
    expect(splitStable('1. Шаг\n2. Шаг\n')).toEqual({ blocks: ['1. Шаг\n'], tail: '2. Шаг\n' })
    expect(splitStable('- a\n  - вложенный\n- b\n')).toEqual({ blocks: ['- a\n  - вложенный\n'], tail: '- b\n' })
  })

  it('CRLF режется так же, как LF; на выходе \\n', () => {
    expect(splitStable('Абзац.\r\n\r\n```\r\nx\r\n\r\ny\r\n```\r\nхвост')).toEqual({
      blocks: ['Абзац.\n\n', '```\nx\n\ny\n```\n'],
      tail: 'хвост',
    })
  })

  it('на каждом префиксе потока: blocks + tail = текст, а готовые блоки только дописываются и не меняются', () => {
    const answer = [
      'Короткий ответ: да.',
      '',
      'Шаги:',
      '1. Первый пункт',
      '2. Второй **важный** пункт',
      '   продолжение второго',
      '',
      '```ts',
      'const a = 1',
      '',
      'const b = 2',
      '```',
      'После кода абзац',
      'с переносом строки.',
      '',
      '',
      '- [ссылка](https://example.com)',
      '- конец',
    ].join('\n')
    const problems: string[] = []
    for (const doc of [answer, answer.replace(/\n/g, '\r\n')]) {
      let prev: string[] = []
      for (let i = 0; i <= doc.length; i++) {
        const prefix = doc.slice(0, i)
        const { blocks, tail } = splitStable(prefix)
        if (blocks.join('') + tail !== prefix.replace(/\r\n/g, '\n')) problems.push(`склейка на ${i}`)
        if (prev.some((b, j) => blocks[j] !== b)) problems.push(`готовый блок изменился на ${i}`)
        prev = blocks
      }
      expect(prev.length).toBe(6)
    }
    expect(problems).toEqual([])
  })
})

describe('06 автоскролл: не дёргать пользователя, который читает выше (билеты 20, 45)', () => {
  it('shouldStick: у низа значит до конца не больше threshold; дробный scrollTop и короткий контент тоже у низа', () => {
    const m = { scrollHeight: 1000, clientHeight: 600, threshold: 40 }
    expect(shouldStick({ ...m, scrollTop: 400 })).toBe(true)
    expect(shouldStick({ ...m, scrollTop: 399.5 })).toBe(true)
    expect(shouldStick({ ...m, scrollTop: 360 })).toBe(true)
    expect(shouldStick({ ...m, scrollTop: 359 })).toBe(false)
    expect(shouldStick({ scrollTop: 0, scrollHeight: 300, clientHeight: 600, threshold: 40 })).toBe(true)
  })

  it('был у низа → после роста скроллим в самый низ, даже если пришёл большой кусок (решение по состоянию ДО роста)', () => {
    const s = createScrollFollower({ threshold: 40 })
    s.onUserScroll({ scrollTop: 400, scrollHeight: 1000, clientHeight: 600 })
    expect(s.onContentGrow({ scrollTop: 400, scrollHeight: 1600, clientHeight: 600 })).toBe(1000)
    expect(s.following()).toBe(true)
  })

  it('ушёл вверх читать → новый текст его не дёргает; вернулся к низу → снова следуем', () => {
    const s = createScrollFollower({ threshold: 40 })
    s.onUserScroll({ scrollTop: 400, scrollHeight: 1000, clientHeight: 600 })
    s.onUserScroll({ scrollTop: 100, scrollHeight: 1000, clientHeight: 600 })
    expect(s.onContentGrow({ scrollTop: 100, scrollHeight: 1600, clientHeight: 600 })).toBeNull()
    expect(s.onContentGrow({ scrollTop: 100, scrollHeight: 2000, clientHeight: 600 })).toBeNull()
    expect(s.following()).toBe(false)
    s.onUserScroll({ scrollTop: 1390, scrollHeight: 2000, clientHeight: 600 })
    expect(s.onContentGrow({ scrollTop: 1390, scrollHeight: 2400, clientHeight: 600 })).toBe(1800)
  })

  it('эхо нашего scrollTo пришло, когда текста уже стало больше: это не прокрутка вверх', () => {
    const s = createScrollFollower({ threshold: 40 })
    s.onUserScroll({ scrollTop: 400, scrollHeight: 1000, clientHeight: 600 })
    expect(s.onContentGrow({ scrollTop: 400, scrollHeight: 1600, clientHeight: 600 })).toBe(1000)
    // браузер присылает scroll от нашего scrollTop = 1000, а высота уже 2200: до низа 600 px
    s.onUserScroll({ scrollTop: 1000, scrollHeight: 2200, clientHeight: 600 })
    expect(s.following()).toBe(true)
    expect(s.onContentGrow({ scrollTop: 1000, scrollHeight: 2200, clientHeight: 600 })).toBe(1600)
  })
})
