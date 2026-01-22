-- Fix the permissive notifications INSERT policy
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;

CREATE POLICY "Authenticated users can create notifications" ON public.notifications
  FOR INSERT TO authenticated 
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'ops') OR
    public.has_role(auth.uid(), 'equipo')
  );