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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bulk_email_log: {
        Row: {
          campaign_key: string | null
          created_at: string
          email: string
          error: string | null
          external_reference: string | null
          id: string
          message: string
          order_id: string | null
          resend_id: string | null
          status: string
          subject: string
        }
        Insert: {
          campaign_key?: string | null
          created_at?: string
          email: string
          error?: string | null
          external_reference?: string | null
          id?: string
          message: string
          order_id?: string | null
          resend_id?: string | null
          status?: string
          subject: string
        }
        Update: {
          campaign_key?: string | null
          created_at?: string
          email?: string
          error?: string | null
          external_reference?: string | null
          id?: string
          message?: string
          order_id?: string | null
          resend_id?: string | null
          status?: string
          subject?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          amount: number
          approved_at: string | null
          asaas_copia_cola: string | null
          asaas_customer_id: string | null
          asaas_expires_at: string | null
          asaas_payload: Json | null
          asaas_payment_id: string | null
          asaas_qrcode: string | null
          asaas_status: string | null
          client_ip: string | null
          client_user_agent: string | null
          created_at: string
          efi_copia_cola: string | null
          efi_expires_at: string | null
          efi_loc_id: string | null
          efi_payload: Json | null
          efi_qrcode: string | null
          efi_status: string | null
          efi_txid: string | null
          external_reference: string
          id: string
          kit_id: number
          kit_title: string
          meta_capi_error: string | null
          meta_capi_http_status: number | null
          meta_capi_payload: Json | null
          meta_capi_response: string | null
          meta_capi_sent_at: string | null
          mp_payment_id: number | null
          order_email_sent_at: string | null
          payment_provider: string | null
          status: string
          status_detail: string | null
          tracking_email_sent_at: string | null
          tracking_payload: Json
          updated_at: string
          utmify_error: string | null
          utmify_http_status: number | null
          utmify_payload: Json | null
          utmify_processing_at: string | null
          utmify_response: string | null
          utmify_sent_at: string | null
        }
        Insert: {
          amount: number
          approved_at?: string | null
          asaas_copia_cola?: string | null
          asaas_customer_id?: string | null
          asaas_expires_at?: string | null
          asaas_payload?: Json | null
          asaas_payment_id?: string | null
          asaas_qrcode?: string | null
          asaas_status?: string | null
          client_ip?: string | null
          client_user_agent?: string | null
          created_at?: string
          efi_copia_cola?: string | null
          efi_expires_at?: string | null
          efi_loc_id?: string | null
          efi_payload?: Json | null
          efi_qrcode?: string | null
          efi_status?: string | null
          efi_txid?: string | null
          external_reference: string
          id?: string
          kit_id: number
          kit_title: string
          meta_capi_error?: string | null
          meta_capi_http_status?: number | null
          meta_capi_payload?: Json | null
          meta_capi_response?: string | null
          meta_capi_sent_at?: string | null
          mp_payment_id?: number | null
          order_email_sent_at?: string | null
          payment_provider?: string | null
          status?: string
          status_detail?: string | null
          tracking_email_sent_at?: string | null
          tracking_payload?: Json
          updated_at?: string
          utmify_error?: string | null
          utmify_http_status?: number | null
          utmify_payload?: Json | null
          utmify_processing_at?: string | null
          utmify_response?: string | null
          utmify_sent_at?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          asaas_copia_cola?: string | null
          asaas_customer_id?: string | null
          asaas_expires_at?: string | null
          asaas_payload?: Json | null
          asaas_payment_id?: string | null
          asaas_qrcode?: string | null
          asaas_status?: string | null
          client_ip?: string | null
          client_user_agent?: string | null
          created_at?: string
          efi_copia_cola?: string | null
          efi_expires_at?: string | null
          efi_loc_id?: string | null
          efi_payload?: Json | null
          efi_qrcode?: string | null
          efi_status?: string | null
          efi_txid?: string | null
          external_reference?: string
          id?: string
          kit_id?: number
          kit_title?: string
          meta_capi_error?: string | null
          meta_capi_http_status?: number | null
          meta_capi_payload?: Json | null
          meta_capi_response?: string | null
          meta_capi_sent_at?: string | null
          mp_payment_id?: number | null
          order_email_sent_at?: string | null
          payment_provider?: string | null
          status?: string
          status_detail?: string | null
          tracking_email_sent_at?: string | null
          tracking_payload?: Json
          updated_at?: string
          utmify_error?: string | null
          utmify_http_status?: number | null
          utmify_payload?: Json | null
          utmify_processing_at?: string | null
          utmify_response?: string | null
          utmify_sent_at?: string | null
        }
        Relationships: []
      }
      rastreios: {
        Row: {
          codigo_pedido: string
          created_at: string
          id: string
          observacao: string | null
          status: string
          ultima_atualizacao: string
        }
        Insert: {
          codigo_pedido: string
          created_at?: string
          id?: string
          observacao?: string | null
          status?: string
          ultima_atualizacao?: string
        }
        Update: {
          codigo_pedido?: string
          created_at?: string
          id?: string
          observacao?: string | null
          status?: string
          ultima_atualizacao?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_order_utmify: {
        Args: { _order_id: string }
        Returns: {
          amount: number
          approved_at: string | null
          asaas_copia_cola: string | null
          asaas_customer_id: string | null
          asaas_expires_at: string | null
          asaas_payload: Json | null
          asaas_payment_id: string | null
          asaas_qrcode: string | null
          asaas_status: string | null
          client_ip: string | null
          client_user_agent: string | null
          created_at: string
          efi_copia_cola: string | null
          efi_expires_at: string | null
          efi_loc_id: string | null
          efi_payload: Json | null
          efi_qrcode: string | null
          efi_status: string | null
          efi_txid: string | null
          external_reference: string
          id: string
          kit_id: number
          kit_title: string
          meta_capi_error: string | null
          meta_capi_http_status: number | null
          meta_capi_payload: Json | null
          meta_capi_response: string | null
          meta_capi_sent_at: string | null
          mp_payment_id: number | null
          order_email_sent_at: string | null
          payment_provider: string | null
          status: string
          status_detail: string | null
          tracking_email_sent_at: string | null
          tracking_payload: Json
          updated_at: string
          utmify_error: string | null
          utmify_http_status: number | null
          utmify_payload: Json | null
          utmify_processing_at: string | null
          utmify_response: string | null
          utmify_sent_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
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
    Enums: {},
  },
} as const
