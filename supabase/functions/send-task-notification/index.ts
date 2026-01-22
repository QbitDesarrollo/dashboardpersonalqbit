import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface TaskNotificationRequest {
  taskTitle: string;
  brandName: string;
  fechaEntrega: string;
  prioridad: string;
  recipientEmail: string;
  recipientName: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      taskTitle, 
      brandName, 
      fechaEntrega, 
      prioridad, 
      recipientEmail,
      recipientName 
    }: TaskNotificationRequest = await req.json();

    const prioridadColor = prioridad === 'alta' ? '#EF4444' : prioridad === 'media' ? '#F59E0B' : '#22C55E';
    const prioridadLabel = prioridad.charAt(0).toUpperCase() + prioridad.slice(1);

    const emailResponse = await resend.emails.send({
      from: "TIUSDEI Portal <onboarding@resend.dev>",
      to: [recipientEmail],
      subject: `Nueva Tarea Asignada: ${taskTitle}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a; color: #e2e8f0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background-color: #1e293b; border-radius: 12px; overflow: hidden; }
            .header { background: linear-gradient(135deg, #14b8a6, #0d9488); padding: 24px; text-align: center; }
            .header h1 { margin: 0; color: white; font-size: 24px; }
            .content { padding: 24px; }
            .task-title { font-size: 20px; font-weight: bold; color: #f1f5f9; margin-bottom: 16px; }
            .detail-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #334155; }
            .detail-label { color: #94a3b8; }
            .detail-value { color: #f1f5f9; font-weight: 500; }
            .priority-badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: bold; color: white; background-color: ${prioridadColor}; }
            .footer { padding: 16px 24px; text-align: center; color: #64748b; font-size: 12px; border-top: 1px solid #334155; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Nueva Tarea Asignada</h1>
            </div>
            <div class="content">
              <p>Hola ${recipientName},</p>
              <p>Se te ha asignado una nueva tarea:</p>
              
              <div class="task-title">${taskTitle}</div>
              
              <div class="detail-row">
                <span class="detail-label">Marca</span>
                <span class="detail-value">${brandName}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Fecha de Entrega</span>
                <span class="detail-value">${new Date(fechaEntrega).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Prioridad</span>
                <span class="priority-badge">${prioridadLabel}</span>
              </div>
              
              <p style="margin-top: 24px;">Por favor, revisa el portal para más detalles.</p>
            </div>
            <div class="footer">
              TIUSDEI Portal - Sistema de Gestión de Tareas
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log("Task notification email sent successfully:", emailResponse);

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-task-notification function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
