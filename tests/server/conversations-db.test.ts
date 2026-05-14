import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const profileDirState = vi.hoisted(() => ({ value: '' }))

vi.mock('../../packages/server/src/services/hermes/hermes-profile', () => ({
  getActiveProfileDir: () => profileDirState.value,
}))

vi.mock('../../packages/server/src/services/hermes/tui-live', () => ({
  listLiveTuiSessionKeys: vi.fn().mockResolvedValue(new Set()),
}))

function ensureSqliteAvailable() {
  const [major, minor] = process.versions.node.split('.').map(Number)
  if (major < 22 || (major === 22 && minor < 5)) {
    throw new Error(`node:sqlite requires Node >= 22.5, current: ${process.versions.node}`)
  }
}

function createSchema(db: any) {
  db.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      user_id TEXT,
      model TEXT,
      model_config TEXT,
      system_prompt TEXT,
      parent_session_id TEXT,
      started_at REAL NOT NULL,
      ended_at REAL,
      end_reason TEXT,
      message_count INTEGER DEFAULT 0,
      tool_call_count INTEGER DEFAULT 0,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0,
      cache_write_tokens INTEGER DEFAULT 0,
      reasoning_tokens INTEGER DEFAULT 0,
      billing_provider TEXT,
      billing_base_url TEXT,
      billing_mode TEXT,
      estimated_cost_usd REAL,
      actual_cost_usd REAL,
      cost_status TEXT,
      cost_source TEXT,
      pricing_version TEXT,
      title TEXT,
      api_call_count INTEGER DEFAULT 0,
      FOREIGN KEY (parent_session_id) REFERENCES sessions(id)
    );

    CREATE TABLE messages (
      id INTEGER PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      role TEXT NOT NULL,
      content TEXT,
      tool_call_id TEXT,
      tool_calls TEXT,
      tool_name TEXT,
      timestamp REAL NOT NULL,
      token_count INTEGER,
      finish_reason TEXT,
      reasoning TEXT,
      reasoning_details TEXT,
      codex_reasoning_items TEXT,
      reasoning_content TEXT
    );
  `)
}

function insertSession(db: any, session: Record<string, unknown>) {
  db.prepare(`
    INSERT INTO sessions (
      id, source, user_id, model, model_config, system_prompt, parent_session_id,
      started_at, ended_at, end_reason, message_count, tool_call_count,
      input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
      reasoning_tokens, billing_provider, billing_base_url, billing_mode,
      estimated_cost_usd, actual_cost_usd, cost_status, cost_source,
      pricing_version, title, api_call_count
    ) VALUES (
      @id, @source, @user_id, @model, @model_config, @system_prompt, @parent_session_id,
      @started_at, @ended_at, @end_reason, @message_count, @tool_call_count,
      @input_tokens, @output_tokens, @cache_read_tokens, @cache_write_tokens,
      @reasoning_tokens, @billing_provider, @billing_base_url, @billing_mode,
      @estimated_cost_usd, @actual_cost_usd, @cost_status, @cost_source,
      @pricing_version, @title, @api_call_count
    )
  `).run({
    user_id: null,
    model_config: null,
    system_prompt: null,
    billing_base_url: null,
    billing_mode: null,
    cost_source: null,
    pricing_version: null,
    api_call_count: 0,
    ...session,
  })
}

function insertMessage(db: any, message: Record<string, unknown>) {
  db.prepare(`
    INSERT INTO messages (
      id, session_id, role, content, tool_call_id, tool_calls, tool_name,
      timestamp, token_count, finish_reason, reasoning, reasoning_details,
      codex_reasoning_items, reasoning_content
    ) VALUES (
      @id, @session_id, @role, @content, @tool_call_id, @tool_calls, @tool_name,
      @timestamp, @token_count, @finish_reason, @reasoning, @reasoning_details,
      @codex_reasoning_items, @reasoning_content
    )
  `).run({
    tool_call_id: null,
    tool_calls: null,
    tool_name: null,
    token_count: null,
    finish_reason: null,
    reasoning: null,
    reasoning_details: null,
    codex_reasoning_items: null,
    reasoning_content: null,
    ...message,
  })
}

describe('conversation DB service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-20T00:00:00Z'))
    profileDirState.value = mkdtempSync(join(tmpdir(), 'hwui-conversations-db-'))
  })

  afterEach(() => {
    vi.useRealTimers()
    if (profileDirState.value) rmSync(profileDirState.value, { recursive: true, force: true })
  })

  it('folds parentless bridge context continuations back into the root conversation', async () => {
    ensureSqliteAvailable()
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(join(profileDirState.value, 'state.db'))
    createSchema(db)

    insertSession(db, {
      id: 'root',
      parent_session_id: null,
      source: 'tui',
      model: 'openai/gpt-5.4',
      title: null,
      started_at: 100,
      ended_at: null,
      end_reason: null,
      message_count: 2,
      tool_call_count: 1,
      input_tokens: 1,
      output_tokens: 2,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })
    insertSession(db, {
      id: 'cont-1',
      parent_session_id: null,
      source: 'tui',
      model: 'openai/gpt-5.4',
      title: null,
      started_at: 200,
      ended_at: null,
      end_reason: null,
      message_count: 2,
      tool_call_count: 1,
      input_tokens: 3,
      output_tokens: 4,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })
    insertSession(db, {
      id: 'cont-2',
      parent_session_id: null,
      source: 'tui',
      model: 'openai/gpt-5.4',
      title: null,
      started_at: 260,
      ended_at: null,
      end_reason: null,
      message_count: 2,
      tool_call_count: 1,
      input_tokens: 5,
      output_tokens: 6,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })

    insertMessage(db, { id: 1, session_id: 'root', role: 'user', content: 'root request', timestamp: 101 })
    insertMessage(db, { id: 2, session_id: 'root', role: 'assistant', content: 'root answer', timestamp: 190 })
    insertMessage(db, {
      id: 3,
      session_id: 'cont-1',
      role: 'user',
      content: 'Previous conversation context:\nassistant: root answer\n\nCurrent user message:\ncontinue one',
      timestamp: 201,
    })
    insertMessage(db, { id: 4, session_id: 'cont-1', role: 'assistant', content: 'continuation one answer', timestamp: 250 })
    insertMessage(db, {
      id: 5,
      session_id: 'cont-2',
      role: 'user',
      content: 'Previous conversation context:\nassistant: continuation one answer\n\nCurrent user message:\ncontinue two',
      timestamp: 261,
    })
    insertMessage(db, { id: 6, session_id: 'cont-2', role: 'assistant', content: 'continuation two answer', timestamp: 262 })
    db.close()

    const mod = await import('../../packages/server/src/db/hermes/conversations-db')
    const summaries = await mod.listConversationSummariesFromDb({ humanOnly: true })
    expect(summaries.map((summary: any) => summary.id)).toEqual(['root'])

    const detail = await mod.getConversationDetailFromDb('root', { humanOnly: true })
    expect(detail?.messages.map((message: any) => message.content)).toEqual([
      'root request',
      'root answer',
      'continue one',
      'continuation one answer',
      'continue two',
      'continuation two answer',
    ])
    expect(detail?.branches || []).toEqual([])
  })

  it('does not fold adjacent bridge context sessions when the child context references different history', async () => {
    ensureSqliteAvailable()
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(join(profileDirState.value, 'state.db'))
    createSchema(db)

    insertSession(db, {
      id: 'previous-context-session',
      parent_session_id: null,
      source: 'tui',
      model: 'openai/gpt-5.4',
      title: null,
      started_at: 100,
      ended_at: null,
      end_reason: null,
      message_count: 2,
      tool_call_count: 1,
      input_tokens: 1,
      output_tokens: 2,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })
    insertSession(db, {
      id: 'next-context-session',
      parent_session_id: null,
      source: 'tui',
      model: 'openai/gpt-5.4',
      title: null,
      started_at: 200.2,
      ended_at: null,
      end_reason: null,
      message_count: 2,
      tool_call_count: 1,
      input_tokens: 3,
      output_tokens: 4,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })

    insertMessage(db, {
      id: 7,
      session_id: 'previous-context-session',
      role: 'user',
      content: 'Previous conversation context:\nassistant: browser tab crashes when loading this session\n\nCurrent user message:\ncontinue debugging render crash',
      timestamp: 101,
    })
    insertMessage(db, { id: 8, session_id: 'previous-context-session', role: 'assistant', content: 'Inspecting the render crash', timestamp: 200 })
    insertMessage(db, {
      id: 9,
      session_id: 'next-context-session',
      role: 'user',
      content: 'Previous conversation context:\nassistant: fast thinking stream overloads the UI\n\nCurrent user message:\nopen this project path',
      timestamp: 200.2,
    })
    insertMessage(db, { id: 10, session_id: 'next-context-session', role: 'assistant', content: 'Reviewing your changes', timestamp: 201 })
    db.close()

    const mod = await import('../../packages/server/src/db/hermes/conversations-db')
    const summaries = await mod.listConversationSummariesFromDb({ humanOnly: true })
    expect(summaries.map((summary: any) => summary.id)).toEqual([
      'next-context-session',
      'previous-context-session',
    ])

    const detail = await mod.getConversationDetailFromDb('next-context-session', { humanOnly: true })
    expect(detail?.messages.map((message: any) => message.content)).toEqual([
      'open this project path',
      'Reviewing your changes',
    ])
    expect(detail?.branches || []).toEqual([])
  })

  it('does not report branch_session_count for a bridge-context continuation without real child branches', async () => {
    ensureSqliteAvailable()
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(join(profileDirState.value, 'state.db'))
    createSchema(db)

    insertSession(db, {
      id: 'root',
      parent_session_id: null,
      source: 'tui',
      model: 'openai/gpt-5.4',
      title: 'Root',
      started_at: 100,
      ended_at: 110,
      end_reason: null,
      message_count: 1,
      tool_call_count: 0,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })
    insertSession(db, {
      id: 'continuation',
      parent_session_id: 'root',
      source: 'tui',
      model: 'openai/gpt-5.4',
      title: 'Continuation',
      started_at: 120,
      ended_at: null,
      end_reason: null,
      message_count: 2,
      tool_call_count: 0,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })

    insertMessage(db, { id: 1, session_id: 'root', role: 'assistant', content: 'older answer', timestamp: 101 })
    insertMessage(db, {
      id: 2,
      session_id: 'continuation',
      role: 'user',
      content: 'Previous conversation context:\nassistant: older answer\n\nCurrent user message:\ncontinue here',
      timestamp: 120,
    })
    insertMessage(db, { id: 3, session_id: 'continuation', role: 'assistant', content: 'continued answer', timestamp: 121 })
    db.close()

    const mod = await import('../../packages/server/src/db/hermes/conversations-db')
    const summaries = await mod.listConversationSummariesFromDb({ humanOnly: true })
    expect(summaries.map((summary: any) => summary.id)).toEqual(['root'])
    expect(summaries[0]?.branch_session_count).toBe(0)

    const detail = await mod.getConversationDetailFromDb('root', { humanOnly: true })
    expect(detail?.branch_session_count).toBe(0)
    expect(detail?.branches || []).toEqual([])
  })

  it('aggregates a compression continuation without using full CLI export', async () => {
    ensureSqliteAvailable()
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(join(profileDirState.value, 'state.db'))
    createSchema(db)

    insertSession(db, {
      id: 'root',
      parent_session_id: null,
      source: 'cli',
      model: 'openai/gpt-5.4',
      title: null,
      started_at: 100,
      ended_at: 110,
      end_reason: 'compression',
      message_count: 2,
      tool_call_count: 0,
      input_tokens: 5,
      output_tokens: 8,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0.1,
      actual_cost_usd: 0.1,
      cost_status: 'estimated',
    })
    insertSession(db, {
      id: 'root-cont',
      parent_session_id: 'root',
      source: 'cli',
      model: 'openai/gpt-5.4',
      title: 'Continuation',
      started_at: 110,
      ended_at: 111,
      end_reason: null,
      message_count: 2,
      tool_call_count: 0,
      input_tokens: 3,
      output_tokens: 4,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0.2,
      actual_cost_usd: 0.2,
      cost_status: 'final',
    })

    insertMessage(db, { id: 1, session_id: 'root', role: 'user', content: 'Start here', timestamp: 101 })
    insertMessage(db, { id: 2, session_id: 'root', role: 'assistant', content: 'Assistant reply', timestamp: 102 })
    insertMessage(db, { id: 3, session_id: 'root-cont', role: 'user', content: 'Continue with more detail', timestamp: 110 })
    insertMessage(db, { id: 4, session_id: 'root-cont', role: 'assistant', content: 'Continued answer', timestamp: 111 })
    db.close()

    const mod = await import('../../packages/server/src/db/hermes/conversations-db')
    const summaries = await mod.listConversationSummariesFromDb({ humanOnly: true })
    expect(summaries).toHaveLength(1)
    expect(summaries[0]).toEqual(expect.objectContaining({
      id: 'root',
      started_at: 100,
      thread_session_count: 2,
      branch_session_count: 0,
      ended_at: 111,
      cost_status: 'mixed',
      actual_cost_usd: 0.30000000000000004,
    }))

    const detailFromRoot = await mod.getConversationDetailFromDb('root', { humanOnly: true })
    expect(detailFromRoot?.session_id).toBe('root')
    expect(detailFromRoot?.thread_session_count).toBe(2)
    expect(detailFromRoot?.messages.map((message: any) => message.content)).toEqual([
      'Start here',
      'Assistant reply',
      'Continue with more detail',
      'Continued answer',
    ])
    expect(detailFromRoot?.branches ?? []).toEqual([])
  })

  it('keeps explicit tui compression continuations in the main conversation instead of the branch tree', async () => {
    ensureSqliteAvailable()
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(join(profileDirState.value, 'state.db'))
    createSchema(db)

    insertSession(db, {
      id: 'root-skill',
      parent_session_id: null,
      source: 'tui',
      model: 'openai/gpt-5.4',
      title: '更新合并指南 Skill',
      started_at: 100,
      ended_at: 200,
      end_reason: 'compression',
      message_count: 4,
      tool_call_count: 2,
      input_tokens: 10,
      output_tokens: 20,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })
    insertSession(db, {
      id: 'skill-2',
      parent_session_id: 'root-skill',
      source: 'tui',
      model: 'openai/gpt-5.4',
      title: '更新合并指南 Skill #2',
      started_at: 180,
      ended_at: 220,
      end_reason: 'tui_shutdown',
      message_count: 4,
      tool_call_count: 1,
      input_tokens: 8,
      output_tokens: 12,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })
    insertSession(db, {
      id: 'skill-3',
      parent_session_id: 'root-skill',
      source: 'tui',
      model: 'openai/gpt-5.4',
      title: '更新合并指南 Skill #3',
      started_at: 200.01,
      ended_at: null,
      end_reason: null,
      message_count: 3,
      tool_call_count: 1,
      input_tokens: 8,
      output_tokens: 12,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })

    insertMessage(db, { id: 1, session_id: 'root-skill', role: 'user', content: '我把指南更新了   你现在把合并指南skill 更新一下', timestamp: 101 })
    insertMessage(db, { id: 2, session_id: 'root-skill', role: 'assistant', content: '我先定位现有的合并指南 skill 和你更新后的指南来源，然后按 skill 安全规范做最小更新。', timestamp: 102 })
    insertMessage(db, { id: 3, session_id: 'root-skill', role: 'assistant', content: '开始更新 skill。', timestamp: 150 })

    insertMessage(db, { id: 4, session_id: 'skill-2', role: 'user', content: '我把指南更新了   你现在把合并指南skill 更新一下', timestamp: 181 })
    insertMessage(db, { id: 5, session_id: 'skill-2', role: 'assistant', content: '我先定位现有的合并指南 skill 和你更新后的指南来源，然后按 skill 安全规范做最小更新。', timestamp: 182 })
    insertMessage(db, { id: 6, session_id: 'skill-2', role: 'user', content: '[CONTEXT COMPACTION — REFERENCE ONLY] Earlier turns were compacted into the summary below.', timestamp: 183 })
    insertMessage(db, { id: 7, session_id: 'skill-2', role: 'assistant', content: '开始更新 skill：我会新增一个“从项目开发指南同步的合并约束”章节。', timestamp: 184 })

    insertMessage(db, { id: 8, session_id: 'skill-3', role: 'user', content: '我把指南更新了   你现在把合并指南skill 更新一下', timestamp: 200.02 })
    insertMessage(db, { id: 9, session_id: 'skill-3', role: 'assistant', content: '我先读取你上传的新版 SKILL.md 和现有 skill。', timestamp: 200.03 })
    insertMessage(db, { id: 10, session_id: 'skill-3', role: 'assistant', content: '我看到上传的新版 SKILL.md 不是简单覆盖版。', timestamp: 200.04 })
    db.close()

    const mod = await import('../../packages/server/src/db/hermes/conversations-db')
    const summaries = await mod.listConversationSummariesFromDb({ humanOnly: true })
    expect(summaries.map((summary: any) => summary.id)).toEqual(['root-skill'])
    expect(summaries[0]?.branch_session_count).toBe(0)

    const detail = await mod.getConversationDetailFromDb('root-skill', { humanOnly: true })
    expect(detail?.branches ?? []).toEqual([])
    expect(detail?.messages.map((message: any) => message.content)).toEqual([
      '我把指南更新了   你现在把合并指南skill 更新一下',
      '我先定位现有的合并指南 skill 和你更新后的指南来源，然后按 skill 安全规范做最小更新。',
      '开始更新 skill。',
      '我先定位现有的合并指南 skill 和你更新后的指南来源，然后按 skill 安全规范做最小更新。',
      '开始更新 skill：我会新增一个“从项目开发指南同步的合并约束”章节。',
      '我把指南更新了   你现在把合并指南skill 更新一下',
      '我先读取你上传的新版 SKILL.md 和现有 skill。',
      '我看到上传的新版 SKILL.md 不是简单覆盖版。',
    ])
  })

  it('keeps explicit tui handoff continuations out of the branch tree even when the parent ends as tui_shutdown', async () => {
    ensureSqliteAvailable()
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(join(profileDirState.value, 'state.db'))
    createSchema(db)

    insertSession(db, {
      id: 'stability-root',
      parent_session_id: null,
      source: 'tui',
      model: 'openai/gpt-5.4',
      title: 'WebUI稳定性打磨',
      started_at: 100,
      ended_at: 500,
      end_reason: 'tui_shutdown',
      message_count: 20,
      tool_call_count: 8,
      input_tokens: 100,
      output_tokens: 200,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })
    insertSession(db, {
      id: 'stability-cont',
      parent_session_id: 'stability-root',
      source: 'tui',
      model: 'openai/gpt-5.4',
      title: 'WebUI稳定性打磨 #2',
      started_at: 300,
      ended_at: null,
      end_reason: null,
      message_count: 10,
      tool_call_count: 4,
      input_tokens: 50,
      output_tokens: 80,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })

    insertMessage(db, { id: 1, session_id: 'stability-root', role: 'user', content: '小七 我终于把webui 修的比较好用了', timestamp: 101 })
    insertMessage(db, { id: 2, session_id: 'stability-root', role: 'assistant', content: '挺好，这一步很关键：先稳定、顺手，再谈“大厂级体验”。', timestamp: 102 })
    insertMessage(db, { id: 3, session_id: 'stability-root', role: 'user', content: '现在帮我查一下 daily-weather-clothing-advice webui-release-watcher', timestamp: 120 })
    insertMessage(db, { id: 4, session_id: 'stability-root', role: 'assistant', content: '我先按“三段链路”查：任务配置 → 调度执行记录 → 投递/会话日志。', timestamp: 130 })

    insertMessage(db, { id: 5, session_id: 'stability-cont', role: 'user', content: '小七 我终于把webui 修的比较好用了  虽然还是比不上大厂出的UI', timestamp: 301 })
    insertMessage(db, { id: 6, session_id: 'stability-cont', role: 'assistant', content: '挺好，这一步很关键：先稳定、顺手，再谈“大厂级体验”。', timestamp: 302 })
    insertMessage(db, { id: 7, session_id: 'stability-cont', role: 'user', content: '[CONTEXT COMPACTION — REFERENCE ONLY] Earlier turns were compacted into the summary below.', timestamp: 303 })
    insertMessage(db, { id: 8, session_id: 'stability-cont', role: 'user', content: '现在给我一个新流程的 5月13号的天气  通知到微信上', timestamp: 304 })
    insertMessage(db, { id: 9, session_id: 'stability-cont', role: 'assistant', content: '我按“新流程”跑一遍：先用脚本拿 Open‑Meteo 补充数据，再用高德作为主天气源整理。', timestamp: 305 })
    db.close()

    const mod = await import('../../packages/server/src/db/hermes/conversations-db')
    const summaries = await mod.listConversationSummariesFromDb({ humanOnly: true })
    expect(summaries.map((summary: any) => summary.id)).toEqual(['stability-root'])
    expect(summaries[0]?.branch_session_count).toBe(0)

    const detail = await mod.getConversationDetailFromDb('stability-root', { humanOnly: true })
    expect(detail?.branches ?? []).toEqual([])
    expect(detail?.messages.map((message: any) => message.content)).toEqual([
      '小七 我终于把webui 修的比较好用了',
      '挺好，这一步很关键：先稳定、顺手，再谈“大厂级体验”。',
      '现在帮我查一下 daily-weather-clothing-advice webui-release-watcher',
      '我先按“三段链路”查：任务配置 → 调度执行记录 → 投递/会话日志。',
      '小七 我终于把webui 修的比较好用了  虽然还是比不上大厂出的UI',
      '挺好，这一步很关键：先稳定、顺手，再谈“大厂级体验”。',
      '现在给我一个新流程的 5月13号的天气  通知到微信上',
      '我按“新流程”跑一遍：先用脚本拿 Open‑Meteo 补充数据，再用高德作为主天气源整理。',
    ])
  })

  it('drops compaction handoff notes and only removes the exact duplicated root-opening user message', async () => {
    ensureSqliteAvailable()
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(join(profileDirState.value, 'state.db'))
    createSchema(db)

    insertSession(db, {
      id: 'root-clean',
      parent_session_id: null,
      source: 'tui',
      model: 'openai/gpt-5.4',
      title: 'Adding engineering code standard skill',
      started_at: 100,
      ended_at: 200,
      end_reason: 'compression',
      message_count: 5,
      tool_call_count: 1,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })
    insertSession(db, {
      id: 'cont-clean',
      parent_session_id: 'root-clean',
      source: 'tui',
      model: 'openai/gpt-5.4',
      title: 'Adding engineering code standard skill #2',
      started_at: 200.01,
      ended_at: null,
      end_reason: null,
      message_count: 5,
      tool_call_count: 1,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })

    insertMessage(db, { id: 1, session_id: 'root-clean', role: 'user', content: '添加一个skill 以后只要涉及写代码就要加载这个skill', timestamp: 101 })
    insertMessage(db, { id: 2, session_id: 'root-clean', role: 'assistant', content: 'root assistant', timestamp: 102 })
    insertMessage(db, { id: 3, session_id: 'cont-clean', role: 'user', content: '添加一个skill 以后只要涉及写代码就要加载这个skill', timestamp: 201 })
    insertMessage(db, { id: 4, session_id: 'cont-clean', role: 'assistant', content: '[CONTEXT COMPACTION — REFERENCE ONLY] Earlier turns were compacted into the summary below.', timestamp: 202 })
    insertMessage(db, { id: 5, session_id: 'cont-clean', role: 'user', content: '增加一条记忆规则 以后创建skill 或者安装skill 时 一定要做场景匹配', timestamp: 203 })
    insertMessage(db, { id: 6, session_id: 'cont-clean', role: 'assistant', content: 'new assistant answer', timestamp: 204 })
    db.close()

    const mod = await import('../../packages/server/src/db/hermes/conversations-db')
    const detail = await mod.getConversationDetailFromDb('root-clean', { humanOnly: true })
    expect(detail?.messages.map((message: any) => message.content)).toEqual([
      '添加一个skill 以后只要涉及写代码就要加载这个skill',
      'root assistant',
      '增加一条记忆规则 以后创建skill 或者安装skill 时 一定要做场景匹配',
      'new assistant answer',
    ])
  })

  it('aggregates an orphan continuation without showing it as a separate conversation', async () => {
    ensureSqliteAvailable()
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(join(profileDirState.value, 'state.db'))
    createSchema(db)

    insertSession(db, {
      id: 'root',
      parent_session_id: null,
      source: 'cli',
      model: 'openai/gpt-5.4',
      title: 'Root',
      started_at: 100,
      ended_at: 110,
      end_reason: 'compression',
      message_count: 1,
      tool_call_count: 0,
      input_tokens: 5,
      output_tokens: 8,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })
    insertSession(db, {
      id: 'orphan-cont',
      parent_session_id: null,
      source: 'cli',
      model: 'openai/gpt-5.4',
      title: 'Continuation',
      started_at: 111,
      ended_at: null,
      end_reason: null,
      message_count: 1,
      tool_call_count: 0,
      input_tokens: 3,
      output_tokens: 4,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })

    insertMessage(db, { id: 11, session_id: 'root', role: 'user', content: 'Start here', timestamp: 101 })
    insertMessage(db, { id: 12, session_id: 'orphan-cont', role: 'assistant', content: 'Continued answer', timestamp: 112 })
    db.close()

    const mod = await import('../../packages/server/src/db/hermes/conversations-db')
    const summaries = await mod.listConversationSummariesFromDb({ humanOnly: true })
    expect(summaries.map((summary: any) => summary.id)).toEqual(['root'])
    expect(summaries[0]).toMatchObject({
      started_at: 100,
      thread_session_count: 2,
      branch_session_count: 0,
      input_tokens: 3,
      output_tokens: 4,
    })

    const detail = await mod.getConversationDetailFromDb('root', { humanOnly: true })
    expect(detail?.messages.map((message: any) => message.session_id)).toEqual(['root', 'orphan-cont'])
    expect(detail?.branches ?? []).toEqual([])
  })

  it('aggregates a delayed orphan continuation when the visible content is duplicated', async () => {
    ensureSqliteAvailable()
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(join(profileDirState.value, 'state.db'))
    createSchema(db)

    insertSession(db, {
      id: 'root',
      parent_session_id: null,
      source: 'cli',
      model: 'openai/gpt-5.4',
      title: 'Duplicated chat',
      started_at: 100,
      ended_at: 110,
      end_reason: 'compression',
      message_count: 1,
      tool_call_count: 0,
      input_tokens: 5,
      output_tokens: 8,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })
    insertSession(db, {
      id: 'duplicate-cont',
      parent_session_id: null,
      source: 'cli',
      model: 'openai/gpt-5.4',
      title: 'Duplicated chat',
      started_at: 200,
      ended_at: 201,
      end_reason: null,
      message_count: 1,
      tool_call_count: 0,
      input_tokens: 3,
      output_tokens: 4,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })

    insertMessage(db, { id: 21, session_id: 'root', role: 'user', content: 'same visible conversation', timestamp: 101 })
    insertMessage(db, { id: 22, session_id: 'duplicate-cont', role: 'user', content: 'same visible conversation', timestamp: 200 })
    db.close()

    const mod = await import('../../packages/server/src/db/hermes/conversations-db')
    const summaries = await mod.listConversationSummariesFromDb({ humanOnly: true })
    expect(summaries.map((summary: any) => summary.id)).toEqual(['root'])
    expect(summaries[0]).toMatchObject({
      started_at: 100,
      thread_session_count: 2,
      branch_session_count: 0,
    })

    const detail = await mod.getConversationDetailFromDb('root', { humanOnly: true })
    expect(detail?.messages.map((message: any) => message.session_id)).toEqual(['root', 'duplicate-cont'])
    expect(detail?.branches ?? []).toEqual([])
  })

  it('folds bridge context prompt duplicates into compressed TUI conversation branches', async () => {
    ensureSqliteAvailable()
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(join(profileDirState.value, 'state.db'))
    createSchema(db)

    insertSession(db, {
      id: 'root',
      parent_session_id: null,
      source: 'tui',
      model: 'openai/gpt-5.4',
      title: null,
      started_at: 100,
      ended_at: 200,
      end_reason: 'compression',
      message_count: 1,
      tool_call_count: 0,
      input_tokens: 1,
      output_tokens: 2,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })
    insertSession(db, {
      id: 'tip',
      parent_session_id: 'root',
      source: 'tui',
      model: 'openai/gpt-5.4',
      title: null,
      started_at: 200.1,
      ended_at: null,
      end_reason: null,
      message_count: 1,
      tool_call_count: 0,
      input_tokens: 3,
      output_tokens: 4,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })
    insertSession(db, {
      id: 'bridge-duplicate',
      parent_session_id: null,
      source: 'tui',
      model: 'openai/gpt-5.4',
      title: null,
      started_at: 260,
      ended_at: null,
      end_reason: null,
      message_count: 1,
      tool_call_count: 0,
      input_tokens: 5,
      output_tokens: 6,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })

    insertMessage(db, { id: 31, session_id: 'root', role: 'user', content: 'before compression', timestamp: 101 })
    insertMessage(db, { id: 32, session_id: 'tip', role: 'user', content: 'after compression', timestamp: 201 })
    insertMessage(db, {
      id: 33,
      session_id: 'bridge-duplicate',
      role: 'user',
      content: 'Previous conversation context:\nassistant: after compression\n\nCurrent user message:\ncontinue',
      timestamp: 261,
    })
    db.close()

    const mod = await import('../../packages/server/src/db/hermes/conversations-db')
    const summaries = await mod.listConversationSummariesFromDb({ humanOnly: true })
    expect(summaries.map((summary: any) => summary.id)).toEqual(['root'])
    expect(summaries[0]).toMatchObject({
      thread_session_count: 2,
      branch_session_count: 0,
      input_tokens: 3,
      output_tokens: 4,
    })

    const detail = await mod.getConversationDetailFromDb('root', { humanOnly: true })
    expect(detail?.messages.map((message: any) => message.session_id)).toEqual(['root', 'tip', 'bridge-duplicate'])
    expect(detail?.branches ?? []).toEqual([])
  })

  it('folds parentless bridge context sessions into existing branch placeholders', async () => {
    ensureSqliteAvailable()
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(join(profileDirState.value, 'state.db'))
    createSchema(db)

    insertSession(db, {
      id: 'root',
      parent_session_id: null,
      source: 'tui',
      model: 'openai/gpt-5.4',
      title: null,
      started_at: 100,
      ended_at: null,
      end_reason: null,
      message_count: 1,
      tool_call_count: 0,
      input_tokens: 1,
      output_tokens: 2,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })
    insertSession(db, {
      id: 'branch-placeholder',
      parent_session_id: 'root',
      source: 'tui',
      model: 'openai/gpt-5.4',
      title: null,
      started_at: 200,
      ended_at: null,
      end_reason: null,
      message_count: 1,
      tool_call_count: 0,
      input_tokens: 3,
      output_tokens: 4,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })
    insertSession(db, {
      id: 'context-continuation',
      parent_session_id: null,
      source: 'tui',
      model: 'openai/gpt-5.4',
      title: null,
      started_at: 260,
      ended_at: null,
      end_reason: null,
      message_count: 1,
      tool_call_count: 0,
      input_tokens: 5,
      output_tokens: 6,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })

    insertMessage(db, { id: 41, session_id: 'root', role: 'user', content: 'root request', timestamp: 101 })
    insertMessage(db, { id: 42, session_id: 'branch-placeholder', role: 'assistant', content: 'branch work before compaction', timestamp: 201 })
    insertMessage(db, {
      id: 43,
      session_id: 'context-continuation',
      role: 'user',
      content: 'Previous conversation context:\nassistant: branch work before compaction\n\nCurrent user message:\ncontinue branch',
      timestamp: 261,
    })
    db.close()

    const mod = await import('../../packages/server/src/db/hermes/conversations-db')
    const summaries = await mod.listConversationSummariesFromDb({ humanOnly: true })
    expect(summaries.map((summary: any) => summary.id)).toEqual(['root'])

    const rootDetail = await mod.getConversationDetailFromDb('root', { humanOnly: true })
    expect(rootDetail?.messages.map((message: any) => message.content)).toEqual([
      'root request',
      'continue branch',
    ])
    expect(rootDetail?.branches?.map((branch: any) => branch.session_id)).toEqual(['branch-placeholder'])
  })

  it('folds branched children back into the root conversation', async () => {
    ensureSqliteAvailable()
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(join(profileDirState.value, 'state.db'))
    createSchema(db)

    insertSession(db, {
      id: 'root',
      parent_session_id: null,
      source: 'cli',
      model: 'openai/gpt-5.4',
      title: 'Root',
      started_at: 100,
      ended_at: 200,
      end_reason: 'branched',
      message_count: 1,
      tool_call_count: 0,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })
    insertSession(db, {
      id: 'branch-child',
      parent_session_id: 'root',
      source: 'cli',
      model: 'openai/gpt-5.4',
      title: 'Branch child',
      started_at: 201,
      ended_at: 210,
      end_reason: null,
      message_count: 2,
      tool_call_count: 0,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })

    insertMessage(db, { id: 1, session_id: 'root', role: 'user', content: 'Root prompt', timestamp: 101 })
    insertMessage(db, { id: 2, session_id: 'branch-child', role: 'user', content: 'Branch prompt', timestamp: 202 })
    insertMessage(db, { id: 3, session_id: 'branch-child', role: 'assistant', content: 'Branch answer', timestamp: 203 })
    db.close()

    const mod = await import('../../packages/server/src/db/hermes/conversations-db')
    const summaries = await mod.listConversationSummariesFromDb({ humanOnly: true })
    expect(summaries.map((summary: any) => summary.id)).toEqual(['root'])

    const detail = await mod.getConversationDetailFromDb('root', { humanOnly: true })
    expect(detail?.messages.map((message: any) => message.content)).toEqual(['Root prompt', 'Branch prompt', 'Branch answer'])
    expect(detail?.branches ?? []).toEqual([])
  })

  it('does not expose active child tui branches as top-level conversations', async () => {
    ensureSqliteAvailable()
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(join(profileDirState.value, 'state.db'))
    createSchema(db)

    insertSession(db, {
      id: 'root',
      parent_session_id: null,
      source: 'tui',
      model: 'gpt-5.5',
      title: 'Root',
      started_at: 100,
      ended_at: null,
      end_reason: null,
      message_count: 2,
      tool_call_count: 1,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })
    insertSession(db, {
      id: 'child',
      parent_session_id: 'root',
      source: 'tui',
      model: 'gpt-5.5',
      title: 'Child branch',
      started_at: 101,
      ended_at: null,
      end_reason: null,
      message_count: 2,
      tool_call_count: 1,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })
    insertMessage(db, { id: 1, session_id: 'root', role: 'user', content: 'Root prompt', timestamp: 100 })
    insertMessage(db, { id: 2, session_id: 'root', role: 'assistant', content: 'Root answer', timestamp: 100.5 })
    insertMessage(db, { id: 3, session_id: 'child', role: 'user', content: 'Child prompt', timestamp: 101 })
    insertMessage(db, { id: 4, session_id: 'child', role: 'assistant', content: 'Child answer', timestamp: 101.5 })
    db.close()

    const mod = await import('../../packages/server/src/db/hermes/conversations-db')
    const summaries = await mod.listConversationSummariesFromDb({ humanOnly: true })

    expect(summaries.map((summary: any) => summary.id)).toEqual(['root'])
  })

  it('folds non-branch child sessions into their parent conversation', async () => {
    ensureSqliteAvailable()
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(join(profileDirState.value, 'state.db'))
    createSchema(db)

    insertSession(db, {
      id: 'parent',
      parent_session_id: null,
      source: 'cli',
      model: 'openai/gpt-5.4',
      title: 'Parent',
      started_at: 100,
      ended_at: 150,
      end_reason: null,
      message_count: 1,
      tool_call_count: 0,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })
    insertSession(db, {
      id: 'review-child',
      parent_session_id: 'parent',
      source: 'cli',
      model: 'openai/gpt-5.4',
      title: 'Independent review',
      started_at: 300,
      ended_at: 320,
      end_reason: null,
      message_count: 2,
      tool_call_count: 0,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })

    insertMessage(db, { id: 1, session_id: 'parent', role: 'user', content: 'Parent prompt', timestamp: 101 })
    insertMessage(db, { id: 2, session_id: 'review-child', role: 'user', content: 'Review prompt', timestamp: 301 })
    insertMessage(db, { id: 3, session_id: 'review-child', role: 'assistant', content: 'Review answer', timestamp: 302 })
    db.close()

    const mod = await import('../../packages/server/src/db/hermes/conversations-db')
    const summaries = await mod.listConversationSummariesFromDb({ humanOnly: true })
    expect(summaries.map((summary: any) => summary.id)).toEqual(['parent'])

    const detail = await mod.getConversationDetailFromDb('parent', { humanOnly: true })
    expect(detail?.messages.map((message: any) => message.content)).toEqual(['Parent prompt', 'Review prompt', 'Review answer'])
    expect(detail?.branches ?? []).toEqual([])
  })

  it('excludes synthetic-only roots from human-only summaries and details', async () => {
    ensureSqliteAvailable()
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(join(profileDirState.value, 'state.db'))
    createSchema(db)

    insertSession(db, {
      id: 'synthetic-root',
      parent_session_id: null,
      source: 'cli',
      model: 'openai/gpt-5.4',
      title: null,
      started_at: 100,
      ended_at: 101,
      end_reason: null,
      message_count: 1,
      tool_call_count: 0,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })
    insertMessage(db, {
      id: 1,
      session_id: 'synthetic-root',
      role: 'user',
      content: "You've reached the maximum number of tool-calling iterations allowed.",
      timestamp: 100,
    })
    db.close()

    const mod = await import('../../packages/server/src/db/hermes/conversations-db')
    const summaries = await mod.listConversationSummariesFromDb({ humanOnly: true })
    const detail = await mod.getConversationDetailFromDb('synthetic-root', { humanOnly: true })

    expect(summaries).toEqual([])
    expect(detail).toBeNull()
  })

  it('keeps tool-only conversations visible in human-only mode', async () => {
    ensureSqliteAvailable()
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(join(profileDirState.value, 'state.db'))
    createSchema(db)

    insertSession(db, {
      id: 'tool-only-root',
      parent_session_id: null,
      source: 'tui',
      model: 'openai/gpt-5.4',
      title: null,
      started_at: 100,
      ended_at: 101,
      end_reason: null,
      message_count: 1,
      tool_call_count: 1,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })
    insertMessage(db, {
      id: 1,
      session_id: 'tool-only-root',
      role: 'tool',
      content: '{"output":"ok"}',
      tool_call_id: 'call-1',
      tool_calls: null,
      tool_name: 'terminal',
      timestamp: 100,
    })
    db.close()

    const mod = await import('../../packages/server/src/db/hermes/conversations-db')
    const summaries = await mod.listConversationSummariesFromDb({ humanOnly: true })
    const detail = await mod.getConversationDetailFromDb('tool-only-root', { humanOnly: true })

    expect(summaries).toHaveLength(1)
    expect(summaries[0]).toMatchObject({
      id: 'tool-only-root',
      source: 'tui',
      tool_call_count: 1,
    })
    expect(detail).not.toBeNull()
    expect(detail?.session_id).toBe('tool-only-root')
  })

  it('returns an empty detail payload for non-human-only sessions with no visible messages', async () => {
    ensureSqliteAvailable()
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(join(profileDirState.value, 'state.db'))
    createSchema(db)

    insertSession(db, {
      id: 'assistant-empty',
      parent_session_id: null,
      source: 'cli',
      model: 'openai/gpt-5.4',
      title: 'Empty detail',
      started_at: 200,
      ended_at: null,
      end_reason: null,
      message_count: 0,
      tool_call_count: 0,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })
    db.close()

    const mod = await import('../../packages/server/src/db/hermes/conversations-db')
    const detail = await mod.getConversationDetailFromDb('assistant-empty', { humanOnly: false })

    expect(detail).toEqual({
      session_id: 'assistant-empty',
      messages: [],
      visible_count: 0,
      thread_session_count: 1,
    })
  })

  it('folds root-level continuation prompt tui sessions back into the previous real root', async () => {
    ensureSqliteAvailable()
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(join(profileDirState.value, 'state.db'))
    createSchema(db)

    insertSession(db, {
      id: 'real-root',
      parent_session_id: null,
      source: 'tui',
      model: 'openai/gpt-5.4',
      title: 'Subagent Deduplication Failure Analysis',
      started_at: 100,
      ended_at: 150,
      end_reason: 'tui_shutdown',
      message_count: 4,
      tool_call_count: 2,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })
    insertSession(db, {
      id: 'continuation-root',
      parent_session_id: null,
      source: 'tui',
      model: 'openai/gpt-5.4',
      title: 'Subagent Deduplication Failure Analysis',
      started_at: 151,
      ended_at: null,
      end_reason: null,
      message_count: 3,
      tool_call_count: 1,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })

    insertMessage(db, { id: 1, session_id: 'real-root', role: 'assistant', content: '让我看最近一次合并提交改了哪些关键文件。', timestamp: 101 })
    insertMessage(db, {
      id: 2,
      session_id: 'continuation-root',
      role: 'user',
      content: 'Previous conversation context:\nassistant: 让我看最近一次合并提交改了哪些关键文件。\n\nCurrent user message:\n继续',
      timestamp: 151,
    })
    insertMessage(db, { id: 3, session_id: 'continuation-root', role: 'assistant', content: '继续排查。', timestamp: 152 })
    db.close()

    const mod = await import('../../packages/server/src/db/hermes/conversations-db')
    const summaries = await mod.listConversationSummariesFromDb({ humanOnly: true })
    expect(summaries.map((summary: any) => summary.id)).toEqual(['real-root'])

    const detail = await mod.getConversationDetailFromDb('real-root', { humanOnly: true })
    expect(detail?.messages.map((message: any) => message.content)).toEqual([
      '让我看最近一次合并提交改了哪些关键文件。',
      '继续',
      '继续排查。',
    ])
  })

  it('folds root-level continuation prompt tui sessions back into the previous real root even when title matching alone is insufficient', async () => {
    ensureSqliteAvailable()
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(join(profileDirState.value, 'state.db'))
    createSchema(db)

    insertSession(db, {
      id: 'anchor-root',
      parent_session_id: null,
      source: 'tui',
      model: 'openai/gpt-5.4',
      title: 'Subagent Deduplication Failure Analysis',
      started_at: 100,
      ended_at: 150,
      end_reason: 'tui_shutdown',
      message_count: 4,
      tool_call_count: 2,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })
    insertSession(db, {
      id: 'anchor-continuation-root',
      parent_session_id: null,
      source: 'tui',
      model: 'openai/gpt-5.4',
      title: '继续排查',
      started_at: 151,
      ended_at: null,
      end_reason: null,
      message_count: 3,
      tool_call_count: 1,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })

    insertMessage(db, { id: 1, session_id: 'anchor-root', role: 'assistant', content: '子 agent 找到了关键线索。根因最可能是 parent_session_id 不匹配。', timestamp: 101 })
    insertMessage(db, {
      id: 2,
      session_id: 'anchor-continuation-root',
      role: 'user',
      content: 'Previous conversation context:\nassistant: 子 agent 找到了关键线索。根因最可能是 parent_session_id 不匹配。\n\nCurrent user message:\n继续',
      timestamp: 151,
    })
    insertMessage(db, { id: 3, session_id: 'anchor-continuation-root', role: 'assistant', content: '继续排查。', timestamp: 152 })
    db.close()

    const mod = await import('../../packages/server/src/db/hermes/conversations-db')
    const summaries = await mod.listConversationSummariesFromDb({ humanOnly: true })
    expect(summaries.map((summary: any) => summary.id)).toEqual(['anchor-root'])

    const detail = await mod.getConversationDetailFromDb('anchor-root', { humanOnly: true })
    expect(detail?.messages.map((message: any) => message.content)).toEqual([
      '子 agent 找到了关键线索。根因最可能是 parent_session_id 不匹配。',
      '继续',
      '继续排查。',
    ])
  })

  it('hides empty tui stub sessions from human-only summaries and details', async () => {
    ensureSqliteAvailable()
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(join(profileDirState.value, 'state.db'))
    createSchema(db)

    insertSession(db, {
      id: 'empty-tui-stub',
      parent_session_id: null,
      source: 'tui',
      model: 'openai/gpt-5.4',
      title: null,
      started_at: 100,
      ended_at: null,
      end_reason: null,
      message_count: 0,
      tool_call_count: 0,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      billing_provider: 'openai',
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
      cost_status: 'estimated',
    })
    db.close()

    const mod = await import('../../packages/server/src/db/hermes/conversations-db')
    const summaries = await mod.listConversationSummariesFromDb({ humanOnly: true })
    expect(summaries).toEqual([])

    const detail = await mod.getConversationDetailFromDb('empty-tui-stub', { humanOnly: true })
    expect(detail).toBeNull()
  })
})
