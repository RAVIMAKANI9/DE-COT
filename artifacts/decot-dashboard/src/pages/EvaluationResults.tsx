import { useGetEvaluationMetrics } from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { LoadingScreen } from "@/components/ui/loading-screen"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, ReferenceLine } from "recharts"
import { formatPercent } from "@/lib/utils"
import { format } from "date-fns"

export default function EvaluationResults() {
  const { data: metrics, isLoading } = useGetEvaluationMetrics({ query: { refetchInterval: 30000 } })

  if (isLoading) return <LoadingScreen />

  const hasData = metrics && metrics.length > 0;

  return (
    <div className="space-y-6 h-full flex flex-col animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-glow">Evaluation Metrics</h1>
        <p className="text-muted-foreground mt-1">Accuracy against baseline paper targets.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Chart Area */}
        <Card className="glass-panel lg:col-span-2 flex flex-col">
          <CardHeader>
            <CardTitle>Benchmark Accuracy vs Target</CardTitle>
            <CardDescription>Comparing fine-tuned Llama-2-7B against DE-COT paper baselines</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[400px]">
            {!hasData ? (
               <div className="h-full flex items-center justify-center text-muted-foreground font-mono text-sm border border-dashed border-border/50 rounded-lg">
                 AWAITING_EVALUATION_PHASE
               </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={metrics}
                  margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis 
                    dataKey="benchmark" 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => val.toUpperCase()}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => `${val * 100}%`}
                    domain={[0, 1]}
                  />
                  <Tooltip 
                    cursor={{ fill: 'hsl(var(--muted)/0.2)' }}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number) => formatPercent(value)}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Bar dataKey="accuracy" name="Achieved Accuracy" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={60}>
                    {metrics.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.accuracy >= entry.targetAccuracy ? 'hsl(var(--success))' : 'hsl(var(--primary))'} />
                    ))}
                  </Bar>
                  <Bar dataKey="targetAccuracy" name="Paper Target" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} maxBarSize={60} opacity={0.6} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Detailed Stats Area */}
        <div className="space-y-6">
          {metrics?.map((m) => (
            <Card key={m.benchmark} className="glass-panel">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground flex justify-between">
                  {m.benchmark}
                  <span className={`px-2 py-0.5 rounded text-xs ${m.accuracy >= m.targetAccuracy ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}`}>
                    {m.accuracy >= m.targetAccuracy ? 'PASSED' : 'BELOW TARGET'}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-3xl font-bold text-foreground">
                      {formatPercent(m.accuracy)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Target: {formatPercent(m.targetAccuracy)}
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div>Samples: {m.sampleCount}</div>
                    {m.evaluatedAt && <div>{format(new Date(m.evaluatedAt), 'MMM d, HH:mm')}</div>}
                  </div>
                </div>
                {/* Visual diff bar */}
                <div className="mt-4 h-1.5 w-full bg-secondary rounded-full overflow-hidden relative">
                   <div 
                     className="absolute top-0 left-0 bottom-0 bg-accent/50" 
                     style={{ width: `${m.targetAccuracy * 100}%` }} 
                   />
                   <div 
                     className={`absolute top-0 left-0 bottom-0 ${m.accuracy >= m.targetAccuracy ? 'bg-success' : 'bg-primary'} z-10`} 
                     style={{ width: `${m.accuracy * 100}%` }} 
                   />
                   <div 
                     className="absolute top-0 bottom-0 bg-foreground z-20 w-0.5" 
                     style={{ left: `${m.targetAccuracy * 100}%` }} 
                   />
                </div>
              </CardContent>
            </Card>
          ))}
          {!hasData && (
             <Card className="glass-panel border-dashed border-border/50">
               <CardContent className="p-6 text-center text-muted-foreground text-sm font-mono">
                 Waiting for model evaluation...
               </CardContent>
             </Card>
          )}
        </div>
      </div>
    </div>
  )
}
