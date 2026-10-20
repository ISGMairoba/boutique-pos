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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor: string | null
          after: Json | null
          at: string
          before: Json | null
          business_id: string
          id: number
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          business_id: string
          id?: never
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          business_id?: string
          id?: never
          record_id?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_settings: {
        Row: {
          business_id: string
          manager_editable: string[]
          seq: number
          settings: Json
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          business_id: string
          manager_editable?: string[]
          seq?: number
          settings?: Json
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          business_id?: string
          manager_editable?: string[]
          seq?: number
          settings?: Json
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "business_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_settings_history: {
        Row: {
          business_id: string
          changed_at: string
          changed_by: string | null
          id: number
          manager_editable: string[]
          settings: Json
          version: number
        }
        Insert: {
          business_id: string
          changed_at?: string
          changed_by?: string | null
          id?: never
          manager_editable: string[]
          settings: Json
          version: number
        }
        Update: {
          business_id?: string
          changed_at?: string
          changed_by?: string | null
          id?: never
          manager_editable?: string[]
          settings?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "business_settings_history_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          id: string
          locale: string
          name: string
          preset_key: string
          receipt_prefix: string
          seq: number
          time_zone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          locale?: string
          name: string
          preset_key: string
          receipt_prefix: string
          seq?: number
          time_zone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          locale?: string
          name?: string
          preset_key?: string
          receipt_prefix?: string
          seq?: number
          time_zone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "businesses_preset_key_fkey"
            columns: ["preset_key"]
            isOneToOne: false
            referencedRelation: "presets"
            referencedColumns: ["key"]
          },
        ]
      }
      developer_actions: {
        Row: {
          action: string
          actor: string | null
          at: string
          business_id: string | null
          details: Json
          id: number
          reason: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          at?: string
          business_id?: string | null
          details?: Json
          id?: never
          reason?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          at?: string
          business_id?: string | null
          details?: Json
          id?: never
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "developer_actions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          business_id: string
          code: string
          created_at: string
          created_by: string | null
          id: string
          last_seen_at: string | null
          name: string
          receipt_seq: number
          retired: boolean
          seq: number
          settings: Json
          updated_at: string
        }
        Insert: {
          business_id: string
          code: string
          created_at?: string
          created_by?: string | null
          id: string
          last_seen_at?: string | null
          name: string
          receipt_seq?: number
          retired?: boolean
          seq?: number
          settings?: Json
          updated_at?: string
        }
        Update: {
          business_id?: string
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_seen_at?: string | null
          name?: string
          receipt_seq?: number
          retired?: boolean
          seq?: number
          settings?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          actor: string
          applied_at: string
          business_id: string
          client_created_at: string
          device_id: string | null
          flag_reason: string | null
          id: string
          kind: string
          outcome: string
          payload: Json
          seq: number
        }
        Insert: {
          actor: string
          applied_at?: string
          business_id: string
          client_created_at: string
          device_id?: string | null
          flag_reason?: string | null
          id: string
          kind: string
          outcome?: string
          payload: Json
          seq?: number
        }
        Update: {
          actor?: string
          applied_at?: string
          business_id?: string
          client_created_at?: string
          device_id?: string | null
          flag_reason?: string | null
          id?: string
          kind?: string
          outcome?: string
          payload?: Json
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      licences: {
        Row: {
          business_id: string
          grace_days: number
          max_offline_days: number
          notes: string | null
          plan_id: string
          seq: number
          state: string
          state_changed_at: string
          updated_at: string
          updated_by: string | null
          valid_until: string
        }
        Insert: {
          business_id: string
          grace_days?: number
          max_offline_days?: number
          notes?: string | null
          plan_id: string
          seq?: number
          state: string
          state_changed_at?: string
          updated_at?: string
          updated_by?: string | null
          valid_until: string
        }
        Update: {
          business_id?: string
          grace_days?: number
          max_offline_days?: number
          notes?: string | null
          plan_id?: string
          seq?: number
          state?: string
          state_changed_at?: string
          updated_at?: string
          updated_by?: string | null
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "licences_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licences_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          business_id: string
          created_at: string
          disabled: boolean
          display_name: string
          rank: number
          seq: number
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          business_id: string
          created_at?: string
          disabled?: boolean
          display_name: string
          rank: number
          seq?: number
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          business_id?: string
          created_at?: string
          disabled?: boolean
          display_name?: string
          rank?: number
          seq?: number
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          archived: boolean
          created_at: string
          features: Json
          id: string
          limits: Json
          name: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          features?: Json
          id: string
          limits?: Json
          name: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          features?: Json
          id?: string
          limits?: Json
          name?: string
        }
        Relationships: []
      }
      presets: {
        Row: {
          defaults: Json
          key: string
          name: string
          sort: number
        }
        Insert: {
          defaults: Json
          key: string
          name: string
          sort?: number
        }
        Update: {
          defaults?: Json
          key?: string
          name?: string
          sort?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      am_platform_developer: { Args: never; Returns: boolean }
      business_licence: {
        Args: { p_business: string }
        Returns: {
          can_sell: boolean
          grace_ends_at: string
          max_offline_days: number
          plan_id: string
          state: string
          valid_until: string
        }[]
      }
      console_businesses: {
        Args: never
        Returns: {
          created_at: string
          currency: string
          devices: number
          grace_ends_at: string
          id: string
          last_seen_at: string
          members: number
          name: string
          owner_name: string
          owner_username: string
          plan_id: string
          preset_key: string
          preset_name: string
          receipt_prefix: string
          state: string
          stored_state: string
          valid_until: string
        }[]
      }
      console_create_business: {
        Args: {
          p_brand_colour?: string
          p_currency?: string
          p_days: number
          p_locale?: string
          p_name: string
          p_owner: string
          p_owner_name: string
          p_owner_username: string
          p_plan: string
          p_preset: string
          p_receipt_prefix: string
          p_time_zone?: string
          p_trial: boolean
        }
        Returns: string
      }
      console_update_licence: {
        Args: {
          p_action: string
          p_business: string
          p_plan?: string
          p_reason?: string
          p_valid_until?: string
        }
        Returns: undefined
      }
      console_user_id_by_email: { Args: { p_email: string }; Returns: string }
      device_check_in: {
        Args: { p_business: string; p_device: string }
        Returns: {
          business_id: string
          checked_in_at: string
          device_code: string
          device_id: string
          grace_days: number
          max_offline_days: number
          plan_id: string
          state: string
          state_changed_at: string
          valid_until: string
        }[]
      }
      licence_state_at: {
        Args: {
          p_at: string
          p_grace_days: number
          p_state: string
          p_valid_until: string
        }
        Returns: string
      }
      register_device: {
        Args: { p_business: string; p_device: string; p_name: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
