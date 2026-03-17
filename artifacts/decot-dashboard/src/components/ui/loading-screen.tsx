import { Cpu } from "lucide-react"

export function LoadingScreen() {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground space-y-4">
      <div className="relative">
        <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
        <Cpu className="h-12 w-12 text-primary animate-bounce relative z-10" />
      </div>
      <p className="text-sm font-medium tracking-widest uppercase animate-pulse">INITIALIZING...</p>
    </div>
  )
}
