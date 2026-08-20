# dsh-user-approval

**Version 0.1.1**

[中文](./README.zh.md)

User approval modes plugin for DeepSeek Harness. Provides four approval modes to control when tools require user confirmation before execution.

用户审批模式插件，为 DeepSeek Harness 提供四种审批模式，控制工具执行前是否需要用户确认。

## Features

- **Four Approval Modes**: `request`, `auto-edit`, `yolo`, `off`
- **Web UI Mode Selector**: Quick-switch chip under the input box for changing approval modes without commands
- **Tool Family Classification**: Automatically categorizes tools into edit, shell, readonly, and other families
- **Sandbox Integration**: Automatically adjusts sandbox policy when switching modes
- **Session-Scoped**: Each session maintains its own approval mode
- **In-Memory State**: Approval mode stored in memory, resets to default on DSH restart
- **Settings Integration**: Configure default approval mode for new sessions
- **Slash Command**: Switch modes via `/approval-mode` command

## Approval Modes

| Mode | Edit Tools | Shell Tools | Other Tools | Read-Only Tools | Use Case |
|------|-----------|-------------|-------------|----------------|----------|
| `request` | Ask | Ask | Ask | Allow | Maximum security, all modifications require approval |
| `auto-edit` | Allow | Ask | Ask | Allow | Balanced, automatic file editing with shell oversight |
| `yolo` | Allow | Allow | Allow | Allow | No approval needed, full automation |
| `off` | Allow | Allow | Allow | Allow | Disabled, restore default DSH behavior |

### Mode Details

#### `request` - Maximum Security
- **Behavior**: All edit, shell, and unclassified tools require approval
- **Sandbox**: Automatically switches to `workspace-write`
- **Use Case**: High-security environments, production systems, or when working with critical files

#### `auto-edit` - Balanced Mode
- **Behavior**: Edit tools auto-approve, shell and unclassified tools require approval
- **Sandbox**: Automatically switches to `workspace-write`
- **Use Case**: Development environments where file modifications are trusted but shell commands need oversight

#### `yolo` - Full Automation
- **Behavior**: No approval required for any tool
- **Sandbox**: Automatically switches to `workspace-write`
- **Use Case**: Trusted environments, rapid prototyping, or when you want full automation

#### `off` - Disabled
- **Behavior**: Plugin disabled, restore default DSH approval behavior
- **Sandbox**: Restores to composition default
- **Use Case**: Temporarily disable the plugin without uninstalling

**Note**: When switching approval modes, the sandbox mode is automatically adjusted to the configured default value. This will override any previous manual sandbox adjustments you made. If you wish to use a different sandbox mode with the new approval mode, you can manually adjust the sandbox again after switching.

## Installation

### From GitHub

```bash
dsh plugin --profile web add github:R-LEI2536/dsh-user-approval
```

### From Local Directory (Development)

```bash
dsh plugin --profile web add /path/to/dsh-user-approval
```

## Known Limitations

### Session Restart Behavior

This plugin uses an **in-memory storage** approach to avoid compatibility issues with DSH session event types. As a result:

- ✅ **Sessions load successfully** after DSH restart (no compatibility issues)
- ⚠️ **Approval mode resets to default** after DSH restart (backend WeakMap cleared)
- ✅ **UI syncs from server** on browser refresh, reflecting actual mode
- ✅ **Approval mode persists** during the current session

**Why this design?**
- DSH currently does not support custom event types in plugins
- Writing custom events would cause `SessionFormatUnsupportedError` after restart
- In-memory storage ensures sessions remain compatible across DSH versions

**Workaround**:
- Use the `/approval-mode` command to quickly switch modes after restart
- Or use the Web UI selector to change modes

### UI State Synchronization

The Web UI state is managed independently and syncs from the server on refresh:

