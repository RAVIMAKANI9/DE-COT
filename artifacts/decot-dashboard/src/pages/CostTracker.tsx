import { useGetPipelineCost } from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { LoadingScreen } from "@/components/ui/loading-screen"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts"
import { formatCurrency, formatNumber, PHASE_NAMES } from "@/lib/utils"
import { DollarSign, Layers, Hash } from "lucide-react"

const COLORS = [
  'hsl(var(--primary))', 
  'hsl(var(--accent))', 
  'hsl(var(--success))', 
  'hsl(var(--warning))', 
  'hsl(var(--destructive))'
]

export default function CostTracker() {
  const { data: cost, isLoading } = useGetPipelineCost({ query: { refetchInterval: 30000 } })

  if (isLoading || !cost) return <LoadingScreen />

  // Format data for PieChart, filtering out zero-cost phases
  const chartData = cost.costByPhase
    .filter(p => p.costUsd > 0)
    .map(p => ({
      name: PHASE_NAMES[p.phase] || `Phase ${p.phase}`,
      value: p.costUsd
    }))

  const budget = 120;
  const costPercentage = (cost.totalCostUsd / budget) * 100;

  return (
    <div className="space-y-6 h-full flex flex-col animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-glow">OpenAI Cost Tracker</h1>
        <p className="text-muted-foreground mt-1">Monitoring GPT-4 API usage across pipeline phases.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card className="glass-panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Total Spent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-foreground">{formatCurrency(cost.totalCostUsd)}</div>
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Budget Progress</span>
                <span>{formatCurrency(budget)} Limit</span>
              </div>
              <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                <div 
                  className={`h-full ${costPercentage > 90 ? 'bg-destructive' : costPercentage > 75 ? 'bg-warning' : 'bg-primary'} transition-all`} 
                  style={{ width: `${Math.min(costPercentage, 100)}%` }} 
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Layers className="h-4 w-4" /> Token Usage
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-2xl font-bold text-accent">{formatNumber(cost.totalInputTokens)}</div>
              <div className="text-xs text-muted-foreground">Input Tokens</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-primary">{formatNumber(cost.totalOutputTokens)}</div>
              <div className="text-xs text-muted-foreground">Output Tokens</div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Hash className="h-4 w-4" /> Total Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-success">{formatNumber(cost.requestCount)}</div>
            <div className="mt-4 text-xs text-muted-foreground leading-relaxed">
              API calls primarily occur during Phase 2 (CoT Generation) and are tracked persistently across restarts.
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-panel flex-1 min-h-[400px]">
        <CardHeader>
          <CardTitle>Cost Breakdown by Phase</CardTitle>
          <CardDescription>Distribution of API spend across the pipeline</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px]">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={120}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
             <div className="h-full flex items-center justify-center text-muted-foreground font-mono text-sm border border-dashed border-border/50 rounded-lg">
               NO_API_COSTS_RECORDED
             </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
