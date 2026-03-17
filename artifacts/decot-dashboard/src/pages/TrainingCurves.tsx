import { useGetTrainingCurve } from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { LoadingScreen } from "@/components/ui/loading-screen"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"

export default function TrainingCurves() {
  const { data: curveData, isLoading } = useGetTrainingCurve({ query: { refetchInterval: 30000 } })

  if (isLoading) return <LoadingScreen />

  // If no data yet, show empty state
  const hasData = curveData && curveData.length > 0;

  return (
    <div className="space-y-6 h-full flex flex-col animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-glow">Training Dynamics</h1>
        <p className="text-muted-foreground mt-1">LoRA fine-tuning loss curve and learning rate schedule.</p>
      </div>

      <Card className="glass-panel flex-1 flex flex-col min-h-[500px]">
        <CardHeader>
          <CardTitle>Training Loss</CardTitle>
          <CardDescription>Cross-entropy loss over training steps. Updated every 30 seconds during Phase 4.</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 relative">
          {!hasData ? (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground font-mono text-sm border border-dashed border-border/50 rounded-lg m-6">
              NO_TRAINING_DATA_YET
            </div>
          ) : (
            <div className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={curveData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis 
                    dataKey="step" 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    domain={['auto', 'auto']}
                    name="Loss"
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '8px',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                    }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }}/>
                  <Line 
                    type="monotone" 
                    dataKey="loss" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 6, fill: "hsl(var(--primary))", stroke: "hsl(var(--background))", strokeWidth: 2 }}
                    name="Training Loss"
                    animationDuration={1000}
                  />
                  {/* Optional secondary line for learning rate if present and non-null in data */}
                  {curveData[0]?.learningRate !== undefined && curveData[0]?.learningRate !== null && (
                    <Line 
                      type="monotone" 
                      dataKey="learningRate" 
                      stroke="hsl(var(--accent))" 
                      strokeWidth={2}
                      dot={false}
                      yAxisId="right"
                      name="Learning Rate"
                      opacity={0.5}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