- ✅ **UI updates immediately** when using the Web UI selector
- ✅ **UI syncs from server** on browser refresh
- ⚠️ **UI does not auto-update** when using the `/approval-mode` command
- ⚠️ **UI shows stale value** if you switch modes via command (until refresh)

**Workaround**:
- Refresh the web page to sync the UI with the actual mode
- Or simply use the Web UI selector instead of the command

**Why this limitation?**
- The UI manages its own state via React `useState` (in-memory approach)
- Commands execute on the server, but don't emit events (to avoid compatibility issues)
- Without events, there's no mechanism to notify the UI of changes
- This is a **fundamental trade-off**: either use events (but sessions won't load), or use memory (but UI won't sync)
- We chose memory storage to ensure sessions load successfully

**Future improvement**:
- Waiting for DSH upstream to provide official support for custom event types
- Or provide a mechanism for plugins to emit ignorable events
- Once supported, this plugin can migrate to event-driven approach and achieve full UI synchronization

For technical details, see [`docs/2026-08-20-plugin-event-compatibility-issue.md`](docs/lessons-learned/2026-08-20-plugin-event-compatibility-issue.md).

## Usage

### Using the Web UI Mode Selector

The plugin provides a visual mode selector in DSH Web (displayed as a small button/chip under the input box):

**Location**: In the toolbar below the chat input box, you'll see a button showing the current mode (e.g., "Approval: Off")

This is the easiest way to switch modes, recommended for daily use.

### Switch Approval Mode via Command

Use the `/approval-mode` command in the DSH Web GUI:

```
/approval-mode              # Show current mode
/approval-mode request      # Switch to request mode
/approval-mode auto-edit    # Switch to auto-edit mode
/approval-mode yolo         # Switch to yolo mode
/approval-mode off          # Disable (restore default)
```

### Example Workflow

```
# Start with maximum security
/approval-mode request

# Let the agent read files (auto-approved)
# Agent tries to edit a file → Approval dialog appears

# Switch to auto-edit for faster development
/approval-mode auto-edit

# Agent edits files automatically
# Agent runs bash command → Approval dialog appears

# Switch to yolo for full automation
/approval-mode yolo

# All tools execute without approval
```

## Known Limitations

### Composer Tool Row Layout

The approval mode chip is registered in the `conversation.input.left` slot of the
composer tool row, beside the access-mode (permission) chip. When plan mode is
active (`/plan`), the platform renders its orange plan-status chip in the
`conversation.input.plan` seat — a named single-occupant seat the harness places
immediately right of the access-mode control — so the plan chip appears between
the permission chip and the approval chip.

This order is fixed by the platform layout: `ui-conversation`'s `InputBar`
renders `conversation.input.plan` inside its "modes" cluster, before the
`conversation.input.left` entries. A plugin cannot move the plan seat without
re-rendering the entire plan control, and relocating it would require a
platform-level change to `ui-conversation`, which this plugin deliberately
avoids. Accepted as-is.

## Configuration

### Basic Usage (with all defaults)

```yaml
- insert:
    - id: approval-modes
      name: dsh-user-approval
```

This uses default values:
- `default`: `off` (plugin disabled by default)
- `editTools`: `['write', 'edit', 'str_replace_editor']`
- `shellTools`: `['bash', 'pwsh', 'tool:bash', 'tool:pwsh']`
- `readOnlyTools`: `['read', 'glob', 'grep', 'read_image', 'list_dir']`
- `autoAllowTools`: `['ask_user_question', 'exit_plan_mode']`
- `unclassified`: `ask`

### Custom Configuration

You can customize the plugin behavior in your agent preset:

