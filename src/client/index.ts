/**
 * Client plugin: registers the approval mode chip in the composer tool row,
 * beside the access-mode (permission) chip.
 */
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the ui-conversation SlotMap merge (the composer.dock seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the api-remotes merge for ctx.remote.commands.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { ApprovalModeChip, type ApprovalModeChipInjected } from './ApprovalModeChip'
import { en, zh, type ApprovalKey } from './locales'

export type { ApprovalKey } from './locales'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The approval mode chip's copy. */
    approval: ApprovalKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'approval'

/** Required services: the slot registry, commands Remote, and locale registry. */
export const inject = ['slots', 'remote', 'remote.commands', 'locale']

/**
 * Client plugin body: register the approval mode chip over the command channel.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-user-approval: dictionaries')

  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: 'approval-mode',
    order: 10, // After the resident chrome (access-mode chip, plan seat)
    locale: NS,
    inject: (sessionId: SessionId): ApprovalModeChipInjected => ({
      switchMode: async (mode: string) => {
        console.log('[approval-mode] Switching to mode:', mode)
        // Third parameter is images array (empty for commands), but TypeScript says AbortSignal
        // This is a type mismatch in DSH's type definitions
        const result = await ctx.remote.commands.execute(sessionId, `/approval-mode ${mode}`, [] as unknown as AbortSignal)
        console.log('[approval-mode] Command result:', result)
        if (!result.ok) {
          console.error('[approval-mode] Command failed:', result.error)
          return `${result.error.message} (${result.error.code})`
        }
        if (result.value === undefined) {
          console.error('[approval-mode] No result value')
          return 'unknown command: /approval-mode'
        }
        // The remote call succeeded but the command handler rejected the mode.
        if (result.value.result.kind === 'error') {
          console.error('[approval-mode] Command handler error:', result.value.result.text)
          return result.value.result.text
        }
        console.log('[approval-mode] Successfully switched to:', mode)
        return null
      },
      getDefaultMode: async () => {
        // Get current approval mode by querying the command
        const result = await ctx.remote.commands.execute(sessionId, '/approval-mode', [] as unknown as AbortSignal)
        if (result.ok && result.value?.result.kind === 'success') {
          // Parse mode from "current approval mode: <mode> (available: ...)"
          const text = result.value.result.text
          if (text) {
            const match = text.match(/current approval mode: (\w+)/)
            return match ? match[1] : 'off'
          }
        }
        return 'off'
      },
    }),
  }, ApprovalModeChip))
}
