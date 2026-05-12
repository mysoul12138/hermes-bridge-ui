import { beforeEach, describe, expect, it, vi } from 'vitest'

const providerMock = vi.hoisted(() => ({
  mkDir: vi.fn(),
  writeFile: vi.fn(),
}))

vi.mock('../../packages/server/src/services/hermes/file-provider', () => ({
  createFileProvider: vi.fn(async () => providerMock),
  resolveHermesPath: vi.fn((relativePath: string) => `/home/xl/${relativePath}`),
  isSensitivePath: vi.fn(() => false),
  MAX_EDIT_SIZE: 10 * 1024 * 1024,
}))

describe('files upload route', () => {
  beforeEach(() => {
    vi.resetModules()
    providerMock.mkDir.mockReset()
    providerMock.writeFile.mockReset()
  })

  it('creates parent directories for uploaded folder files using relativePath fields', async () => {
    const { fileRoutes } = await import('../../packages/server/src/routes/hermes/files')
    const layer = fileRoutes.stack.find((entry: any) => entry.path === '/api/hermes/files/upload')
    expect(layer).toBeTruthy()

    const boundary = '----codexboundary'
    const body =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="relativePath"\r\n\r\n` +
      `subdir/nested/file.txt\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="file.txt"\r\n` +
      `Content-Type: text/plain\r\n\r\n` +
      `hello world\r\n` +
      `--${boundary}--\r\n`

    const ctx: any = {
      query: { path: 'workspace' },
      req: (async function * () {
        yield Buffer.from(body, 'utf8')
      })(),
      get(name: string) {
        if (name.toLowerCase() === 'content-type') {
          return `multipart/form-data; boundary=${boundary}`
        }
        return ''
      },
      status: 200,
      body: null,
    }

    await layer.stack[0](ctx, async () => {})

    expect(providerMock.mkDir).toHaveBeenCalledWith('/home/xl/workspace/subdir/nested')
    expect(providerMock.writeFile).toHaveBeenCalledTimes(1)
    expect(ctx.body).toEqual({
      files: [
        {
          name: 'file.txt',
          path: 'workspace/subdir/nested/file.txt',
        },
      ],
    })
  })
})
