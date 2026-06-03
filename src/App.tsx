import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { GlobalFilterProvider } from "@/contexts/GlobalFilterContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { FaviconUpdater } from "@/components/FaviconUpdater";
import { Loader2 } from "lucide-react";

// Lazy load all pages for code splitting
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Tasks = lazy(() => import("./pages/Tasks"));
const TasksKanban = lazy(() => import("./pages/TasksKanban"));
const PipelineBoard = lazy(() => import("./pages/PipelineBoard"));
const TasksGantt = lazy(() => import("./pages/TasksGantt"));
const TasksCalendar = lazy(() => import("./pages/TasksCalendar"));
const TasksWorkload = lazy(() => import("./pages/TasksWorkload"));
const TimeTracking = lazy(() => import("./pages/TimeTracking"));
const Reports = lazy(() => import("./pages/Reports"));
const Cumplimiento = lazy(() => import("./pages/Cumplimiento"));
const Mcp = lazy(() => import("./pages/Mcp"));
const Incidencias = lazy(() => import("./pages/Incidencias"));
const Novedades = lazy(() => import("./pages/Novedades"));
const Scrum = lazy(() => import("./pages/Scrum"));
const ScrumBacklog = lazy(() => import("./pages/ScrumBacklog"));
const ScrumBoard = lazy(() => import("./pages/ScrumBoard"));
const ScrumFeatures = lazy(() => import("./pages/ScrumFeatures"));
const ReleasePlanning = lazy(() => import("./pages/ReleasePlanning"));
const ScrumTasks = lazy(() => import("./pages/ScrumTasks"));
const ScrumGerencial = lazy(() => import("./pages/ScrumGerencial"));
const ScrumDaily = lazy(() => import("./pages/ScrumDaily"));
const SprintPlanning = lazy(() => import("./pages/SprintPlanning"));
const Deliverables = lazy(() => import("./pages/Deliverables"));
const DailyMesas = lazy(() => import("./pages/DailyMesas"));
const Files = lazy(() => import("./pages/Files"));
const ClientPortal = lazy(() => import("./pages/ClientPortal"));
const AdminUsers = lazy(() => import("./pages/admin/Users"));
const AdminClients = lazy(() => import("./pages/admin/Clients"));
const AdminBrands = lazy(() => import("./pages/admin/Brands"));
const AdminDesks = lazy(() => import("./pages/admin/Desks"));
const AdminConfig = lazy(() => import("./pages/admin/Config"));
const AdminErrorLogs = lazy(() => import("./pages/admin/ErrorLogs"));
const Templates = lazy(() => import("./pages/Templates"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PublicFormView = lazy(() => import("./pages/PublicFormView"));
const ClientBoardPublic = lazy(() => import("./pages/ClientBoardPublic"));
const Clientes = lazy(() => import("./pages/Clientes"));
const PublicForms = lazy(() => import("./pages/admin/PublicForms"));
const Automations = lazy(() => import("./pages/admin/Automations"));
const Integrations = lazy(() => import("./pages/admin/Integrations"));
const GoogleAuthSuccess = lazy(() => import("./pages/GoogleAuthSuccess"));
const MiPerfil = lazy(() => import("./pages/MiPerfil"));
const CustomDashboard = lazy(() => import("./pages/CustomDashboard"));
const TeamMonitor = lazy(() => import("./pages/admin/TeamMonitor"));
const AdminWhatsApp = lazy(() => import("./pages/admin/WhatsApp"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <FaviconUpdater />
      <Toaster />
      <Sonner />
      <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <GlobalFilterProvider>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/form/:slug" element={<PublicFormView />} />
            <Route path="/c/:token" element={<ClientBoardPublic />} />
            <Route path="/auth/google/success" element={<GoogleAuthSuccess />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            <Route path="/dashboard" element={
              <ProtectedRoute>
                <AppLayout><Dashboard /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/perfil" element={
              <ProtectedRoute>
                <AppLayout><MiPerfil /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/mi-dashboard" element={
              <ProtectedRoute>
                <AppLayout><CustomDashboard /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/tareas" element={
              <ProtectedRoute allowedRoles={['admin', 'ejecutivo', 'equipo']}>
                <AppLayout><Tasks /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/tareas/kanban" element={
              <ProtectedRoute allowedRoles={['admin', 'ejecutivo', 'equipo']}>
                <AppLayout><TasksKanban /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/tareas/pipeline" element={
              <ProtectedRoute allowedRoles={['admin', 'ejecutivo', 'equipo']}>
                <AppLayout><PipelineBoard /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/tareas/gantt" element={
              <ProtectedRoute allowedRoles={['admin', 'ejecutivo', 'equipo']}>
                <AppLayout><TasksGantt /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/tareas/calendario" element={
              <ProtectedRoute allowedRoles={['admin', 'ejecutivo', 'equipo']}>
                <AppLayout><TasksCalendar /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/tareas/workload" element={
              <ProtectedRoute allowedRoles={['admin', 'ejecutivo', 'equipo']}>
                <AppLayout><TasksWorkload /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/tareas/tiempo" element={
              <ProtectedRoute>
                <AppLayout><TimeTracking /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/informes" element={
              <ProtectedRoute allowedRoles={['admin', 'ejecutivo', 'equipo']}>
                <AppLayout><Reports /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/informes/cumplimiento" element={
              <ProtectedRoute allowedRoles={['admin', 'ejecutivo', 'equipo']}>
                <AppLayout><Cumplimiento /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/mcp" element={
              <ProtectedRoute allowedRoles={['admin', 'ejecutivo', 'equipo']}>
                <AppLayout><Mcp /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/incidencias" element={
              <ProtectedRoute allowedRoles={['admin', 'ejecutivo']}>
                <AppLayout><Incidencias /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/novedades" element={
              <ProtectedRoute allowedRoles={['admin', 'ejecutivo']}>
                <AppLayout><Novedades /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/scrum" element={
              <ProtectedRoute allowedRoles={['admin', 'ejecutivo', 'equipo']}>
                <AppLayout><Scrum /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/scrum/features" element={
              <ProtectedRoute allowedRoles={['admin', 'ejecutivo', 'equipo']}>
                <AppLayout><ScrumFeatures /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/scrum/backlog" element={
              <ProtectedRoute allowedRoles={['admin', 'ejecutivo', 'equipo']}>
                <AppLayout><ScrumBacklog /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/scrum/board" element={
              <ProtectedRoute allowedRoles={['admin', 'ejecutivo', 'equipo']}>
                <AppLayout><ScrumBoard /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/scrum/releases" element={
              <ProtectedRoute allowedRoles={['admin', 'ejecutivo', 'equipo']}>
                <AppLayout><ReleasePlanning /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/scrum/tasks" element={
              <ProtectedRoute allowedRoles={['admin', 'ejecutivo', 'equipo']}>
                <AppLayout><ScrumTasks /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/scrum/planning" element={
              <ProtectedRoute allowedRoles={['admin', 'ejecutivo', 'equipo']}>
                <AppLayout><SprintPlanning /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/scrum/daily" element={
              <ProtectedRoute allowedRoles={['admin', 'ejecutivo', 'equipo']}>
                <AppLayout><ScrumDaily /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/scrum/gerencial" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AppLayout><ScrumGerencial /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/entregables" element={
              <ProtectedRoute allowedRoles={['admin', 'ejecutivo', 'equipo']}>
                <AppLayout><Deliverables /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/daily-mesas" element={
              <ProtectedRoute allowedRoles={['admin', 'ejecutivo']}>
                <AppLayout><DailyMesas /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/plantillas" element={
              <ProtectedRoute allowedRoles={['admin', 'ejecutivo', 'equipo']}>
                <AppLayout><Templates /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/archivos" element={
              <ProtectedRoute allowedRoles={['admin', 'ejecutivo', 'equipo']}>
                <AppLayout><Files /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/cliente" element={
              <ProtectedRoute allowedRoles={['cliente']}>
                <AppLayout><ClientPortal /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/clientes" element={
              <ProtectedRoute allowedRoles={['admin', 'ejecutivo']}>
                <AppLayout><Clientes /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/admin/usuarios" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AppLayout><AdminUsers /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/admin/clientes" element={
              <ProtectedRoute allowedRoles={['admin', 'ejecutivo']}>
                <AppLayout><AdminClients /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/admin/marcas" element={
              <ProtectedRoute allowedRoles={['admin', 'ejecutivo']}>
                <AppLayout><AdminBrands /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/admin/mesas" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AppLayout><AdminDesks /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/admin/integraciones" element={
              <ProtectedRoute allowedRoles={['admin', 'ejecutivo']}>
                <AppLayout><Integrations /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/admin/errores" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AppLayout><AdminErrorLogs /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/admin/automatizaciones" element={
              <ProtectedRoute allowedRoles={['admin', 'ejecutivo']}>
                <AppLayout><Automations /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/admin/formularios" element={
              <ProtectedRoute allowedRoles={['admin', 'ejecutivo']}>
                <AppLayout><PublicForms /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/admin/configuracion" element={
              <ProtectedRoute allowedRoles={['admin', 'ejecutivo']}>
                <AppLayout><AdminConfig /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/admin/monitor" element={
              <ProtectedRoute allowedRoles={['admin', 'ejecutivo']}>
                <AppLayout><TeamMonitor /></AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/admin/whatsapp" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AppLayout><AdminWhatsApp /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </GlobalFilterProvider>
      </AuthProvider>
    </BrowserRouter>
      </ErrorBoundary>
  </TooltipProvider>
</QueryClientProvider>
);

export default App;
