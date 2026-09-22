# Answers — React Deep

> Полные ответы на React вопросы из interview-question-bank.md секция 2 + core-40 #9-16.

## Sources (canonical)

- **React docs (new)**: https://react.dev — ОЧЕНЬ хорошие, читай примеры
- **React 19 release notes**: https://react.dev/blog/2024/12/05/react-19
- **Dan Abramov**: https://overreacted.io — лучшие deep dives
- **Vercel — Next.js docs (RSC)**: https://nextjs.org/docs/app/getting-started

---

## #9 Hooks rules — почему нельзя в условиях/циклах

### Правила
1. **Только на верхнем уровне** функции компонента или другого hook
2. **Только из React functions** (компоненты, custom hooks)

### Почему

React **связывает hook с компонентом по порядку вызова, не по имени**. Внутри React хранит linked list of hooks per fiber. На каждом render идёт по списку ровно тем же путём.

```js
// БАГ
function Component({ flag }) {
  if (flag) {
    const [a, setA] = useState(0); // hook #1, иногда есть, иногда нет
  }
  const [b, setB] = useState(''); // если flag changes, "b" станет "a" в linked list — катастрофа
}
```

React не видит имя `a` или `b`. Он видит "первый useState вернул [0, fn]". Если порядок меняется между рендерами → state расползается.

### Custom hooks
Тоже подчиняются правилам — внутри custom hook ты не можешь делать условный useState либо useEffect.

### ESLint rule
`eslint-plugin-react-hooks` ловит нарушения автоматически. **Всегда включён** в Next.js / CRA / Vite templates.

