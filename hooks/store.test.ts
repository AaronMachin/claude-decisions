import { expect, test } from 'claude-code/testing'

import { create, readAll, readOne, repoKey, storeDir, write } from './store'
import type { StoreCtx } from './store'

type Fake = { files: Map<string, string>; ctx: StoreCtx }

function fake(options: { common?: string; cwd?: string; gitFails?: boolean; files?: Map<string, string> } = {}): Fake {
  const files = options.files ?? new Map<string, string>()
  const ctx: StoreCtx = {
    env: { get: async () => '/home/test' },
    session: { cwd: async () => options.cwd ?? '/work/pantry' },
    process: {
      run: async () =>
        options.gitFails
          ? { exitCode: 128, stdout: '' }
          : { exitCode: 0, stdout: (options.common ?? '/work/pantry/.git') + '\n' },
    },
    fs: {
      read: async (path: string) => {
        const text = files.get(path)
        if (text === undefined) {
          throw new Error('ENOENT')
        }
        return text
      },
      write: async (path: string, text: string) => {
        await Promise.resolve()
        files.set(path, text)
      },
      exists: async (path: string) => files.has(path),
      list: async (dir: string) => {
        const names = [...files.keys()].filter(p => p.startsWith(dir + '/')).map(p => p.slice(dir.length + 1))
        if (names.length === 0) {
          throw new Error('ENOENT')
        }
        return names.map(name => ({ name }))
      },
    },
  }

  return { files, ctx }
}

const INPUT = {
  group: 'Config file plan',
  kind: 'choice' as const,
  title: 'Where the config file lives',
  scenario: 'You run the tool from packages/api and it needs its settings.',
  options: [
    { id: 1, label: 'Project root' },
    { id: 2, label: 'Per package' },
  ],
  recommendation: { option: 1, reason: 'Every other tool reads from the root.' },
  sources: [],
  dependsOn: [],
}

test('the repository key is the folder name plus eight hex characters, stable and distinct', async () => {
  const a = await repoKey('/work/pantry/.git')
  expect(a).toMatch(/^pantry-[0-9a-f]{8}$/)
  expect(await repoKey('/work/pantry/.git/')).toBe(a)
  expect(await repoKey('/work/other/.git')).not.toBe(a)
})

test('a worktree and its main checkout get the same folder, another repository another', async () => {
  const main = await storeDir(fake({ cwd: '/work/pantry' }).ctx)
  const tree = await storeDir(fake({ cwd: '/work/pantry-wt' }).ctx)
  const other = await storeDir(fake({ cwd: '/work/other', common: '/work/other/.git' }).ctx)
  expect(tree).toBe(main)
  expect(main).toMatch(/^\/home\/test\/\.claude\/decisions\/pantry-[0-9a-f]{8}$/)
  expect(other).not.toBe(main)
})

test('outside a git repository the key comes from the working folder', async () => {
  const dir = await storeDir(fake({ gitFails: true, cwd: '/work/loose' }).ctx)
  expect(dir).toMatch(/\/decisions\/loose-[0-9a-f]{8}$/)
})

test('a decision is stored, read back, and survives a reload', async () => {
  const { files, ctx } = fake()
  const made = await create(ctx, INPUT)
  expect(made.id).toBe('d1')
  expect(made.state).toBe('open')
  expect(made.section).toBe('needs-you')

  const reloaded = fake({ files }).ctx
  const { decisions, unreadable } = await readAll(reloaded)
  expect(unreadable).toBe(0)
  expect(decisions.map(d => d.title)).toEqual(['Where the config file lives'])
  expect((await readOne(reloaded, 'd1'))?.options).toHaveLength(2)
  expect(await readOne(reloaded, 'd9')).toBeUndefined()
})

test('write replaces a decision', async () => {
  const { ctx } = fake()
  const made = await create(ctx, INPUT)
  await write(ctx, { ...made, state: 'ready' })
  expect((await readOne(ctx, 'd1'))?.state).toBe('ready')
})

