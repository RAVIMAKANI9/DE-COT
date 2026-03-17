import { useGetPipelineStatus, useGetPipelineCost, useGetInferenceStatus } from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Activity, Database, DollarSign, BrainCircuit, CheckCircle2, Clock } from "lucide-react"
import { formatCurrency, formatNumber, PHASE_NAMES } from "@/lib/utils"
import { LoadingScreen } from "@/components/ui/loading-screen"

export default function Dashboard() {
  const { data: status, isLoading: statusLoading } = useGetPipelineStatus({ query: { refetchInterval: 10000 } })
  const { data: cost, isLoading: costLoading } = useGetPipelineCost({ query: { refetchInterval: 30000 } })
  const { data: inference, isLoading: infLoading } = useGetInferenceStatus({ query: { refetchInterval: 30000 } })

  if (statusLoading || costLoading || infLoading) return <LoadingScreen />
  
  if (!status || !cost || !inference) return (
    <div className="flex items-center justify-center h-full text-destructive">Failed to load dashboard data</div>
  )

  const budget = 120;
  const costPercentage = Math.min((cost.totalCostUsd / budget) * 100, 100);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-glow">Pipeline Overview</h1>
          <p className="text-muted-foreground mt-1">Real-time monitoring of the DE-COT training process.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={status.overallStatus === 'running' ? 'running' : 'secondary'} className="px-3 py-1 text-sm uppercase tracking-wider">
            {status.overallStatus}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Phase Status */}
        <Card className="glass-panel">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Phase</CardTitle>
            <Activity className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-glow">{PHASE_NAMES[status.currentPhase]}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Phase {status.currentPhase} of 6
            </p>
            <Progress value={(status.currentPhase / 6) * 100} className="mt-3" />
          </CardContent>
        </Card>

        {/* Cost Tracking */}
        <Card className="glass-panel">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">API Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">{formatCurrency(cost.totalCostUsd)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatCurrency(cost.estimatedRemainingUsd || (budget - cost.totalCostUsd))} remaining of {formatCurrency(budget)} budget
            </p>
            <Progress value={costPercentage} indicatorClassName="bg-warning" className="mt-3" />
          </CardContent>
        </Card>

        {/* Data Status */}
        <Card className="glass-panel">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dataset Progress</CardTitle>
            <Database className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-accent">{formatNumber(status.filteredCoTSamples || 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              High-quality CoT samples filtered from {formatNumber(status.totalDatasetSamples || 0)} total
            </p>
            <div className="mt-3 flex items-center gap-2 text-xs font-medium text-success">
              <CheckCircle2 className="h-3 w-3" />
              Ready for Fine-tuning
            </div>
          </CardContent>
        </Card>

        {/* Inference Status */}
        <Card className="glass-panel">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inference Service</CardTitle>
            <BrainCircuit className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {inference.readyForInference ? "Online" : "Offline"}
            </div>
            <p className="text-xs text-muted-foreground mt-1 truncate" title={inference.adapterPath || "No adapter loaded"}>
              {inference.modelLoaded ? `Adapter: ${inference.adapterPath?.split('/').pop() || 'Loaded'}` : "Awaiting deployment"}
            </p>
            <div className="mt-3">
              {inference.modelLoaded ? (
                <Badge variant="success" className="text-[10px]">Model Loaded</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">Standby</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Area - Split View */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="lg:col-span-2 glass-panel flex flex-col">
          <CardHeader>
            <CardTitle>System Activity</CardTitle>
            <CardDescription>Recent pipeline state changes and timestamps</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex items-center justify-center p-6 bg-muted/20 m-6 rounded-lg border border-border">
            <div className="text-center space-y-2">
              <Activity className="h-8 w-8 text-muted-foreground mx-auto opacity-50" />
              <p className="text-sm text-muted-foreground">Detailed activity log is available in the Pipeline Monitor</p>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Quick Stats</CardTitle>
            <CardDescription>Pipeline efficiency metrics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-muted-foreground flex items-center gap-2"><Clock className="h-3 w-3"/> Input Tokens</span>
                <span className="font-mono">{formatNumber(cost.totalInputTokens)}</span>
              </div>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-muted-foreground flex items-center gap-2"><Clock className="h-3 w-3"/> Output Tokens</span>
                <span className="font-mono">{formatNumber(cost.totalOutputTokens)}</span>
              </div>
              <div className="flex items-center justify-between text-sm pt-2 border-t border-border mt-2">
                <span className="text-foreground font-medium">Total Requests</span>
                <span className="font-mono text-primary">{formatNumber(cost.requestCount)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
