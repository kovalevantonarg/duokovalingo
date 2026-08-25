# Answers — JS/TS Fundamentals

> Полные ответы на вопросы из interview-question-bank.md секция 1 + core-40 #1-8.
> Используй для study, не для копирования. **Проговори вслух** каждый ответ на английском.

## Sources (canonical)

- **MDN Web Docs**: https://developer.mozilla.org/en-US/docs/Web/JavaScript
- **TypeScript Handbook**: https://www.typescriptlang.org/docs/handbook/intro.html
- **TC39 specs**: https://tc39.es/ecma262/
- **You Don't Know JS (Kyle Simpson)**: https://github.com/getify/You-Dont-Know-JS — глубже всего на русском/английском, free на GitHub

---

## #1 Event loop — что выполнится первым: setTimeout(0) или Promise.resolve().then()?

### Короткий ответ
**Promise.then выполнится ПЕРВЫМ.**

### Почему

JS однопоточный. Event loop крутит:
1. **Call stack** — текущий код
2. **Microtask queue** — Promise.then, queueMicrotask, MutationObserver
3. **Macrotask queue** — setTimeout, setInterval, I/O, UI render

После каждой macrotask **полностью опустошается microtask queue** перед следующей macrotask.

```js
console.log('1');
setTimeout(() => console.log('2'), 0);
Promise.resolve().then(() => console.log('3'));
console.log('4');

// Output: 1, 4, 3, 2
```

Объяснение: 1 и 4 — синхронный код. 3 — microtask (Promise). 2 — macrotask (setTimeout).

### Edge cases
- `setTimeout(0)` ≠ "выполнится сразу". Минимальная задержка ~4ms в браузерах после nesting > 5
- `await` под капотом разворачивается в `.then()` → тоже microtask
- `queueMicrotask(fn)` — прямой API без Promise

