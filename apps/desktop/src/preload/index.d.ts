import type { DesktopAPI } from '@will-be-done/slices/desktop'

declare global {
  interface Window {
    api?: DesktopAPI
    desktopApi?: DesktopAPI
  }
}
