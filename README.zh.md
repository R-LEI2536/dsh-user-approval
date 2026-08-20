# dsh-user-approval

**版本 0.1.1**

[English](./README.md)

用户审批模式插件，为 DeepSeek Harness 提供四种审批模式，控制工具执行前是否需要用户确认。

## 功能特性

- **四种审批模式**：`request`、`auto-edit`、`yolo`、`off`
- **Web UI模式选择器**：输入框下方的快捷芯片，无需命令即可切换审批模式
- **工具族分类**：自动将工具分为编辑、Shell、只读和其他四类
- **沙箱集成**：切换模式时自动调整沙箱策略
- **会话级别**：每个会话维护独立的审批模式
- **内存状态**：审批模式存储在内存中，重启后恢复默认
- **设置集成**：为新会话配置默认审批模式
- **斜杠命令**：通过 `/approval-mode` 命令切换模式

## 审批模式

四种审批模式灵感来源于 [Qwen Code](https://github.com/QwenLM/Qwen-Code)。

| 模式 | 编辑工具 | Shell 工具 | 其他工具 | 只读工具 | 使用场景 |
|------|---------|-----------|---------|---------|----------|
| `request` | 需审批 | 需审批 | 需审批 | 允许 | 最高安全性，所有修改都需要审批 |
| `auto-edit` | 允许 | 需审批 | 需审批 | 允许 | 平衡模式，自动编辑文件但监控 Shell |
| `yolo` | 允许 | 允许 | 允许 | 允许 | 无需审批，完全自动化 |
| `off` | 允许 | 允许 | 允许 | 允许 | 禁用，恢复 DSH 默认行为 |

### 模式详情

#### `request` - 最高安全性
- **行为**：所有编辑、Shell 和未分类工具都需要审批
- **沙箱**：自动切换到 `workspace-write`
- **使用场景**：高安全环境、生产系统或处理关键文件时

#### `auto-edit` - 平衡模式
- **行为**：编辑工具自动批准，Shell 和未分类工具需要审批
- **沙箱**：自动切换到 `workspace-write`
- **使用场景**：开发环境，信任文件修改但需要监控 Shell 命令

#### `yolo` - 完全自动化
- **行为**：所有工具都无需审批
- **沙箱**：自动切换到 `workspace-write`
- **使用场景**：可信环境、快速原型开发或需要完全自动化时

#### `off` - 禁用
- **行为**：插件禁用，恢复 DSH 默认审批行为
- **沙箱**：恢复到组合默认
- **使用场景**：临时禁用插件而不卸载

**注意**：切换审批模式时，会自动联动调整沙箱模式到配置的默认值。这会覆盖您之前手动调整的沙箱设置。如果您希望在新的审批模式下使用不同的沙箱模式，可以在切换审批模式后再次手动调整沙箱。

## 安装

### 从 GitHub 安装

```bash
dsh plugin --profile web add github:R-LEI2536/dsh-user-approval
```

### 从本地目录安装（开发模式）

```bash
dsh plugin --profile web add /path/to/dsh-user-approval
```

## 使用方法

### 使用Web UI模式选择器

插件在DSH Web输入框下方提供可视化的模式选择器（显示为一个小按钮/标签）：

**位置**：在聊天输入框下方的工具栏中，你会看到一个显示当前模式的按钮（例如"审批：关闭"）

### 通过命令切换审批模式

在 DSH Web GUI 中使用 `/approval-mode` 命令：

```
/approval-mode              # 显示当前模式
/approval-mode request      # 切换到 request 模式
/approval-mode auto-edit    # 切换到 auto-edit 模式
/approval-mode yolo         # 切换到 yolo 模式
/approval-mode off          # 禁用（恢复默认）
```

### 示例工作流

```
# 以最高安全性开始
/approval-mode request

# Agent 读取文件（自动批准）
# Agent 尝试编辑文件 → 弹出审批对话框

# 切换到 auto-edit 以加快开发
/approval-mode auto-edit

# Agent 自动编辑文件
# Agent 运行 bash 命令 → 弹出审批对话框

# 切换到 yolo 完全自动化
/approval-mode yolo

# 所有工具无需审批即可执行
```

## 已知限制

### 会话重启行为

本插件使用**内存存储方案**来避免 DSH 会话事件类型的兼容性问题。因此：

- ✅ **会话加载成功**：DSH 重启后会话可以正常加载（无兼容性问题）
- ⚠️ **审批模式恢复默认**：DSH 重启后（后端 WeakMap 清空），审批模式恢复为默认值
- ✅ **UI 从服务器同步**：浏览器刷新时，UI 会从服务器获取当前模式
- ✅ **当前会话有效**：审批模式在当前会话期间保持

**为什么这样设计？**
- DSH 目前不支持插件自定义事件类型
- 写入自定义事件会导致重启后出现 `SessionFormatUnsupportedError`
- 内存存储确保会话在各个 DSH 版本间保持兼容

**解决方法**：
- 重启后使用 `/approval-mode` 命令快速切换模式
- 或使用 Web UI 选择器切换模式

### UI 状态同步

Web UI 状态独立管理，刷新时从服务器同步：

- ✅ **UI 立即更新**：使用 Web UI 选择器时立即更新显示
- ✅ **UI 从服务器同步**：浏览器刷新时从服务器获取当前模式
- ⚠️ **UI 不同步命令**：使用 `/approval-mode` 命令时 UI 不会自动更新
- ⚠️ **UI 显示旧值**：通过命令切换模式后，UI 显示旧值（需刷新）

**解决方法**：
- 刷新网页以同步 UI 和实际模式
- 或直接使用 Web UI 选择器，而不是命令

**为什么有这个限制？**
- UI 通过 React `useState` 独立管理状态（内存方案）
- 命令在服务端执行，但不产生事件（避免兼容性问题）
- 没有事件，就没有机制通知 UI 状态变化
- 这是一个**根本性的权衡**：要么使用事件（但会话无法加载），要么使用内存（但 UI 不同步）
- 我们选择了内存方案，确保会话可以正常加载

**未来改进**：
- 等待 DSH 上游提供插件自定义事件类型的官方支持
- 或提供机制让插件发出可忽略的事件（ignorable events）
- 一旦支持，本插件可以迁移到事件驱动方案，实现完整的 UI 同步

### Composer 工具行布局

审批模式芯片注册在 composer 工具行的 `conversation.input.left` 座位，位于访问模式（权限）芯片旁边。当进入计划模式（`/plan`）时，平台会在 `conversation.input.plan` 座位渲染橘色的计划状态芯片 —— 该座位是平台命名的高占用（single）座位，harness 固定把它放在访问模式控件右侧 —— 因此计划框会出现在权限芯片与审批芯片之间。

这一顺序由平台布局固定：`ui-conversation` 的 `InputBar` 在 "modes" 簇内、`conversation.input.left` 条目之前渲染 `conversation.input.plan`。插件无法在不重画整个计划控件的前提下移动该座位，而移动它需要对 `ui-conversation` 做平台级改动，本插件刻意不做。保持现状。

## 配置

### 基本使用（使用所有默认值）

```yaml
- insert:
    - id: approval-modes
      name: dsh-user-approval
```

使用默认值：
- `default`: `off`（默认禁用插件）
- `editTools`: `['write', 'edit', 'str_replace_editor']`
- `shellTools`: `['bash', 'pwsh', 'tool:bash', 'tool:pwsh']`
- `readOnlyTools`: `['read', 'glob', 'grep', 'read_image', 'list_dir']`
- `autoAllowTools`: `['ask_user_question', 'exit_plan_mode']`
- `unclassified`: `ask`

### 自定义配置

可以在 agent preset 中自定义插件行为：

```yaml
- insert:
    - id: approval-modes
      name: dsh-user-approval
      config:
        # 新会话的默认模式
        default: auto-edit
        
        # 自定义工具分类
        editTools: ['write', 'edit', 'str_replace_editor']
        shellTools: ['bash', 'pwsh', 'tool:bash', 'tool:pwsh']
        readOnlyTools: ['read', 'glob', 'grep', 'read_image', 'list_dir']
        autoAllowTools: ['ask_user_question', 'exit_plan_mode']
        
        # 未分类工具的策略：'ask'（更安全）或 'allow'（更快）
        unclassified: ask
        
        # 各模式的沙箱策略
        sandboxDefaults:
          request: workspace-write
          auto-edit: workspace-write
          yolo: workspace-write
        
        # 自定义审批原因消息
        askReason: 'approval needed for {tool} under {mode} mode ({family})'
```

### 禁用插件

```yaml
- id: approval-modes
  disabled: true
```

## 配置选项

| 选项 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `default` | string | `off` | 新会话的默认审批模式。选项：`request`、`auto-edit`、`yolo`、`off` |
| `editTools` | string[] | `['write', 'edit', 'str_replace_editor']` | 分类为"编辑"族的工具（文件修改） |
| `shellTools` | string[] | `['bash', 'pwsh', 'tool:bash', 'tool:pwsh']` | 分类为"Shell"族的工具（命令执行） |
| `readOnlyTools` | string[] | `['read', 'glob', 'grep', 'read_image', 'list_dir']` | 分类为"只读"族的工具（始终允许） |
| `autoAllowTools` | string[] | `['ask_user_question', 'exit_plan_mode']` | 始终绕过审批的工具 |
| `unclassified` | string | `ask` | 未分类工具的策略：`ask`（需要审批）或 `allow`（自动批准） |
| `sandboxDefaults` | object | `{request: 'workspace-write', auto-edit: 'workspace-write', yolo: 'workspace-write'}` | 各审批模式的沙箱模式 |
| `askReason` | string | *见默认值* | 审批请求的自定义消息模板。支持 `{tool}`、`{mode}`、`{family}` 占位符 |

### 默认审批原因

```
approval needed for {tool} under {mode} mode ({family}); read-only browsing should use read/glob/list_dir instead of shell
```

## 工具族分类

插件自动将工具分为四个族：

| 族 | 默认工具 | 行为 |
|------|---------|------|
| **编辑** | `write`, `edit`, `str_replace_editor` | 文件修改工具 |
| **Shell** | `bash`, `pwsh`, `tool:bash`, `tool:pwsh` | 命令执行工具 |
| **只读** | `read`, `glob`, `grep`, `read_image`, `list_dir` | 安全浏览工具（始终允许） |
| **其他** | *所有其他工具* | 未分类工具，行为取决于 `unclassified` 配置 |

## 工作原理

1. **工具执行拦截**：插件监听 `tools/pre-execute` 事件
2. **族分类**：确定工具属于哪个族
3. **模式检查**：评估当前审批模式
4. **决策**：对需要审批的工具返回 `{ kind: 'ask' }`，或允许执行
5. **沙箱同步**：切换模式时自动调整沙箱策略
6. **状态存储**：审批模式使用内存存储（WeakMap），DSH 重启后恢复默认
7. **UI同步**：Web UI 芯片通过 React 管理状态，刷新时从服务器同步

## 依赖

- `@deepseek-ai/cordis`：插件框架
- `@deepseek-ai/dsh-tools`：工具定义工具
- `@deepseek-ai/dsh-sandbox`：沙箱模式类型
- `@deepseek-ai/dsh-sandbox-policy`：沙箱策略管理
- `@deepseek-ai/dsh-session`：会话管理
- `@deepseek-ai/dsh-settings`：设置集成
- `@deepseek-ai/dsh-commands`：命令注册
- `@deepseek-ai/dsh-session-projection`：会话投影（用于 UI）
- `@deepseek-ai/schemastery`：配置 schema 验证
- `dsh-tool-list-dir`：推荐的只读目录浏览工具

## 相关项目

- [dsh-tool-list-dir](https://github.com/R-LEI2536/dsh-tool-list-dir) - 只读目录列表工具，推荐与此插件配合使用

## 许可证

MIT