### Sources
- [MDN — In depth: Microtasks and the JavaScript runtime environment](https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide/In_depth)
- [Jake Archibald — Tasks, microtasks, queues and schedules](https://jakearchibald.com/2015/tasks-microtasks-queues-and-schedules/) — золотой стандарт объяснение

---

## #2 Closures — определение + пример где это бажит

### Определение
**Closure — функция, которая помнит лексическое окружение, в котором была создана**, даже после того как outer scope закрылся.

### Простой пример
```js
function counter() {
  let count = 0;
  return () => ++count;
}

const inc = counter();
inc(); // 1
inc(); // 2
// count "сохранился" внутри inc, хотя counter() уже отработал
```

### Classic gotcha (loop + setTimeout до ES6)
```js
// БАГ
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0);
}
// Output: 3, 3, 3 — потому что var живёт в function scope,
// все 3 closure разделяют одну переменную i

// FIX 1: let (block scope)
for (let i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0);
}
// Output: 0, 1, 2

// FIX 2: IIFE (до ES6)
for (var i = 0; i < 3; i++) {
  ((j) => setTimeout(() => console.log(j), 0))(i);
}
```

### Real-world use cases
- Module pattern (private state)
- Memoization
- Event handlers с captured config
- React useState под капотом — closures over render scope

### Sources
- [MDN — Closures](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Closures)
- [You Don't Know JS — Scope & Closures](https://github.com/getify/You-Dont-Know-JS/blob/2nd-ed/scope-closures/README.md)

---

## #3 Promises — `.all` vs `.allSettled` vs `.race`

### Promise.all
**Принимает array of promises. Возвращает promise, который resolves когда ВСЕ resolve. Если ОДИН reject — весь Promise.all reject (fail-fast).**

```js
Promise.all([p1, p2, p3])
  .then(([r1, r2, r3]) => /* все ok */)
  .catch((err) => /* любой failed */);
```

Use: independent parallel requests, all required.

### Promise.allSettled
**Resolves когда все settle (resolved или rejected). Возвращает array of `{status, value}` или `{status, reason}`.**

```js
const results = await Promise.allSettled([p1, p2, p3]);
results.forEach(r => {
  if (r.status === 'fulfilled') console.log(r.value);
  else console.error(r.reason);
});
```

Use: parallel requests где partial failure OK (e.g., загружаем dashboard widgets).

### Promise.race
**Resolves/rejects с первым settled промисом (whichever первый).**

```js
Promise.race([fetchData(), timeout(5000)]);
// если timeout раньше — reject
```

Use: timeout pattern, fastest source wins.

### Promise.any (часто забывают!)
**Resolves с первым fulfilled. Reject только если ВСЕ rejected (AggregateError).**

```js
Promise.any([cdn1, cdn2, cdn3]).then(...);
// первый успешный CDN выигрывает
```

### Pitfall — passing non-promises
`Promise.all([1, 2, 3])` работает — non-promises wrap в `Promise.resolve(x)`.

### Sources
- [MDN — Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)
- [MDN — Using promises](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises)

---

## #4 async/await pitfall — forEach с await

### Проблема
```js
const items = [1, 2, 3];

// БАГ — НЕ ждёт
items.forEach(async (item) => {
  await processAsync(item);
});
console.log('done'); // напечатается ДО завершения processAsync
```

`forEach` принимает async callback, но **сам не ждёт promise return**. Возвращает `undefined`.

### Fix #1: for...of (sequential)
```js
for (const item of items) {
  await processAsync(item); // ждёт каждое
}
console.log('done'); // после всех
```

### Fix #2: Promise.all (parallel)
```js
await Promise.all(items.map(item => processAsync(item)));
console.log('done');
```

### Когда что
- **for...of** — нужен порядок, или одна операция зависит от предыдущей
- **Promise.all** — independent параллельно, fail-fast
- **Promise.allSettled** — independent, partial failure OK

### Edge case — concurrency limit
```js
// Хочешь 5 в параллель, не все сразу:
import pLimit from 'p-limit';
const limit = pLimit(5);
const results = await Promise.all(
  items.map(item => limit(() => processAsync(item)))
);
```

### Sources
- [MDN — async function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function)
- [JS info — Async iteration](https://javascript.info/async-iterators-generators)

---

## #5 `this` binding — 4 правила + arrow functions

### 4 правила (порядок precedence)

1. **`new` binding** — `new Foo()` → `this = новый объект`
2. **Explicit binding** — `.call(obj)`, `.apply(obj)`, `.bind(obj)` → `this = obj`
3. **Implicit binding** — `obj.method()` → `this = obj`
4. **Default binding** — standalone `fn()` → `this = undefined` (strict) / `globalThis` (sloppy)

### Arrow functions — НЕ имеют своего this
Arrow function **наследует this из enclosing scope** (lexical this).

```js
class Timer {
  constructor() {
    this.seconds = 0;
  }
  
  // БАГ — обычная функция теряет this
  startBad() {
    setInterval(function() {
      this.seconds++; // this = undefined в strict
    }, 1000);
  }
  
  // FIX — arrow function берёт this из startGood
  startGood() {
    setInterval(() => {
      this.seconds++; // this = Timer instance
    }, 1000);
  }
}
```

### Pitfalls
- React class components использовали `.bind(this)` в constructor именно из-за этого
- В hooks этой проблемы нет (functional, no this)
- `obj.method` без `()` теряет binding: `const fn = obj.method; fn()` → default

### Sources
- [MDN — this](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/this)
- [You Don't Know JS — this & Object Prototypes](https://github.com/getify/You-Dont-Know-JS/blob/2nd-ed/objects-classes/README.md)

---

## #6 TypeScript Generics — реализуй Pick<T, K>

### Базовый синтаксис
```ts
function identity<T>(value: T): T { return value; }
identity<string>('hello'); // type-safe
identity('hello'); // T inferred as string
```

### `T extends U` — constraint
```ts
function getLength<T extends { length: number }>(x: T): number {
  return x.length;
}
getLength('hi'); // 2 ✅
getLength([1,2]); // 2 ✅
getLength(42); // ERROR — number нет .length
```

### Реализуй Pick<T, K> вручную
Pick — выбирает указанные ключи из типа.

```ts
type MyPick<T, K extends keyof T> = {
  [P in K]: T[P];
};

type User = { id: number; name: string; email: string };
type UserPreview = MyPick<User, 'id' | 'name'>;
// { id: number; name: string }
```

Разберём:
- `K extends keyof T` — K должен быть подмножеством ключей T
- `[P in K]` — mapped type, итерируется по K
- `T[P]` — indexed access, тип значения по ключу

### Conditional types + infer
```ts
type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never;

function foo() { return 42; }
type FooReturn = ReturnType<typeof foo>; // number
```

`infer R` — "выведи и назови этот тип R, я использую его справа от ?".

### Реализуй Awaited (unwrap Promise)
```ts
type MyAwaited<T> = T extends Promise<infer U> 
  ? MyAwaited<U>  // recursive — для Promise<Promise<X>>
  : T;

type A = MyAwaited<Promise<string>>; // string
type B = MyAwaited<Promise<Promise<number>>>; // number
```

### Sources
- [TypeScript Handbook — Generics](https://www.typescriptlang.org/docs/handbook/2/generics.html)
- [TS Handbook — Conditional Types](https://www.typescriptlang.org/docs/handbook/2/conditional-types.html)
- [Type Challenges](https://github.com/type-challenges/type-challenges) — задачи на type system

---

## #7 TypeScript Utility Types

### Шпаргалка

| Type | Что делает | Пример |
|------|-----------|--------|
| `Partial<T>` | все поля optional | `Partial<User>` → `{ id?: number; name?: string }` |
| `Required<T>` | все поля required | inverse of Partial |
| `Readonly<T>` | все поля readonly | `Readonly<User>` |
| `Pick<T, K>` | подмножество ключей | `Pick<User, 'id'>` → `{ id: number }` |
| `Omit<T, K>` | без указанных ключей | `Omit<User, 'password'>` |
| `Record<K, V>` | dict с ключами K и значениями V | `Record<string, number>` |
| `Exclude<T, U>` | T минус U (для unions) | `Exclude<'a'\|'b', 'a'>` → `'b'` |
| `Extract<T, U>` | пересечение | `Extract<'a'\|'b'\|number, string>` → `'a'\|'b'` |
| `NonNullable<T>` | убирает null и undefined | `NonNullable<string\|null>` → `string` |
| `ReturnType<T>` | тип возврата функции | `ReturnType<typeof fn>` |
| `Parameters<T>` | tuple типов параметров | `Parameters<typeof fn>` |
| `Awaited<T>` | unwrap Promise | `Awaited<Promise<X>>` → `X` |

### Реальные примеры

```ts
// Partial — для update requests
function updateUser(id: number, changes: Partial<User>) {}

// Pick — для DTO
type UserPublic = Pick<User, 'id' | 'name'>;

// Omit — секреты не отдаём
type UserSafe = Omit<User, 'password' | 'apiKey'>;

// Record — typed dictionary
const status: Record<'pending' | 'done', boolean> = {
  pending: true,
  done: false,
};

// ReturnType — type без переписывания
type FetchResult = Awaited<ReturnType<typeof fetchUser>>;
```

### Sources
- [TypeScript Handbook — Utility Types](https://www.typescriptlang.org/docs/handbook/utility-types.html)

---

## #8 Discriminated Unions

### Зачем
TypeScript не может узнать "какой вариант union" без discriminator поля. С discriminated union — может, через type narrowing.

### Pattern
```ts
type Result<T> = 
  | { ok: true; data: T }
  | { ok: false; error: string };

function fetchUser(id: number): Result<User> {
  if (Math.random() > 0.5) return { ok: true, data: { id, name: 'Anton' } };
  return { ok: false, error: 'Not found' };
}

const result = fetchUser(1);
if (result.ok) {
  // TS знает: result.data есть, result.error нет
  console.log(result.data.name);
} else {
  // TS знает: result.error есть, result.data нет
  console.error(result.error);
}
```

### Discriminator field
- `ok: true | false`
- `type: 'success' | 'error' | 'loading'`
- `kind: 'cat' | 'dog'`

### Exhaustiveness check
```ts
type Shape = 
  | { kind: 'circle'; radius: number }
  | { kind: 'square'; size: number };

function area(s: Shape): number {
  switch (s.kind) {
    case 'circle': return Math.PI * s.radius ** 2;
    case 'square': return s.size ** 2;
    default:
      const _exhaustive: never = s;  // если добавишь новый kind, TS орёт
      return _exhaustive;
  }
}
```

### Real-world: API responses
```ts
type ApiResponse<T> = 
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

// В React component:
if (response.status === 'success') {
  return <Data data={response.data} />;  // типобезопасно
}
```

### Sources
- [TS Handbook — Narrowing § Discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions)

---

## Practice Drills

Сделай реально, не просто читай.

### Drill 1 — Реализуй debounce
```ts
function debounce<F extends (...args: any[]) => any>(
  fn: F,
  ms: number
): (...args: Parameters<F>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
```

### Drill 2 — Реализуй Promise.all
```ts
function myPromiseAll<T>(promises: Promise<T>[]): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const results: T[] = new Array(promises.length);
    let completed = 0;
    if (promises.length === 0) return resolve([]);
    promises.forEach((p, i) => {
      Promise.resolve(p).then(
        (val) => {
          results[i] = val;
          if (++completed === promises.length) resolve(results);
        },
        reject
      );
    });
  });
}
```

### Drill 3 — Type-safe fetch wrapper
```ts
async function api<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.statusText);
  return res.json() as Promise<T>;
}

interface User { id: number; name: string }
const user = await api<User>('/api/user/1');
// user — typed as User
```

### Drill 4 — Concurrency limit
```ts
async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const executing = new Set<Promise<void>>();
  for (const item of items) {
    const p = fn(item).then(r => { results.push(r); executing.delete(p as any); });
    executing.add(p as any);
    if (executing.size >= limit) await Promise.race(executing);
  }
  await Promise.all(executing);
  return results;
}
```

---

## What to drill before first interview

1. Закрой этот файл. Открой пустой редактор. Реализуй `debounce` и `Promise.all` от руки. Без подсматривания.
2. Открой консоль браузера. Напиши пример closure с loop bug. Покажи fix через let и через IIFE.
3. Объясни вслух (на английском!) разницу между `Promise.all` и `Promise.allSettled` — за 30 секунд.
4. Напиши `MyPick<T, K>` от руки в TS Playground (https://www.typescriptlang.org/play).

Если все 4 — done без подглядываний → JS/TS секцию **знаешь на интервью уровень**.

Last updated: 2026-05-08
