import { Brand } from './Brand'

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-lg items-center justify-center px-4 sm:max-w-2xl">
          <Brand />
        </div>
      </header>
      <main className="page-container">{children}</main>
    </div>
  )
}
