import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Tasks from "./pages/Tasks";
import Deliverables from "./pages/Deliverables";
import Files from "./pages/Files";
import ClientPortal from "./pages/ClientPortal";
import AdminUsers from "./pages/admin/Users";
import AdminClients from "./pages/admin/Clients";
import AdminBrands from "./pages/admin/Brands";
import AdminDesks from "./pages/admin/Desks";
import AdminConfig from "./pages/admin/Config";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <AppLayout><Dashboard /></AppLayout>
              </ProtectedRoute>
            } />
            
            <Route path="/tareas" element={
              <ProtectedRoute allowedRoles={['admin', 'ops', 'equipo']}>
                <AppLayout><Tasks /></AppLayout>
              </ProtectedRoute>
            } />
            
            <Route path="/entregables" element={
              <ProtectedRoute allowedRoles={['admin', 'ops', 'equipo']}>
                <AppLayout><Deliverables /></AppLayout>
              </ProtectedRoute>
            } />
            
            <Route path="/archivos" element={
              <ProtectedRoute allowedRoles={['admin', 'ops', 'equipo']}>
                <AppLayout><Files /></AppLayout>
              </ProtectedRoute>
            } />
            
            <Route path="/cliente" element={
              <ProtectedRoute allowedRoles={['cliente']}>
                <AppLayout><ClientPortal /></AppLayout>
              </ProtectedRoute>
            } />
            
            <Route path="/admin/usuarios" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AppLayout><AdminUsers /></AppLayout>
              </ProtectedRoute>
            } />
            
            <Route path="/admin/clientes" element={
              <ProtectedRoute allowedRoles={['admin', 'ops']}>
                <AppLayout><AdminClients /></AppLayout>
              </ProtectedRoute>
            } />
            
            <Route path="/admin/marcas" element={
              <ProtectedRoute allowedRoles={['admin', 'ops']}>
                <AppLayout><AdminBrands /></AppLayout>
              </ProtectedRoute>
            } />
            
            <Route path="/admin/mesas" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AppLayout><AdminDesks /></AppLayout>
              </ProtectedRoute>
            } />
            
            <Route path="/admin/configuracion" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AppLayout><AdminConfig /></AppLayout>
              </ProtectedRoute>
            } />
            
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
