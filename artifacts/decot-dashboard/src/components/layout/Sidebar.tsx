import { Link, useLocation } from "wouter"
import { Bot, Cpu } from "lucide-react"
import { cn } from "@/lib/utils"

const navigation = [
  { name: 'Reasoning Agent', href: '/agent', icon: Bot },
]

export function Sidebar() {
  const [location] = useLocation()

  return (
    <div className="flex h-full w-64 flex-col bg-sidebar border-r border-sidebar-border shadow-xl relative z-10">
      <div className="flex h-16 shrink-0 items-center px-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/30 box-glow">
            <Cpu className="h-5 w-5 text-primary animate-pulse-ring" />
          </div>
          <span className="text-lg font-bold tracking-tight text-glow">DE-COT</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto pt-6 px-3">
        <nav className="flex-1 space-y-1">
          {navigation.map((item) => {
            const isActive = location === item.href
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-primary box-glow'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
                  'group flex items-center px-3 py-2.5 text-sm font-medium rounded-r-md transition-all duration-200'
                )}
              >
                <item.icon
                  className={cn(
                    isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-sidebar-accent-foreground',
                    'mr-3 h-5 w-5 flex-shrink-0 transition-colors'
                  )}
                  aria-hidden="true"
                />
                {item.name}
              </Link>
            )
          })}
        </nav>
      </div>
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-2 w-2 rounded-full bg-success animate-pulse"></div>
          System Online
        </div>
      </div>
    </div>
  )
}
