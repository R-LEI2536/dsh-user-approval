# 插件自定义事件类型的兼容性问题

**日期**: 2026-08-20  
**问题**: 旧版本 DSH 无法加载包含插件自定义事件类型的会话日志  
**影响**: 用户遇到 `SessionFormatUnsupportedError` 错误，无法继续历史会话  
**最终方案**: 使用内存方案（WeakMap），避免兼容性问题

---

## 问题现象（已解决）

**已弃用的事件驱动方案**会导致以下问题：

当用户在 DSH 中使用了 `dsh-user-approval` 插件并切换审批模式后，尝试重启 DSH 时，出现以下错误：

```
SessionFormatUnsupportedError: session "session-xxx" contains event type "approval/mode" (seq N) unknown to this harness and not marked ignorable; refusing to interpret the log — it was likely written by a newer harness
```

**当前内存方案的行为**：
- ✅ 会话可以正常加载（无兼容性问题）
- ✅ 审批模式在当前会话期间有效
- ⚠️ DSH 重启后审批模式恢复为默认值

---

## 最终解决方案：内存方案

### 实现代码

```typescript
// 使用 WeakMap 存储审批模式
const sessionModes = new WeakMap<Session, ApprovalMode>()

export function getApprovalMode(session: Session, defaultMode: ApprovalMode): ApprovalMode {
  return sessionModes.get(session) ?? defaultMode
}

export function setApprovalMode(session: Session, mode: ApprovalMode): void {
  sessionModes.set(session, mode)
}
```

### 客户端实现

```typescript
// UI 组件自己管理状态
export function ApprovalModeChip({ switchMode, getDefaultMode, t }: Props) {
  const [currentMode, setCurrentMode] = useState<ApprovalMode>('off')
  
  const handleSelect = async (mode: string) => {
    const error = await switchMode(mode)
    if (error === null) {
      setCurrentMode(mode)  // UI 立即更新
    }
  }
  
  return <div>Current Mode: {currentMode}</div>
}
```

### 优势

- ✅ 会话可以正常加载（无兼容性问题）
- ✅ UI 显示正确（自管理状态）
- ✅ 实现简单，符合用户需求
- ✅ 当前会话期间审批模式有效

### 限制

- ⚠️ DSH 重启后审批模式恢复为默认值
- ⚠️ 客户端刷新后审批模式恢复为默认值

---

## 历史分析

### ❌ 方案 1：事件驱动（已弃用）

**问题**：
- 自定义事件类型 `approval/mode` 不在 DSH 的 `KNOWN_SESSION_EVENT_TYPES` 中
- DSH 重启后会话无法加载，抛出 `SessionFormatUnsupportedError`

**为什么弃用**：
- DSH 目前不支持插件自定义事件类型
- 这会导致严重的兼容性问题

### ✅ 方案 2：内存方案（当前方案）

**实现**：
- 使用 WeakMap 存储审批模式
- 客户端 UI 自己管理状态
- 不写入任何事件

**为什么选择**：
- 用户确认 DSH 重启后恢复默认值可以接受
- 确保会话兼容性是核心需求
- 实现简单，符合 DSH 架构设计

---

## 根本原因分析（历史记录）

### DSH 会话事件系统的设计

DSH 会话日志是**事件溯源（Event Sourcing）**架构，所有状态变更都通过事件持久化：

```typescript
// 事件驱动方案（已弃用）
declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    'approval/mode': { mode: ApprovalMode }
  }
}

session.append('approval/mode', { mode })  // ❌ 会导致兼容性问题
```

### 2. 事件类型的注册机制

DSH 通过 `KNOWN_SESSION_EVENT_TYPES` 集合管理已知事件类型：

```typescript
// node_modules/@deepseek-ai/dsh-session/lib/types/known-event-types.js
export const KNOWN_SESSION_EVENT_TYPES = new Set([
  'agent-preset/selected',
  'agent/inbox/spliced',
  'approval/asked',
  'approval/decided',
  'approval/policy',
  // ... 官方事件类型
  // ❌ 不包含插件自定义事件类型
])
```

### 3. 未知事件类型的处理逻辑

DSH 会话加载时的验证逻辑：

```typescript
// 如果事件类型不在 KNOWN_SESSION_EVENT_TYPES 中
// 且没有 ignorable 标记 → 拒绝加载会话
if (!KNOWN_SESSION_EVENT_TYPES.has(event.type) && !event.ignorable) {
  throw new SessionFormatUnsupportedError(...)
}
```

### 4. `ignorable` 标记的限制

根据 `SessionEvent` 类型定义：

```typescript
export type SessionEvent<T extends SessionEventType = SessionEventType> = {
  type: K;
  seq: number;
  time: number;
  data: SessionEventMap[K];
  /**
   * Marks an event a reader may safely skip when it does not recognize `type`.
   * Absent means required: a reader meeting an unrecognized type without this 
   * marker MUST refuse to reconstruct the session...
   */
  ignorable?: true;
}
```

**关键限制**：`session.append()` API **不支持传递 `ignorable` 参数**：

```typescript
// Session.append 方法签名
append<T extends SessionEventType>(
  type: T, 
  data: SessionEventMap[T], 
  ...opts: T extends SurfaceEventType ? [opts: SurfaceIntent] : []
): SessionEvent<T>;

// ❌ 无法传递 ignorable 参数
session.append('approval/mode', { mode }, { ignorable: true }) // 不支持！
```

---

## 尝试过的解决方案

### ❌ 方案 1：内存方案（WeakMap）

**实现**：
```typescript
const sessionModes = new WeakMap<Session, ApprovalMode>()

export function getApprovalMode(session: Session, defaultMode: ApprovalMode): ApprovalMode {
  return sessionModes.get(session) ?? defaultMode
}

export function setApprovalMode(session: Session, mode: ApprovalMode): void {
  sessionModes.set(session, mode)
}
```

