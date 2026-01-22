-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'ops', 'equipo', 'cliente');

-- Create priority enum
CREATE TYPE public.task_priority AS ENUM ('alta', 'media', 'baja');

-- Create task_status enum
CREATE TYPE public.task_status AS ENUM ('backlog', 'en_proceso', 'en_revision', 'aprobado', 'entregado', 'bloqueado');

-- Create deliverable_status enum
CREATE TYPE public.deliverable_status AS ENUM ('borrador', 'en_revision', 'aprobado', 'rechazado', 'final');

-- Create send_status enum
CREATE TYPE public.send_status AS ENUM ('pendiente', 'enviado');

-- Create approval_step enum
CREATE TYPE public.approval_step AS ENUM ('qa', 'cliente', 'ops');

-- Create approval_status enum
CREATE TYPE public.approval_status AS ENUM ('aprobado', 'rechazado');

-- 1) PROFILES table (extends auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL,
  rol public.app_role NOT NULL DEFAULT 'equipo',
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) USER_ROLES table (for RLS security definer functions)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- 3) CLIENTS table
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  email_contacto TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4) BRANDS table
CREATE TABLE public.brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  cliente_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5) DESKS table
CREATE TABLE public.desks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6) TASK_TYPES table
CREATE TABLE public.task_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7) DELIVERABLE_TYPES table
CREATE TABLE public.deliverable_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8) TASKS table
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_done BOOLEAN NOT NULL DEFAULT false,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  desk_id UUID REFERENCES public.desks(id) ON DELETE SET NULL,
  titulo_tarea TEXT NOT NULL,
  detalle TEXT,
  cantidad_entregables INTEGER NOT NULL DEFAULT 1,
  responsable_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  departamento TEXT,
  prioridad public.task_priority NOT NULL DEFAULT 'media',
  estado public.task_status NOT NULL DEFAULT 'backlog',
  fecha_inicio DATE,
  fecha_entrega DATE NOT NULL,
  enlaces TEXT[],
  estado_envio public.send_status NOT NULL DEFAULT 'pendiente',
  qa_checklist JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9) DELIVERABLES table
CREATE TABLE public.deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  tipo_entregable_id UUID REFERENCES public.deliverable_types(id) ON DELETE SET NULL,
  version TEXT NOT NULL DEFAULT 'v1',
  estado public.deliverable_status NOT NULL DEFAULT 'borrador',
  link_final TEXT,
  aprobado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  aprobado_en TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10) FILES table
CREATE TABLE public.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  deliverable_id UUID REFERENCES public.deliverables(id) ON DELETE CASCADE,
  nombre_archivo TEXT NOT NULL,
  url_storage TEXT NOT NULL,
  subido_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11) COMMENTS table
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comentario TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12) APPROVALS table
CREATE TABLE public.approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  paso public.approval_step NOT NULL,
  estado public.approval_status NOT NULL,
  nota TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13) CLIENT_BRANDS junction (for client users to see specific brands)
CREATE TABLE public.client_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, brand_id)
);

-- 14) NOTIFICATIONS table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  mensaje TEXT NOT NULL,
  leida BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply triggers
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_deliverables_updated_at
  BEFORE UPDATE ON public.deliverables
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create profile automatically on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nombre, email, rol)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'rol')::public.app_role, 'equipo')
  );
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    COALESCE((NEW.raw_user_meta_data->>'rol')::public.app_role, 'equipo')
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Get user role function
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- Check if user can access brand (for clients)
CREATE OR REPLACE FUNCTION public.user_can_access_brand(_user_id UUID, _brand_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE 
      WHEN public.get_user_role(_user_id) IN ('admin', 'ops', 'equipo') THEN true
      WHEN public.get_user_role(_user_id) = 'cliente' THEN 
        EXISTS (SELECT 1 FROM public.client_brands WHERE user_id = _user_id AND brand_id = _brand_id)
      ELSE false
    END
$$;

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliverable_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- PROFILES policies
CREATE POLICY "Users can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid());

CREATE POLICY "Admin can manage profiles" ON public.profiles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- USER_ROLES policies
CREATE POLICY "Admin can manage roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own role" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- CLIENTS policies
CREATE POLICY "Admin/OPS can manage clients" ON public.clients
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops')
  );