test('a missing folder is empty, and a file that is not JSON is counted and skipped', async () => {
  const { files, ctx } = fake()
  expect(await readAll(ctx)).toEqual({ decisions: [], unreadable: 0 })
  await create(ctx, INPUT)
  const dir = await storeDir(ctx)
  files.set(`${dir}/d7.json`, '{not json')
  const result = await readAll(ctx)
  expect(result.unreadable).toBe(1)
  expect(result.decisions).toHaveLength(1)
})

test('two adds at once get different ids', async () => {
  const { ctx } = fake()
  const [a, b] = await Promise.all([create(ctx, INPUT), create(ctx, INPUT)])
  expect([a.id, b.id].sort()).toEqual(['d1', 'd2'])
})

test('an id another session took meanwhile is skipped, and five misses give up', async () => {
  const { files, ctx } = fake()
  const dir = await storeDir(ctx)
  const real = ctx.fs.exists
  // The listing never shows the other session's files, so only exists can tell.
  ctx.fs.list = async () => {
    throw new Error('ENOENT')
  }
  files.set(`${dir}/d1.json`, '{}')
  expect((await create(ctx, INPUT)).id).toBe('d2')
  ctx.fs.exists = async () => true
  await expect(create(ctx, INPUT)).rejects.toThrow(/could not allocate/i)
  ctx.fs.exists = real
})

test('a thread entry keeps its revision index through a write and read', async () => {
  const files = new Map<string, string>()
  const store: any = {
    env: { get: async () => '/home/t' },
    session: { cwd: async () => '/w/p' },
    process: { run: async () => ({ exitCode: 0, stdout: '/w/p/.git\n' }) },
    fs: {
      read: async (p: string) => files.get(p) ?? '',
      write: async (p: string, t: string) => void files.set(p, t),
      exists: async (p: string) => files.has(p),
      list: async (p: string) => [...files.keys()].filter(k => k.startsWith(p + '/')).map(k => ({ name: k.slice(p.length + 1) })),
    },
  }
  const made = await create(store, { kind: 'choice', title: 't', scenario: 's', options: [{ id: 1, label: 'a' }], sources: [], dependsOn: [] })
  await write(store, { ...made, thread: [{ who: 'claude', text: '↻ x', at: 'now', revision: 0 }] })
  expect((await readOne(store, made.id))?.thread[0]?.revision).toBe(0)
})

test('the store folder is worked out with git once per working folder, so a redraw does not run git again', async () => {
  let gitRuns = 0
  const files = new Map<string, string>()
  const $: StoreCtx = {
    env: { get: async () => '/home/cache' },
    session: { cwd: async () => '/work/cache-once' },
    process: {
      run: async () => {
        gitRuns += 1
        return { exitCode: 0, stdout: '/work/cache-once/.git\n' }
      },
    },
    fs: {
      read: async (p: string) => files.get(p) ?? '',
      write: async (p: string, text: string) => void files.set(p, text),
      exists: async (p: string) => files.has(p),
      list: async () => [],
    },
  }
  await readAll($)
  await readAll($)
  await readAll($)
  expect(gitRuns).toBe(1)
})

test('a git call that fails first is not remembered, so the next call finds the repository folder', async () => {
  let calls = 0
  const $: StoreCtx = {
    env: { get: async () => '/home/cache' },
    session: { cwd: async () => '/work/cache-retry' },
    process: {
      run: async () => {
        calls += 1
        if (calls === 1) {
          throw new Error('aborted')
        }
        return { exitCode: 0, stdout: '/work/cache-retry/.git\n' }
      },
    },
    fs: { read: async () => '', write: async () => undefined, exists: async () => false, list: async () => [] },
  }
  await expect(storeDir($)).rejects.toThrow('aborted')
  const dir = await storeDir($)
  expect(dir).toBe(`/home/cache/.claude/decisions/${await repoKey('/work/cache-retry/.git')}`)
  expect(await storeDir($)).toBe(dir)
  expect(calls).toBe(2)
})
