-- Add time tracking columns to tasks table
ALTER TABLE public.tasks
ADD COLUMN tiempo_trabajado integer NOT NULL DEFAULT 0,
ADD COLUMN timer_activo boolean NOT NULL DEFAULT false,
ADD COLUMN timer_inicio timestamp with time zone;

COMMENT ON COLUMN public.tasks.tiempo_trabajado IS 'Total seconds worked on the task';
COMMENT ON COLUMN public.tasks.timer_activo IS 'Whether the timer is currently running';
COMMENT ON COLUMN public.tasks.timer_inicio IS 'When the timer was started';