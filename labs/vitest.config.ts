import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// SOLUTIONS=1 npm test — гоняет те же тесты против эталона в solutions/.
// Открывай solutions/ только после того, как свой вариант позеленел (или ты честно застрял на 40+ минут).
const dir = process.env.SOLUTIONS ? 'solutions' : 'src'

export default defineConfig({
  resolve: { alias: { '@lab': fileURLToPath(new URL(`./${dir}`, import.meta.url)) } },
  test: { include: ['labs/**/*.test.ts'] },
})
