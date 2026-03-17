import { Sidebar } from "./Sidebar"

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-background to-background pointer-events-none" />
        <div className="h-full px-8 py-8 relative z-0">
          {children}
        </div>
      </main>
    </div>
  )
}