```yaml
- insert:
    - id: approval-modes
      name: dsh-user-approval
      config:
        # Default mode for new sessions
        default: auto-edit
        
        # Custom tool classifications
        editTools: ['write', 'edit', 'str_replace_editor']
        shellTools: ['bash', 'pwsh', 'tool:bash', 'tool:pwsh']
        readOnlyTools: ['read', 'glob', 'grep', 'read_image', 'list_dir']
        autoAllowTools: ['ask_user_question', 'exit_plan_mode']
        
        # Strategy for unclassified tools: 'ask' (safer) or 'allow' (faster)
        unclassified: ask
        
        # Sandbox policy for each mode
        sandboxDefaults:
          request: workspace-write
          auto-edit: workspace-write
          yolo: workspace-write
        
        # Custom approval reason message
        askReason: 'approval needed for {tool} under {mode} mode ({family})'
```

### Disable the Plugin

```yaml
- id: approval-modes
  disabled: true
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `default` | string | `off` | Default approval mode for new sessions. Options: `request`, `auto-edit`, `yolo`, `off` |
| `editTools` | string[] | `['write', 'edit', 'str_replace_editor']` | Tools classified as "edit" family (file modifications) |
| `shellTools` | string[] | `['bash', 'pwsh', 'tool:bash', 'tool:pwsh']` | Tools classified as "shell" family (command execution) |
| `readOnlyTools` | string[] | `['read', 'glob', 'grep', 'read_image', 'list_dir']` | Tools classified as "readonly" family (always allowed) |
| `autoAllowTools` | string[] | `['ask_user_question', 'exit_plan_mode']` | Tools that always bypass approval |
| `unclassified` | string | `ask` | Strategy for unclassified tools: `ask` (require approval) or `allow` (auto-approve) |
| `sandboxDefaults` | object | `{request: 'workspace-write', auto-edit: 'workspace-write', yolo: 'workspace-write'}` | Sandbox mode for each approval mode |
| `askReason` | string | *see default* | Custom message template for approval requests. Supports `{tool}`, `{mode}`, `{family}` placeholders |

### Default Ask Reason

```
approval needed for {tool} under {mode} mode ({family}); read-only browsing should use read/glob/list_dir instead of shell
```

## Tool Family Classification

The plugin automatically classifies tools into four families:

| Family | Default Tools | Behavior |
|--------|--------------|----------|
| **Edit** | `write`, `edit`, `str_replace_editor` | File modification tools |
| **Shell** | `bash`, `pwsh`, `tool:bash`, `tool:pwsh` | Command execution tools |
| **Read-Only** | `read`, `glob`, `grep`, `read_image`, `list_dir` | Safe browsing tools (always allowed) |
| **Other** | *all other tools* | Unclassified tools, behavior depends on `unclassified` config |

## How It Works

1. **Tool Execution Interception**: The plugin listens to `tools/pre-execute` events
2. **Family Classification**: Determines which family the tool belongs to
3. **Mode Check**: Evaluates current approval mode
4. **Decision**: Returns `{ kind: 'ask' }` for tools requiring approval, or allows execution
5. **Sandbox Sync**: Automatically adjusts sandbox policy when switching modes
6. **State Storage**: Approval mode stored in-memory (WeakMap), resets on DSH restart
7. **UI Synchronization**: Web UI chip manages state via React, syncs from server on refresh

## Dependencies

- `@deepseek-ai/cordis`: Plugin framework
- `@deepseek-ai/dsh-tools`: Tool definition utilities
- `@deepseek-ai/dsh-sandbox`: Sandbox mode types
- `@deepseek-ai/dsh-sandbox-policy`: Sandbox policy management
- `@deepseek-ai/dsh-session`: Session management
- `@deepseek-ai/dsh-settings`: Settings integration
- `@deepseek-ai/dsh-commands`: Command registration
- `@deepseek-ai/dsh-session-projection`: Session projection for UI
- `@deepseek-ai/schemastery`: Configuration schema validation
- `dsh-tool-list-dir`: Recommended read-only directory browsing tool

## Related Projects

- [dsh-tool-list-dir](https://github.com/R-LEI2536/dsh-tool-list-dir) - Read-only directory listing tool, recommended for use with this plugin

## License

MIT
