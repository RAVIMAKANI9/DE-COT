import { Switch, Route, Router as WouterRouter } from "wouter"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "@/components/ui/toaster"
import { TooltipProvider } from "@/components/ui/tooltip"

import { Shell } from "@/components/layout/Shell"
import Dashboard from "@/pages/Dashboard"
import PipelineMonitor from "@/pages/PipelineMonitor"
import TrainingCurves from "@/pages/TrainingCurves"
import EvaluationResults from "@/pages/EvaluationResults"
import LiveInference from "@/pages/LiveInference"
import CostTracker from "@/pages/CostTracker"
import NotFound from "@/pages/not-found"

// Setup global query client with sensible defaults for dashboard
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
})

function Router() {
  return (
    <Shell>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/pipeline" component={PipelineMonitor} />
        <Route path="/training" component={TrainingCurves} />
        <Route path="/evaluation" component={EvaluationResults} />
        <Route path="/inference" component={LiveInference} />
        <Route path="/cost" component={CostTracker} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  )
}

export default App;