**问题**：
- ✅ 无兼容性问题
- ❌ 会话重启后状态丢失
- ❌ **`sessionProjections` 的 `view` 函数无法访问 `session` 对象，UI 无法显示实际值**

```typescript
// sessionProjections API 限制
projectionCtx.sessionProjections.register({
  key: 'approvalMode',
  // view 函数签名：只有 state 参数，没有 session 参数！
  view: (state: { mode: string }) => ({
    mode: state.mode || defaultSettings().default, // 只能返回默认值
    options: [...APPROVAL_MODES]
  }),
})
```

### ❌ 方案 2：使用 Context 扩展

**实现**：
```typescript
declare module '@deepseek-ai/cordis' {
  interface Context {
    approvalModes?: {
      getMode: (sessionId: string) => ApprovalMode | undefined
      getDefaultMode: () => ApprovalMode
    }
  }
}

ctx.approvalModes = {
  getMode: (sessionId: string) => sessionModes.get(sessionId),
  getDefaultMode: () => defaultSettings().default,
}
```

**问题**：
- ❌ 客户端 UI 无法访问服务端 Context
- ❌ 违背了 DSH 的架构设计

---

## ✅ 最终解决方案

**保持事件驱动方案 + 文档说明限制**

### 实现代码

```typescript
// 1. 声明事件类型
declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    'approval/mode': {
      mode: ApprovalMode
    }
  }
}

// 2. 写入事件（持久化）
export function setApprovalMode(session: Session, mode: ApprovalMode): void {
  session.append('approval/mode', { mode })
}

// 3. 读取事件（折叠 log）
export function getApprovalMode(session: Session, defaultMode: ApprovalMode): ApprovalMode {
  for (let index = session.events.length - 1; index >= 0; index -= 1) {
    const event = session.events[index] as SessionEvent
    if (event.type === 'approval/mode') return event.data.mode
  }
  return defaultMode
}

// 4. 投影给 UI
projectionCtx.sessionProjections.register({
  key: 'approvalMode',
  init: () => ({ mode: '' }),
  apply: (state, event) => {
    if (event.type !== 'approval/mode') return state
    return { mode: event.data.mode }
  },
  view: (state) => ({
    mode: state.mode || defaultSettings().default, // 显示实际值！
    options: [...APPROVAL_MODES]
  }),
  stateVersion: 2,
})
```

### 文档说明

在 README 中添加兼容性说明：

```markdown
## 已知限制

### 旧版本 DSH 兼容性

本插件使用自定义会话事件类型 `approval/mode` 持久化审批模式状态。旧版本 DSH（不支持插件事件类型）可能无法加载包含此类事件的会话日志，导致错误：

SessionFormatUnsupportedError: session contains event type "approval/mode" unknown to this harness

解决方案：
1. 升级 DSH：使用支持插件事件类型的最新版本
2. 清理会话日志：删除包含 `approval/mode` 事件的旧会话（~/.dsh/sessions/ 目录）
3. 临时禁用插件：在配置中设置 disabled: true 或切换到 off 模式
```

---

## 历史分析

### commit `5d0c0d6`（UI 之前）

**实现**：WeakMap 内存存储
**问题**：sessionProjections 只返回默认值，UI 不显示实际值

```typescript
const sessionModes = new WeakMap<Session, ApprovalMode>()

projectionCtx.sessionProjections.register({
  view: (state) => ({ 
    mode: state.mode || defaultSettings().default, // 只能返回默认值！
    options: [...APPROVAL_MODES] 
  }),
})
```

### commit `5030004`（修复 UI 显示）

**实现**：切换到事件驱动方案
**优势**：
- ✅ UI 显示实际值
- ✅ 状态持久化
- ✅ 符合 DSH 架构设计

```typescript
// 事件驱动：折叠 log 获取实际值
projectionCtx.sessionProjections.register({
  apply: (state, event) => {
    if (event.type !== 'approval/mode') return state
    return { mode: event.data.mode } // 从事件中获取实际值
  },
  view: (state) => ({
    mode: state.mode || defaultSettings().default, // 显示实际值！
    options: [...APPROVAL_MODES]
  }),
})
```

---

## 最佳实践建议

### 对于插件开发者

1. **优先使用 session events**：
   - 符合 DSH 架构设计
   - 状态可持久化、可重放
   - UI 可正确显示实际值

2. **在文档中说明兼容性限制**：
   - 明确标注使用了自定义事件类型
   - 提供清理旧会话的指引
   - 说明升级 DSH 的必要性

3. **避免使用内存方案（WeakMap）**：
   - 除非状态不需要持久化
   - 除非 UI 不需要显示实际值

### 对于 DSH 核心团队

建议支持插件事件类型的 `ignorable` 标记：

```typescript
// 建议 API 扩展
session.append('approval/mode', { mode }, { ignorable: true })

// 或在事件类型注册时声明
declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    'approval/mode': {
      mode: ApprovalMode
      __ignorable__?: true // 编译时标记
    }
  }
}
```

---

## 参考资料

- DSH Session 系统：`node_modules/@deepseek-ai/dsh-session/lib/types/types.d.ts`
- Session Projection RFC：`.agents/notes/proposed/architecture/2026-07-27-session-projection-and-command-log.md`
- 官方文档：`docs/lessons-learned/2026-08-20-client-plugin-exports-issue.md`
- Tutorial：`tutorial/plugin_dev/04_监听事件.md`

---

## 一句话总结

**本插件使用内存方案（WeakMap）存储审批模式，确保会话兼容性。DSH 重启后审批模式恢复为默认值，这是已知的设计决策。**
