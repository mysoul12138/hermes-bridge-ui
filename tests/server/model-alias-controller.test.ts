import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockReadAppConfig, mockWriteAppConfig } = vi.hoisted(() => ({
  mockReadAppConfig: vi.fn(),
  mockWriteAppConfig: vi.fn(),
}))

vi.mock('../../packages/server/src/services/app-config', () => ({
  readAppConfig: mockReadAppConfig,
  writeAppConfig: mockWriteAppConfig,
}))

vi.mock('../../packages/server/src/services/config-helpers', () => ({
  readConfigYaml: vi.fn(),
  writeConfigYaml: vi.fn(),
  fetchProviderModels: vi.fn(),
  buildModelGroups: vi.fn(() => ({ default: '', default_provider: '', groups: [] })),
  PROVIDER_ENV_MAP: {},
  listUserProviders: vi.fn(() => []),
}))

vi.mock('../../packages/server/src/shared/providers', () => ({
  buildProviderModelMap: vi.fn(() => ({})),
  PROVIDER_PRESETS: [],
}))

vi.mock('../../packages/server/src/services/hermes/copilot-models', () => ({
  getCopilotModelsDetailed: vi.fn(),
  resolveCopilotOAuthToken: vi.fn(),
}))

vi.mock('../../packages/server/src/db', () => ({
  getDb: vi.fn(),
}))

vi.mock('../../packages/server/src/db/hermes/schemas', () => ({
  MODEL_CONTEXT_TABLE: 'model_context',
}))

import { setModelAlias } from '../../packages/server/src/controllers/hermes/models'

describe('model alias controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWriteAppConfig.mockResolvedValue({})
  })

  function createCtx(body: unknown) {
    return {
      request: { body },
      status: 200,
      body: undefined as unknown,
    }
  }

  it('saves a trimmed alias in Web UI app config', async () => {
    mockReadAppConfig.mockResolvedValue({
      modelAliases: {
        deepseek: { old: 'Old Alias' },
      },
    })
    const ctx = createCtx({ provider: 'deepseek', model: 'deepseek-v4-flash', alias: '  Flash Alias  ' })

    await setModelAlias(ctx)

    expect(mockWriteAppConfig).toHaveBeenCalledWith({
      modelAliases: {
        deepseek: {
          old: 'Old Alias',
          'deepseek-v4-flash': 'Flash Alias',
        },
      },
    })
    expect(ctx.body).toEqual({
      success: true,
      model_aliases: {
        deepseek: {
          old: 'Old Alias',
          'deepseek-v4-flash': 'Flash Alias',
        },
      },
    })
  })

  it('rejects reserved object keys to avoid prototype pollution', async () => {
    const ctx = createCtx({ provider: '__proto__', model: 'deepseek-v4-flash', alias: 'Alias' })

    await setModelAlias(ctx)

    expect(ctx.status).toBe(400)
    expect(ctx.body).toEqual({ error: 'Invalid provider or model' })
    expect(mockWriteAppConfig).not.toHaveBeenCalled()
  })
})
