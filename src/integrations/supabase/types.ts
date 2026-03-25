export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      approvals: {
        Row: {
          created_at: string
          estado: Database["public"]["Enums"]["approval_status"]
          id: string
          nota: string | null
          paso: Database["public"]["Enums"]["approval_step"]
          task_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          estado: Database["public"]["Enums"]["approval_status"]
          id?: string
          nota?: string | null
          paso: Database["public"]["Enums"]["approval_step"]
          task_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          estado?: Database["public"]["Enums"]["approval_status"]
          id?: string
          nota?: string | null
          paso?: Database["public"]["Enums"]["approval_step"]
          task_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approvals_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          activo: boolean
          cliente_id: string | null
          created_at: string
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          cliente_id?: string | null
          created_at?: string
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          cliente_id?: string | null
          created_at?: string
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "brands_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_brands: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_brands_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          activo: boolean
          created_at: string
          email_contacto: string | null
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          email_contacto?: string | null
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          email_contacto?: string | null
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          comentario: string
          created_at: string
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          comentario: string
          created_at?: string
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          comentario?: string
          created_at?: string
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      deliverable_types: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      deliverables: {
        Row: {
          aprobado_en: string | null
          aprobado_por: string | null
          created_at: string
          estado: Database["public"]["Enums"]["deliverable_status"]
          id: string
          link_final: string | null
          task_id: string
          tipo_entregable_id: string | null
          updated_at: string
          version: string
        }
        Insert: {
          aprobado_en?: string | null
          aprobado_por?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["deliverable_status"]
          id?: string
          link_final?: string | null
          task_id: string
          tipo_entregable_id?: string | null
          updated_at?: string
          version?: string
        }
        Update: {
          aprobado_en?: string | null
          aprobado_por?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["deliverable_status"]
          id?: string
          link_final?: string | null
          task_id?: string
          tipo_entregable_id?: string | null
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliverables_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_tipo_entregable_id_fkey"
            columns: ["tipo_entregable_id"]
            isOneToOne: false
            referencedRelation: "deliverable_types"
            referencedColumns: ["id"]
          },
        ]
      }
      desks: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      files: {
        Row: {
          created_at: string
          deliverable_id: string | null
          id: string
          nombre_archivo: string
          subido_por: string | null
          task_id: string | null
          url_storage: string
        }
        Insert: {
          created_at?: string
          deliverable_id?: string | null
          id?: string
          nombre_archivo: string
          subido_por?: string | null
          task_id?: string | null
          url_storage: string
        }
        Update: {
          created_at?: string
          deliverable_id?: string | null
          id?: string
          nombre_archivo?: string
          subido_por?: string | null
          task_id?: string | null
          url_storage?: string
        }
        Relationships: [
          {
            foreignKeyName: "files_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "deliverables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          leida: boolean
          mensaje: string
          task_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          leida?: boolean
          mensaje: string
          task_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          leida?: boolean
          mensaje?: string
          task_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          activo: boolean
          created_at: string
          email: string
          id: string
          nombre: string
          rol: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          activo?: boolean
          created_at?: string
          email: string
          id: string
          nombre: string
          rol?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          activo?: boolean
          created_at?: string
          email?: string
          id?: string
          nombre?: string
          rol?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      task_types: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          brand_id: string
          cantidad_entregables: number
          check_done: boolean
          created_at: string
          departamento: string | null
          desk_id: string | null
          detalle: string | null
          enlaces: string[] | null
          estado: Database["public"]["Enums"]["task_status"]
          estado_envio: Database["public"]["Enums"]["send_status"]
          fecha_entrega: string
          fecha_inicio: string | null
          id: string
          prioridad: Database["public"]["Enums"]["task_priority"]
          qa_checklist: Json | null
          responsable_user_id: string | null
          tiempo_trabajado: number
          timer_activo: boolean
          timer_inicio: string | null
          titulo_tarea: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          cantidad_entregables?: number
          check_done?: boolean
          created_at?: string
          departamento?: string | null
          desk_id?: string | null
          detalle?: string | null
          enlaces?: string[] | null
          estado?: Database["public"]["Enums"]["task_status"]
          estado_envio?: Database["public"]["Enums"]["send_status"]
          fecha_entrega: string
          fecha_inicio?: string | null
          id?: string
          prioridad?: Database["public"]["Enums"]["task_priority"]
          qa_checklist?: Json | null
          responsable_user_id?: string | null
          tiempo_trabajado?: number
          timer_activo?: boolean
          timer_inicio?: string | null
          titulo_tarea: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          cantidad_entregables?: number
          check_done?: boolean
          created_at?: string
          departamento?: string | null
          desk_id?: string | null
          detalle?: string | null
          enlaces?: string[] | null
          estado?: Database["public"]["Enums"]["task_status"]
          estado_envio?: Database["public"]["Enums"]["send_status"]
          fecha_entrega?: string
          fecha_inicio?: string | null
          id?: string
          prioridad?: Database["public"]["Enums"]["task_priority"]
          qa_checklist?: Json | null
          responsable_user_id?: string | null
          tiempo_trabajado?: number
          timer_activo?: boolean
          timer_inicio?: string | null
          titulo_tarea?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_desk_id_fkey"
            columns: ["desk_id"]
            isOneToOne: false
            referencedRelation: "desks"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      user_can_access_brand: {
        Args: { _brand_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "ejecutivo" | "equipo" | "cliente"
      approval_status: "aprobado" | "rechazado"
      approval_step: "qa" | "cliente" | "ops"
      deliverable_status:
        | "borrador"
        | "en_revision"
        | "aprobado"
        | "rechazado"
        | "final"
      send_status: "pendiente" | "enviado"
      task_priority: "alta" | "media" | "baja"
      task_status:
        | "backlog"
        | "en_proceso"
        | "en_revision"
        | "aprobado"
        | "entregado"
        | "bloqueado"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "ejecutivo", "equipo", "cliente"],
      approval_status: ["aprobado", "rechazado"],
      approval_step: ["qa", "cliente", "ops"],
      deliverable_status: [
        "borrador",
        "en_revision",
        "aprobado",
        "rechazado",
        "final",
      ],
      send_status: ["pendiente", "enviado"],
      task_priority: ["alta", "media", "baja"],
      task_status: [
        "backlog",
        "en_proceso",
        "en_revision",
        "aprobado",
        "entregado",
        "bloqueado",
      ],
    },
  },
} as const
