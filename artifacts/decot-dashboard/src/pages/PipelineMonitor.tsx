import { useState } from "react"
import { useGetPipelinePhases, useGetPipelineLogs } from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@radix-ui/react-scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Progress } from "@/components/ui/progress"
import { LoadingScreen } from "@/components/ui/loading-screen"
import { CheckCircle2, Circle, AlertCircle, Clock, TerminalSquare } from "lucide-react"
import { format } from "date-fns"

function StatusIcon({ status }: { status: string }) {
  switch(status) {
    case 'completed': return <CheckCircle2 className="h-5 w-5 text-success" />
    case 'running': return <Clock className="h-5 w-5 text-primary animate-pulse" />
    case 'failed': return <AlertCircle className="h-5 w-5 text-destructive" />
    case 'pending':
    case 'skipped':
    default: return <Circle className="h-5 w-5 text-muted-foreground" />
  }
}

function StatusBadge({ status }: { status: string }) {
  switch(status) {
    case 'completed': return <Badge variant="success">Completed</Badge>
    case 'running': return <Badge variant="running">Running</Badge>
    case 'failed': return <Badge variant="destructive">Failed</Badge>
    case 'skipped': return <Badge variant="outline">Skipped</Badge>
    default: return <Badge variant="secondary">Pending</Badge>
  }
}

export default function PipelineMonitor() {
  const [selectedPhase, setSelectedPhase] = useState<number | undefined>()
  
  const { data: phases, isLoading: phasesLoading } = useGetPipelinePhases({ query: { refetchInterval: 10000 } })
  const { data: logs, isLoading: logsLoading } = useGetPipelineLogs(
    { phase: selectedPhase?.toString(), limit: 200 }, 
    { query: { refetchInterval: 5000 } }
  )

  if (phasesLoading) return <LoadingScreen />
  
  return (
    <div className="space-y-6 h-full flex flex-col animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-glow">Pipeline Monitor</h1>
        <p className="text-muted-foreground mt-1">Detailed phase execution and live terminal logs.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 flex-1 min-h-0">
        {/* Left Col: Phases */}
        <Card className="glass-panel flex flex-col overflow-hidden h-[calc(100vh-140px)]">
          <CardHeader className="border-b border-border shrink-0 bg-muted/10">
            <CardTitle>Execution Phases</CardTitle>
            <CardDescription>Click a phase to filter logs</CardDescription>
          </CardHeader>
          <div className="overflow-y-auto p-0 flex-1">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur">
                <TableRow>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>Phase</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Progress</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {phases?.map((p) => (
                  <TableRow 
                    key={p.phase}
                    className={`cursor-pointer transition-colors hover:bg-muted/50 ${selectedPhase === p.phase ? 'bg-muted/50 border-l-2 border-primary' : ''}`}
                    onClick={() => setSelectedPhase(selectedPhase === p.phase ? undefined : p.phase)}
                  >
                    <TableCell>
                      <StatusIcon status={p.status} />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground line-clamp-1">{p.description}</div>
                      {p.errorMessage && (
                        <div className="text-xs text-destructive mt-1 font-mono bg-destructive/10 p-1 rounded">
                          {p.errorMessage}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="text-right w-[120px]">
                      {p.progress !== undefined && p.progress !== null ? (
                        <div className="flex flex-col gap-1 items-end">
                          <span className="text-xs font-mono">{Math.round(p.progress * 100)}%</span>
                          <Progress value={p.progress * 100} className="h-1.5 w-full" />
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Right Col: Logs */}
        <Card className="glass-panel flex flex-col overflow-hidden bg-[#0A0A0A] border-border h-[calc(100vh-140px)] relative">
          <CardHeader className="border-b border-border shrink-0 bg-[#111]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TerminalSquare className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-slate-300 font-mono text-sm">terminal.log</CardTitle>
              </div>
              {selectedPhase !== undefined && (
                <Badge variant="outline" className="font-mono text-xs">Phase {selectedPhase} filter</Badge>
              )}
            </div>
          </CardHeader>
          <div className="flex-1 overflow-y-auto p-4 font-mono text-xs terminal-scanline relative">
            <div className="space-y-1.5 z-10 relative">
              {logsLoading ? (
                <div className="text-muted-foreground flex items-center gap-2 animate-pulse">
                  <Clock className="h-3 w-3" /> Fetching logs...
                </div>
              ) : logs?.length === 0 ? (
                <div className="text-muted-foreground">No logs available.</div>
              ) : (
                logs?.map((log) => (
                  <div key={log.id} className="flex gap-3 items-start group">
                    <span className="text-slate-500 shrink-0 select-none">
                      {format(new Date(log.timestamp), 'HH:mm:ss.SSS')}
                    </span>
                    <span className={`shrink-0 w-16 uppercase font-bold text-[10px] tracking-wider mt-0.5
                      ${log.level === 'error' ? 'text-destructive' : 
                        log.level === 'warning' ? 'text-warning' : 
                        log.level === 'info' ? 'text-primary' : 'text-slate-500'}`}
                    >
                      [{log.level}]
                    </span>
                    <span className={`flex-1 break-words leading-relaxed
                      ${log.level === 'error' ? 'text-red-400' : 'text-slate-300'}`}
                    >
                      {log.message}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