### Sources
- [React docs — Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks)
- [Dan Abramov — Why Do React Hooks Rely on Call Order?](https://overreacted.io/why-do-hooks-rely-on-call-order/)

---

## #10 useEffect cleanup — когда вызывается

### Lifecycle
```js
useEffect(() => {
  // setup — каждый render где deps changed
  const sub = source.subscribe();
  
  return () => {
    // cleanup — ПЕРЕД следующим setup + при unmount
    sub.unsubscribe();
  };
}, [source]);
```

**Cleanup вызывается:**
1. Перед каждым next setup (если deps изменились) — старая subscription удаляется до новой
2. При unmount компонента

### Что произойдёт если не cleanup'ить

Memory leaks + duplicate subscriptions:
```js
// БАГ
useEffect(() => {
  const id = setInterval(() => tick(), 1000);
  // нет return → каждый rerender новый interval, старые не остановлены
}, [count]);

// FIX
useEffect(() => {
  const id = setInterval(() => tick(), 1000);
  return () => clearInterval(id);
}, [count]);
```

### React 18+ Strict Mode "double effect"
В development StrictMode намеренно запускает effect → cleanup → effect снова, чтобы найти баги. **Это не баг, это feature** — если cleanup некорректен, увидишь сразу.

### Real-world cleanup must-haves
- subscriptions / event listeners
- intervals / timeouts
- AbortController на fetch
- WebSocket close
- cancelled promises (через ref flag)

### Pitfall — race condition в fetch
```js
useEffect(() => {
  let cancelled = false;
  fetchUser(id).then(user => {
    if (!cancelled) setUser(user);
  });
  return () => { cancelled = true; };
}, [id]);

// Лучше — AbortController:
useEffect(() => {
  const ac = new AbortController();
  fetch(`/user/${id}`, { signal: ac.signal })
    .then(r => r.json())
    .then(setUser)
    .catch(e => { if (e.name !== 'AbortError') throw e; });
  return () => ac.abort();
}, [id]);
```

### Sources
- [React docs — useEffect](https://react.dev/reference/react/useEffect)
- [React docs — Synchronizing with Effects](https://react.dev/learn/synchronizing-with-effects)

---

## #11 useMemo vs useCallback — когда РЕАЛЬНО нужно

### Что они делают

- **`useMemo(() => compute(a, b), [a, b])`** — memoize **value**. Возвращает то же значение пока deps не изменились.
- **`useCallback(fn, [deps])`** — memoize **function**. Возвращает ту же function reference пока deps не изменились. Сахар над `useMemo(() => fn, deps)`.

### Когда РЕАЛЬНО нужно

**1. Дорогое вычисление**
```js
const filteredList = useMemo(() => 
  hugeList.filter(complex predicate), 
  [hugeList, query]
);
```

**2. Reference stability для children с React.memo**
```js
const Child = React.memo(({ onClick }) => ...);

// БАГ — onClick новый каждый render → React.memo бесполезен
function Parent() {
  return <Child onClick={() => doStuff()} />;
}

// FIX
function Parent() {
  const handleClick = useCallback(() => doStuff(), []);
  return <Child onClick={handleClick} />;
}
```

**3. Stable dep для useEffect**
```js
const config = useMemo(() => ({ url, headers }), [url, headers]);
useEffect(() => {
  fetchWith(config);
}, [config]); // не fires каждый render
```

### Когда НЕ нужно

- Простые computations (`x + 1`) — useMemo сам по себе has overhead
- Если value не передаётся в memoized child и не используется в effect deps
- "for performance" без profiling

> **Default**: пиши без useMemo/useCallback. Добавляй когда видишь конкретный rerender или slow compute в Profiler.

### React Compiler (новый!)
React Compiler — это build-time инструмент (Babel-плагин `babel-plugin-react-compiler`), а не фича рантайма React 19. Он **автоматически мемоизирует** компоненты и значения, и тогда большую часть useMemo/useCallback можно не писать. Работает лучше всего с React 19, но поддерживает и 17/18 (для них в конфиге задаётся target, детали в доках). Частая ошибка на интервью: сказать «компилятор есть только в React 19».

### Sources
- [React docs — useMemo](https://react.dev/reference/react/useMemo)
- [React docs — useCallback](https://react.dev/reference/react/useCallback)
- [Kent C. Dodds — When to useMemo and useCallback](https://kentcdodds.com/blog/usememo-and-usecallback)

---

## #12 useEffect dependencies — что произойдёт

### Варианты
```js
// 1. Каждый render
useEffect(() => { /* */ });

// 2. Mount only
useEffect(() => { /* */ }, []);

// 3. Mount + когда deps changed
useEffect(() => { /* */ }, [a, b]);
```

### Pitfall: object/array в deps

```js
const config = { url, headers };
useEffect(() => {
  fetch(config.url);
}, [config]); // КАЖДЫЙ render новый объект — fires every render

// FIX 1: примитивы
useEffect(() => {
  fetch(url);
}, [url]); // url — string

// FIX 2: useMemo
const config = useMemo(() => ({ url, headers }), [url, headers]);

// FIX 3: вынеси за пределы или в ref
```

### Stale closure
Самая частая ошибка:
```js
// БАГ
useEffect(() => {
  const id = setInterval(() => {
    setCount(count + 1); // count "застывает" с первого render
  }, 1000);
  return () => clearInterval(id);
}, []); // нет deps → count всегда 0 в interval

// FIX 1: functional update
useEffect(() => {
  const id = setInterval(() => {
    setCount(c => c + 1); // c — текущее значение
  }, 1000);
  return () => clearInterval(id);
}, []);

// FIX 2: добавить count в deps (но тогда interval restartится каждый раз)
```

### exhaustive-deps lint rule
`react-hooks/exhaustive-deps` ловит missed deps. **Никогда** не игнорируй disable comment без явной причины — почти всегда баг.

### Sources
- [React docs — Specifying Reactive Dependencies](https://react.dev/learn/lifecycle-of-reactive-effects#what-an-effect-with-empty-dependencies-means)
- [Dan Abramov — A Complete Guide to useEffect](https://overreacted.io/a-complete-guide-to-useeffect/) — must read

---

## #13 Reconciliation + keys

### Reconciliation
React сравнивает new tree (после render) с old tree (предыдущий render) и применяет минимум изменений к DOM.

**Алгоритм** (упрощённо):
- Если разный type (`<div>` vs `<span>`) → unmount + new mount
- Если same type → update props, recurse в children
- Children comparison: по индексам, либо по `key`

### Зачем `key`

Без key React сравнивает по позиции:
```jsx
// initial
[<Item id="a"/>, <Item id="b"/>, <Item id="c"/>]

// после insert в начало
[<Item id="z"/>, <Item id="a"/>, <Item id="b"/>, <Item id="c"/>]
```

Без key React думает: "позиция 0 раньше была 'a', теперь 'z' — обнови props". То же для всех. **4 update вместо 1 insert**.

С `key={id}` React видит: "key 'z' новый — insert. 'a','b','c' существовали — оставь как есть".

### Почему `key={index}` плохо

При reorder/insert/delete индексы сдвигаются → React видит "те же ключи в тех же позициях" → не понимает что произошёл reorder. Side effects в Item (input state, animations) leak в неправильный element.

```jsx
// БАГ
{items.map((item, i) => <Input key={i} defaultValue={item.text} />)}

// При удалении первого item: 
// Input #0 теперь имеет defaultValue второго item, но React думает это тот же Input
// → user input в первом сохранился, но привязан к чужим данным

// FIX
{items.map(item => <Input key={item.id} defaultValue={item.text} />)}
```

### Stable, unique, predictable
Key должен быть:
- Stable — не меняется между renders
- Unique — среди siblings
- Predictable — derives from data, не `Math.random()` или `Date.now()`

### Sources
- [React docs — Rendering Lists § Keeping list items in order with key](https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key)
- [React docs — Reconciliation (legacy)](https://legacy.reactjs.org/docs/reconciliation.html) — legacy но всё ещё концептуально верно

---

## #14 Suspense

### Что это
Suspense — компонент, который показывает fallback UI пока children "не готовы" (загружаются, lazy-import, data fetching).

```jsx
<Suspense fallback={<Spinner />}>
  <UserProfile userId={id} />
</Suspense>
```

### Use cases

**1. Lazy components (work с React 16+)**
```jsx
const Profile = lazy(() => import('./Profile'));

<Suspense fallback={<Spinner />}>
  <Profile />
</Suspense>
```

**2. Data fetching (React 18+ с right libs)**
Сами по себе fetch не triggerит Suspense. Нужна интеграция: Relay, React Query (с `useSuspenseQuery`), tanstack/router, or custom.

```jsx
function UserProfile({ id }) {
  const user = use(fetchUserPromise(id)); // throws promise если не готов
  return <div>{user.name}</div>;
}
```

`use()` — React 19 hook. Если promise не resolved — throws → Suspense ловит → показывает fallback.

### Server vs Client Suspense

**Server Suspense (Streaming SSR)**:
React сервер начинает streaming HTML. Когда доходит до Suspense с pending data → отправляет fallback в HTML, продолжает stream. Когда data готова → отправляет "patch" HTML и инструкцию заменить fallback.

```
Browser receives:
[layout HTML]
[<Suspense fallback="loading">PLACEHOLDER</Suspense>]
[footer HTML]
... (later) ...
[<template id="B:0">RealContent</template>]
[script: replace placeholder with template]
```

Это даёт **partial hydration / selective hydration** — не нужно ждать полную страницу для interactivity.

**Client Suspense**: то же поведение в browser (Suspense ловит throws на client side).

### Sources
- [React docs — Suspense](https://react.dev/reference/react/Suspense)
- [React 18 Working Group — New Suspense SSR Architecture](https://github.com/reactwg/react-18/discussions/37)

---

## #15 React Server Components (RSC)

### Что это
Компоненты, которые **рендерятся ТОЛЬКО на сервере** и отправляют клиенту специальный RSC payload (свой wire-формат, не HTML и не JSON).

### Отличие от SSR

**SSR**: компонент рендерится на сервере → HTML → отправляется клиенту → **клиент гидрирует** (загружает JS компонента, прикрепляет event handlers). JS компонента в bundle.

**RSC**: компонент рендерится на сервере → RSC payload (структура tree) → клиент применяет к VDOM → **JS компонента НЕ нужен на клиенте**. Zero bundle add.

### Что НЕЛЬЗЯ в Server Component

- `useState`, `useEffect`, useReducer, useContext (нет state, нет lifecycle)
- Event handlers (`onClick={...}`)
- Browser APIs (`window`, `localStorage`)
- Custom hooks с любым из вышеуказанного

### Что МОЖНО

- `async/await` прямо в компоненте! (`async function Page() { const data = await db.query(); ... }`)
- Прямой доступ к DB, file system, secrets — это сервер
- Импорт огромных libs (markdown parser, syntax highlighter) — bundle не растёт

### Когда RSC vs Client

- **RSC**: data fetching, static content, layouts
- **Client (`'use client'`)**: интерактивность (state, effects, click handlers)

```jsx
// Server Component
async function UserPage({ id }) {
  const user = await db.users.findOne(id); // прямой DB call
  return (
    <div>
      <h1>{user.name}</h1>
      <EditButton userId={user.id} /> {/* Client Component */}
    </div>
  );
}

// 'use client' file
'use client';
function EditButton({ userId }) {
  const [editing, setEditing] = useState(false);
  return <button onClick={() => setEditing(true)}>Edit</button>;
}
```

### Async data flow
RSC → renders с awaited data → streams → Client island gets static parts + entry points для интерактивности.

### Где доступно
- Next.js App Router (production-ready since Next 13.4)
- React 19 standalone (для framework authors)

### Sources
- [React docs — Server Components](https://react.dev/reference/rsc/server-components)
- [Next.js — Server Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [Dan Abramov — RSC From Scratch](https://github.com/reactwg/server-components/discussions/5) — лучший mental model

---

## #16 React 19 changes

### Actions

Server и client functions, которые можно передавать в `<form action={...}>` или `useActionState`.

```jsx
// Server action
async function createPost(formData: FormData) {
  'use server';
  await db.posts.create({ title: formData.get('title') });
  revalidatePath('/posts');
}

<form action={createPost}>
  <input name="title" />
  <button type="submit">Create</button>
</form>
```

### `use()` hook
**Принимает Promise или Context** — может в условиях (нарушает обычное правило!).

```jsx
function Profile({ id }) {
  const user = use(fetchUserPromise(id)); // throws promise если pending
  // ...
}
```

vs `useContext`:
```jsx
const value = use(MyContext); // эквивалентно useContext(MyContext)
// но work в условиях!
```

### useFormStatus
Внутри form читает status form action.
```jsx
function Submit() {
  const { pending } = useFormStatus();
  return <button disabled={pending}>{pending ? '...' : 'Submit'}</button>;
}
```

### useActionState
State-driven actions с pending/error tracking.
```jsx
function MyForm() {
  const [state, action, pending] = useActionState(serverAction, initialState);
  return <form action={action}>...</form>;
}
```

### useOptimistic
Оптимистичные UI updates до того как server action завершится.
```jsx
const [optimisticTodos, addOptimistic] = useOptimistic(
  todos,
  (current, newTodo) => [...current, { ...newTodo, pending: true }]
);

async function handleSubmit(formData) {
  addOptimistic({ id: crypto.randomUUID(), text: formData.get('text') });
  await createTodo(formData);   // вызывается внутри form action / transition
}
```
Второй аргумент (reducer) формально необязательный, но без него `addOptimistic(todo)` не добавит элемент, а **заменит весь список одним объектом**. Для списков reducer нужен всегда. Второй плюс reducer'а: если `todos` поменялся, пока action в полёте, React пересчитает оптимистичное состояние поверх свежего списка.

Мостик к AI-UI: ровно так показывается сообщение пользователя в чате до ответа сервера — сразу в ленте, с pending-состоянием, а после подтверждения заменяется настоящим.

### Document metadata in components
`<title>`, `<meta>` теперь работают прямо в JSX (раньше нужен был react-helmet).

### React Compiler
См. #11 — там разобрано, что это build-time плагин и с какими версиями React работает.

### `ref` as prop
Больше не нужен `forwardRef`:
```jsx
function MyInput({ ref, ...props }) {
  return <input ref={ref} {...props} />;
}
```

### Sources
- [React 19 release notes](https://react.dev/blog/2024/12/05/react-19)
- [Vercel — React 19 conf talks](https://www.youtube.com/@vercel)

---

## Bonus: часто всплывают

### useState lazy initialization
```jsx
// БАГ — каждый render вызывает expensive()
const [val] = useState(expensive());

// FIX — один раз
const [val] = useState(() => expensive());
```

### useRef — три use cases
1. **DOM ref**: `const inputRef = useRef(null); <input ref={inputRef} />`
2. **Mutable value**: храни что-то которое не triggerит rerender (timer id, latest value)
3. **Previous value pattern**:
```jsx
const prevCount = useRef();
useEffect(() => { prevCount.current = count; }, [count]);
```

### Context rerender pitfall
Если provider value меняется (особенно object literal) → ВСЕ consumers rerender.

```jsx
// БАГ — value новый каждый render
<MyContext.Provider value={{ user, setUser }}>

// FIX 1
const value = useMemo(() => ({ user, setUser }), [user]);
<MyContext.Provider value={value}>

// FIX 2 — split context (state + dispatch отдельно)
```

### Error boundaries
- Class components only (нет hooks-version пока)
- Ловят: errors в render, lifecycle, constructors of children
- НЕ ловят: async (event handlers, setTimeout), errors в самом boundary, server-side errors

```jsx
class ErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error, info) { logError(error, info); }
  render() {
    return this.state.hasError ? <Fallback /> : this.props.children;
  }
}
```

---

## Practice Drills

### Drill 1 — useDebounceValue
```ts
function useDebounceValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}
```

### Drill 2 — usePrevious
```ts
function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  useEffect(() => { ref.current = value; }, [value]);
  return ref.current;
}
```

### Drill 3 — useFetch with abort
```ts
function useFetch<T>(url: string) {
  const [state, setState] = useState<{
    data?: T; loading: boolean; error?: Error
  }>({ loading: true });

  useEffect(() => {
    const ac = new AbortController();
    setState({ loading: true });
    fetch(url, { signal: ac.signal })
      .then(r => r.json())
      .then(data => setState({ data, loading: false }))
      .catch(e => {
        if (e.name !== 'AbortError') setState({ error: e, loading: false });
      });
    return () => ac.abort();
  }, [url]);

  return state;
}
```

### Drill 4 — Optimized list with React.memo + useCallback
Реализуй TodoList где adding/removing item не rerender'ит другие items.

```jsx
const Row = memo(function Row({ todo, onRemove }) {
  return (
    <li>
      {todo.text}
      <button onClick={() => onRemove(todo.id)}>×</button>
    </li>
  );
});

function TodoList() {
  const [todos, setTodos] = useState([]);

  // Стабильная ссылка: функциональный setState, поэтому deps пустые
  const remove = useCallback(id => {
    setTodos(ts => ts.filter(t => t.id !== id));
  }, []);

  const add = text =>
    setTodos(ts => [...ts, { id: crypto.randomUUID(), text }]);

  return (
    <ul>
      {todos.map(t => <Row key={t.id} todo={t} onRemove={remove} />)}
    </ul>
  );
}
```
Почему это работает:
- `onRemove` одна и та же функция для всех строк и между рендерами. Если бы я передавал `() => remove(t.id)` прямо в map, у каждой строки на каждом рендере был бы новый проп, и `memo` ничего бы не дал.
- Объекты неизменённых todo остаются теми же ссылками (`filter` и spread их не копируют), поэтому shallow compare в `memo` проходит.
- `key={t.id}`, а не индекс: при удалении из середины с индексом-ключом React сопоставит строки со сдвигом, и memo будет сравнивать не те пропсы (см. #13).
- Цена: memo сам стоит сравнения пропсов на каждый рендер. На списке из 10 строк это экономия ни на чём; я бы сначала замерил профайлером, есть ли проблема. С React Compiler большую часть этого кода писать руками не нужно.

---

## What to drill before first interview

1. Объясни вслух за 60 секунд: "Why can't you call hooks in conditions?" — на английском
2. Напиши `useDebounceValue` от руки в Playground
3. Объясни различие RSC и SSR за 60 секунд
4. Реши проблему: "у нас Context Provider rerender'ит всё дерево, что делать?" — 3 варианта решения

Last updated: 2026-09-22