CREATE POLICY "Team can view clients" ON public.clients
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'equipo')
  );

-- BRANDS policies
CREATE POLICY "Admin/OPS can manage brands" ON public.brands
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops')
  );

CREATE POLICY "Team can view brands" ON public.brands
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'equipo'));

CREATE POLICY "Client can view assigned brands" ON public.brands
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'cliente') AND 
    public.user_can_access_brand(auth.uid(), id)
  );

-- DESKS policies
CREATE POLICY "Admin can manage desks" ON public.desks
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "All authenticated can view desks" ON public.desks
  FOR SELECT TO authenticated USING (true);

-- TASK_TYPES policies
CREATE POLICY "Admin can manage task_types" ON public.task_types
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "All authenticated can view task_types" ON public.task_types
  FOR SELECT TO authenticated USING (true);

-- DELIVERABLE_TYPES policies
CREATE POLICY "Admin can manage deliverable_types" ON public.deliverable_types
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "All authenticated can view deliverable_types" ON public.deliverable_types
  FOR SELECT TO authenticated USING (true);

-- TASKS policies
CREATE POLICY "Admin/OPS full access to tasks" ON public.tasks
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops')
  );

CREATE POLICY "Team can view all tasks" ON public.tasks
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'equipo'));

CREATE POLICY "Team can update own tasks" ON public.tasks
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'equipo') AND responsable_user_id = auth.uid()
  );

CREATE POLICY "Team can create tasks" ON public.tasks
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'equipo'));

CREATE POLICY "Client can view tasks of assigned brands" ON public.tasks
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'cliente') AND 
    public.user_can_access_brand(auth.uid(), brand_id)
  );

-- DELIVERABLES policies
CREATE POLICY "Admin/OPS full access to deliverables" ON public.deliverables
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops')
  );

CREATE POLICY "Team can manage deliverables" ON public.deliverables
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'equipo'));

CREATE POLICY "Client can view approved deliverables" ON public.deliverables
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'cliente') AND 
    estado IN ('aprobado', 'final') AND
    EXISTS (
      SELECT 1 FROM public.tasks t 
      WHERE t.id = task_id AND public.user_can_access_brand(auth.uid(), t.brand_id)
    )
  );

-- FILES policies
CREATE POLICY "Admin/OPS/Team can manage files" ON public.files
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'ops') OR 
    public.has_role(auth.uid(), 'equipo')
  );

CREATE POLICY "Client can view files of approved deliverables" ON public.files
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'cliente') AND
    (
      (deliverable_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.deliverables d
        JOIN public.tasks t ON t.id = d.task_id
        WHERE d.id = deliverable_id 
        AND d.estado IN ('aprobado', 'final')
        AND public.user_can_access_brand(auth.uid(), t.brand_id)
      ))
    )
  );

-- COMMENTS policies
CREATE POLICY "Admin/OPS/Team can manage comments" ON public.comments
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'ops') OR 
    public.has_role(auth.uid(), 'equipo')
  );

CREATE POLICY "Client can view comments on their brand tasks" ON public.comments
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'cliente') AND
    EXISTS (
      SELECT 1 FROM public.tasks t 
      WHERE t.id = task_id AND public.user_can_access_brand(auth.uid(), t.brand_id)
    )
  );

-- APPROVALS policies
CREATE POLICY "Admin/OPS can manage approvals" ON public.approvals
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops')
  );

CREATE POLICY "Team can view approvals" ON public.approvals
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'equipo'));

-- CLIENT_BRANDS policies
CREATE POLICY "Admin can manage client_brands" ON public.client_brands
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Client can view own brand assignments" ON public.client_brands
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- NOTIFICATIONS policies
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "System can create notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (true);

-- Create storage bucket for files
INSERT INTO storage.buckets (id, name, public) VALUES ('task-files', 'task-files', true);

-- Storage policies
CREATE POLICY "Authenticated users can upload files" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'task-files');

CREATE POLICY "Authenticated users can view files" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'task-files');

CREATE POLICY "Users can delete own files" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'task-files' AND auth.uid()::text = (storage.foldername(name))[1]
  );