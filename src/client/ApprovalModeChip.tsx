/**
 * ApprovalModeChip: the composer dock entry for switching approval modes.
 */
import { useState } from 'react'
import type { PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { Menu, IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ApprovalMode } from '../index'
import type { ApprovalKey } from './locales'
import css from './ApprovalModeChip.module.css'

/** Injected business face from the client plugin. */
export interface ApprovalModeChipInjected {
  /** Switch to a new approval mode by executing the /approval-mode command. */
  switchMode: (mode: string) => Promise<string | null>
}

/** Full component props: runtime share + injected share + locale seat. */
export type ApprovalModeChipProps =
  PropsRuntime<'conversation.composer.dock'>
  & InjectFace<ApprovalModeChipInjected>
  & { t: (key: ApprovalKey) => string }

const DEFAULT_MODES: ApprovalMode[] = ['off', 'request', 'auto-edit', 'yolo']

/**
 * Render the approval mode selector chip.
 * @param props - composed slot props.
 * @returns the chip element.
 */
export function ApprovalModeChip({ useProjection, switchMode, t }: ApprovalModeChipProps) {
  const projection = useProjection('approvalMode')
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)

  // Projection might be undefined if the host plugin is not loaded
  if (projection === undefined) return null

  const currentMode = projection.mode ?? 'off'
  const options = projection.options ?? DEFAULT_MODES

  const handleSelect = async (mode: string): Promise<void> => {
    if (mode === currentMode || switching) return
    setOpen(false)
    setSwitching(true)
    const error = await switchMode(mode)
    if (error !== null) {
      console.error('Failed to switch approval mode:', error)
    }
    setSwitching(false)
  }

  const items = options.map((mode: string) => ({
    id: mode,
    label: t(`mode.${mode}` as ApprovalKey),
  }))

  return (
    <div className={css.container}>
      <Menu
        open={open}
        items={items}
        selectedId={currentMode}
        onSelect={handleSelect}
        onClose={() => { setOpen(false) }}
        side="top"
        anchor={(
          <button
            type="button"
            className={css.trigger}
            disabled={switching}
            aria-label={t('label')}
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => { setOpen(!open) }}
          >
            <span className={css.label}>{t('label')}</span>
            <span className={css.mode}>{t(`mode.${currentMode}` as ApprovalKey)}</span>
            <IconChevronDownOutline14 className={css.chevron} />
          </button>
        )}
      />
    </div>
  )
}
