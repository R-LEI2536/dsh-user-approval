/**
 * Client plugin: registers the approval mode chip in the composer dock.
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

  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock',
    id: 'approval-mode',
    order: 10, // After StatsLine
    locale: NS,
    inject: (sessionId: SessionId): ApprovalModeChipInjected => ({
      switchMode: async (mode: string) => {
        const result = await ctx.remote.commands.execute(sessionId, `/approval-mode ${mode}`)
        if (!result.ok) return `${result.error.message} (${result.error.code})`
        if (result.value === undefined) return 'unknown command: /approval-mode'
        // The remote call succeeded but the command handler rejected the mode.
        if (result.value.result.kind === 'error') return result.value.result.text
        return null
      },
    }),
  }, ApprovalModeChip))
}
