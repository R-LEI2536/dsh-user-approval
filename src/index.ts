/**
 * approval-modes — 自定义审批模式插件（request / auto-edit / yolo / off）。
 *
 * 本插件位于自有空间，不进入官方 packages/。它在
 * `tools/pre-execute` waterfall 上按工具族裁决每个工具调用：需要审批时返回
 * `{ kind: 'ask' }`，由既有审批链（ctx.approval → web 审批弹窗）处理。
 *
 * 四个模式：
 * - `request`  编辑族 + shell 族 + 未分类工具都要审批；只读工具免审。
 * - `auto-edit` 编辑族免审；shell 族 + 未分类工具要审批；只读工具免审。
 * - `yolo`     全部放行（不发起审批），sandbox 联动到配置默认（workspace-write）。
 * - `off`      关闭模式系统，恢复官方原版行为（闸不拦截任何调用）。
 *
 * 切换模式（`/approval-mode <mode>`）时联动写入 `sandbox/mode`：
 * request/auto-edit/yolo → 配置默认（默认 workspace-write）；off → 组合默认。
 * 三个旋钮（approval/mode、sandbox/mode、approval/policy）互相独立、last-write-wins。
 *
 * @module dsh-user-approval
 */

import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { effectiveSandboxMode, setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'
import type { SandboxMode } from '@deepseek-ai/dsh-sandbox'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-tools'
import type { CommandInvocation } from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-session-projection'

/** In-memory storage for session approval modes (process-local, not persisted). */
const sessionModes = new WeakMap<Session, ApprovalMode>()
export const name = 'approval-modes'

/** 审批模式闭值。`ask` 留给 approval policy，这里不用。 */
export type ApprovalMode = 'request' | 'auto-edit' | 'yolo' | 'off'
/** 每个可切换的 ApprovalMode，用于校验与广告。 */
export const APPROVAL_MODES: readonly ApprovalMode[] = ['request', 'auto-edit', 'yolo', 'off']

/** 工具族分类：编辑、shell、只读、未分类。 */
type ToolFamily = 'edit' | 'shell' | 'readonly' | 'other'

/** 插件配置。全部带默认值，部署方可在 cordis.yml 覆盖。 */
export interface Config {
  /** 新会话的默认模式；`approval/mode` 事件缺席时即此值。默认 `off`。 */
  default?: ApprovalMode
  /** 编辑族工具名（默认 write/edit/str_replace_editor）。 */
  editTools?: string[]
  /** shell 族工具名（默认 bash/pwsh 及原始变体）。 */
  shellTools?: string[]
  /** 只读工具名（默认 read/glob/grep/read_image/list_dir）；任何模式下免审。 */
  readOnlyTools?: string[]
  /** 永远免审的控制工具（默认 ask_user_question/exit_plan_mode）。 */
  autoAllowTools?: string[]
  /** 未分类工具的策略：`ask`（默认，fail-safe）或 `allow`。 */
  unclassified?: 'ask' | 'allow'
  /** 切到各模式时联动写入的 sandbox 默认；`off` 写组合默认。 */
  sandboxDefaults?: Partial<Record<'request' | 'auto-edit' | 'yolo', 'read-only' | 'workspace-write' | 'danger-full-access'>>
  /** 审批 ask 的 reason 模板，支持 {tool}/{mode}/{family} 插值。 */
  askReason?: string
}

export const Config: Schema<Config> = Schema.object({
  default: Schema.union([...APPROVAL_MODES] as ApprovalMode[]).default('off'),
  editTools: Schema.array(Schema.string()).default(['write', 'edit', 'str_replace_editor']),
  shellTools: Schema.array(Schema.string()).default(['bash', 'pwsh', 'tool:bash', 'tool:pwsh']),
  readOnlyTools: Schema.array(Schema.string()).default(['read', 'glob', 'grep', 'read_image', 'list_dir']),
  autoAllowTools: Schema.array(Schema.string()).default(['ask_user_question', 'exit_plan_mode']),
  unclassified: Schema.union(['ask', 'allow'] as ('ask' | 'allow')[]).default('ask'),
  sandboxDefaults: Schema.dict(Schema.union(['read-only', 'workspace-write', 'danger-full-access'] as ('read-only' | 'workspace-write' | 'danger-full-access')[])).default({
    request: 'workspace-write',
    'auto-edit': 'workspace-write',
    yolo: 'workspace-write',
  }),
  askReason: Schema.string().default(
    'approval needed for {tool} under {mode} mode ({family}); read-only browsing should use read/glob/list_dir instead of shell',
  ),
})

/**
 * Get the approval mode for a session from in-memory storage.
 * @param session - The session to query.
 * @param defaultMode - The default mode to return if not set.
 * @returns The session's mode, or defaultMode if not set.
 */
export function getApprovalMode(session: Session, defaultMode: ApprovalMode): ApprovalMode {
  return sessionModes.get(session) ?? defaultMode
}

/**
 * Set the approval mode for a session in in-memory storage.
 * @param session - The session to update.
 * @param mode - The mode to set.
 */
export function setApprovalMode(session: Session, mode: ApprovalMode): void {
  sessionModes.set(session, mode)
}

export function apply(ctx: Context, config: Config): void {
  const cfg = {
    default: config.default ?? 'off',
    editTools: config.editTools ?? ['write', 'edit', 'str_replace_editor'],
    shellTools: config.shellTools ?? ['bash', 'pwsh', 'tool:bash', 'tool:pwsh'],
    readOnlyTools: config.readOnlyTools ?? ['read', 'glob', 'grep', 'read_image', 'list_dir'],
    autoAllowTools: config.autoAllowTools ?? ['ask_user_question', 'exit_plan_mode'],
    unclassified: config.unclassified ?? 'ask',
    sandboxDefaults: config.sandboxDefaults ?? { request: 'workspace-write', 'auto-edit': 'workspace-write', yolo: 'workspace-write' },
    askReason: config.askReason ?? 'approval needed for {tool} under {mode} mode ({family}); read-only browsing should use read/glob/list_dir instead of shell',
  }

  // 组合默认 sandbox：无 session 覆盖时沙箱旋钮应落回的值（off 联动写回它）。
  const sandboxPolicy = ctx.get('sandboxPolicy') as { defaultMode?: string } | undefined
  const shell = ctx.get('shell') as { sandboxMode?: string } | undefined
  const compositionDefaultSandbox = sandboxPolicy?.defaultMode ?? shell?.sandboxMode ?? 'workspace-write'

  // 可变默认：settings 层更新会替换它（同 permission-presets 的 defaultSettings）。
  // setSource 收到的是「读取函数」（() => scope.get()），所以这里保存 thunk、读取时再调用。
  let defaultSettings: () => { default: ApprovalMode } = () => ({ default: cfg.default })

  const effectiveMode = (session: Session): ApprovalMode => getApprovalMode(session, defaultSettings().default)

  const familyOf = (toolName: string): ToolFamily => {
    if (cfg.editTools.includes(toolName)) return 'edit'
    if (cfg.shellTools.includes(toolName)) return 'shell'
    if (cfg.readOnlyTools.includes(toolName)) return 'readonly'
    return 'other'
  }

  const needsAsk = (mode: ApprovalMode, family: ToolFamily): boolean => {
    if (mode === 'request') return family === 'edit' || family === 'shell' || (family === 'other' && cfg.unclassified === 'ask')
    if (mode === 'auto-edit') return family === 'shell' || (family === 'other' && cfg.unclassified === 'ask')
    return false // off / yolo：全放行
  }

  // ── 闸：每个工具调用分发前裁决 ─────────────────────────────────────────
  // 先 next() 取下游裁决再决定：下游 deny/ask 保持，只有下游 allow 且本模式
  // 要求弹时才升级为 ask；off/yolo 原样放行（= 官方原版）。
  ctx.on('tools/pre-execute', async (exec, next) => {
    const decision = await next()
    if (decision.kind !== 'allow') return decision
    const agent = exec.agent
    if (agent === undefined) return decision
    if (cfg.autoAllowTools.includes(exec.name)) return decision
    const mode = effectiveMode(agent.session)
    const family = familyOf(exec.name)
    if (family === 'readonly') return decision
    if (!needsAsk(mode, family)) return decision
    return {
      kind: 'ask',
      reason: cfg.askReason
        .replace('{tool}', exec.name)
        .replace('{mode}', mode)
        .replace('{family}', family),
    }
  })

  // ── 切换：写 mode + 联动写 sandbox ───────────────────────────────────────
  const applyMode = (session: Session, mode: ApprovalMode): { previous: ApprovalMode; sandboxChanged: boolean } => {
    const previous = effectiveMode(session)
    setApprovalMode(session, mode)
    const sandbox = mode === 'off'
      ? compositionDefaultSandbox
      : (cfg.sandboxDefaults[mode as 'request' | 'auto-edit' | 'yolo'] ?? 'workspace-write')
    const sandboxChanged = effectiveSandboxMode(session.events) !== sandbox
    if (sandboxChanged) setSandboxMode(session, sandbox as SandboxMode)
    return { previous, sandboxChanged }
  }

  ctx.inject(['commands'], (commandCtx) => {
    commandCtx.commands.register({
      name: 'approval-mode',
      description: 'Switch the approval mode (request | auto-edit | yolo | off)',
      input: { hint: '<mode>' },
      handler: (invocation: CommandInvocation) => {
        const { agent, rawInput } = invocation
        const trimmed = rawInput.trim()
        if (trimmed === '') {
          return { kind: 'success', text: `current approval mode: ${effectiveMode(agent.session)} (available: ${APPROVAL_MODES.join(', ')})` }
        }
        const mode = trimmed as ApprovalMode
        if (!APPROVAL_MODES.includes(mode)) {
          return { kind: 'error', text: `unknown approval mode "${mode}" (available: ${APPROVAL_MODES.join(', ')})` }
        }
        applyMode(agent.session, mode)
        return { kind: 'success', text: `approval mode switched to ${mode}` }
      }
    })
  })

  // ── settings：新会话默认模式（`approvalMode` 命名空间） ─────────────────
  const settingsSchema: Schema<{ default: ApprovalMode }> = Schema.object({
    default: Schema.union([...APPROVAL_MODES] as const).required(),
  })
  installSettingsSection(ctx, settingsNamespace('approval-mode'), settingsSchema, { default: cfg.default }, {
    setSource: (current) => { defaultSettings = current },
    onChange: () => {},
  })

  // ── pin：新会话初始化默认模式（缺席时 get 即配置默认，语义等价） ────
  const pin = (session: Session): void => {
    if (!sessionModes.has(session)) setApprovalMode(session, defaultSettings().default)
  }
  ctx.on('session/created', (session) => { pin(session) })
  const sessions = ctx.get('sessions') as { list(): Session[] } | undefined
  for (const session of sessions?.list() ?? []) pin(session)

  // ── 投影：为客户端 UI 留路（芯片/快捷键后续再做） ─────────────────────
  ctx.inject(['sessionProjections'], (projectionCtx) => {
    // 投影注册表运行时只调用 schema.parse 验证 view 输出（session-projection
    // index.ts 的 ProjectionDefinition.schema 就是 `{ parse }` 结构）；view 输出
    // 是平凡 JSON，这里用鸭子类型替代 zod（scratch 插件无法解析裸 zod 包）。
    const schema = { parse: (value: unknown): unknown => value }
    projectionCtx.sessionProjections.register({
      key: 'approvalMode',
      schema,
      init: () => ({ mode: null as string | null }),
      apply: (state: { mode: string | null }, _event: SessionEvent) => {
        // No longer tracking approval/mode events; state remains unchanged
        return state
      },
      view: (state: { mode: string | null }) => ({ mode: state.mode ?? defaultSettings().default, options: [...APPROVAL_MODES] }),
      stateVersion: 1,
    } as never)
  })
}
