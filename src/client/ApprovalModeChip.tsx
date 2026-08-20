/**
 * ApprovalModeChip: the composer dock entry for switching approval modes.
 */
import { useState, useEffect } from 'react'
import type { PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { Menu, IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ApprovalMode } from '../index'
import type { ApprovalKey } from './locales'
import css from './ApprovalModeChip.module.css'

/** Injected business face from the client plugin. */
export interface ApprovalModeChipInjected {
  /** Switch to a new approval mode by executing the /approval-mode command. */
  switchMode: (mode: string) => Promise<string | null>
  /** Get the default approval mode from server config. */
  getDefaultMode: () => Promise<string>
}

/** Full component props: runtime share + injected share + locale seat. */
export type ApprovalModeChipProps =
  PropsRuntime<'conversation.input.left'>
  & InjectFace<ApprovalModeChipInjected>
  & { t: (key: ApprovalKey) => string }

const DEFAULT_MODES: ApprovalMode[] = ['off', 'request', 'auto-edit', 'yolo']

/**
 * Render the approval mode selector chip.
 * @param props - composed slot props.
 * @returns the chip element.
 */
export function ApprovalModeChip({ switchMode, getDefaultMode, t }: ApprovalModeChipProps) {
  const [currentMode, setCurrentMode] = useState<ApprovalMode>('off')
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)

  // Initialize mode: always fetch from server to ensure sync after DSH restart
  useEffect(() => {
    getDefaultMode().then((mode) => {
      setCurrentMode(mode as ApprovalMode)
    }).catch(() => {
      // Keep default 'off' if failed to get mode
    })
  }, [getDefaultMode])

  const options = DEFAULT_MODES

  const handleSelect = async (mode: string): Promise<void> => {
    if (mode === currentMode || switching) return
    setOpen(false)
    setSwitching(true)
    
    const error = await switchMode(mode)
    if (error === null) {
      setCurrentMode(mode as ApprovalMode)  // UI immediately updates
    } else {
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
            <IconChevronDownOutline14 className={open ? `${css.chevron} ${css.chevronOpen}` : css.chevron} />
          </button>
        )}
      />
    </div>
  )
}
