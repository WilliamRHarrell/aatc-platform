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
      aatc_submissions: {
        Row: {
          artist_name: string
          caption: string
          created_at: string
          exhibitor_id: string
          id: string
          instagram_handle: string
          postiz_post_id: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          square_paths: string[]
          status: string
          vertical_paths: string[]
        }
        Insert: {
          artist_name: string
          caption: string
          created_at?: string
          exhibitor_id: string
          id?: string
          instagram_handle: string
          postiz_post_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          square_paths: string[]
          status?: string
          vertical_paths: string[]
        }
        Update: {
          artist_name?: string
          caption?: string
          created_at?: string
          exhibitor_id?: string
          id?: string
          instagram_handle?: string
          postiz_post_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          square_paths?: string[]
          status?: string
          vertical_paths?: string[]
        }
        Relationships: []
      }
      applications: {
        Row: {
          add_ons: Json
          approved_at: string | null
          artist_count: number
          artist_double_qty: number
          artist_single_qty: number
          artists: Json | null
          artists_ids_later: boolean
          booth_size: Database["public"]["Enums"]["booth_size"] | null
          business_name: string
          contact_name: string
          corner_count: number
          created_at: string
          deposit_due_at: string | null
          email: string
          event_id: string
          exhibitor_type: Database["public"]["Enums"]["exhibitor_type"]
          facebook: string | null
          final_due_at: string | null
          id: string
          id_doc_url: string | null
          instagram: string | null
          is_corner: boolean
          is_veteran: boolean
          logo_url: string | null
          needs_roster: boolean
          notes: string | null
          other_links: string | null
          phone: string | null
          portfolio_image_urls: string[] | null
          status: Database["public"]["Enums"]["application_status"]
          total_amount: number
          tv_show: string | null
          updated_at: string
          user_id: string
          vendor_double_qty: number
          vendor_single_qty: number
          veteran_id_url: string | null
          website: string | null
        }
        Insert: {
          add_ons?: Json
          approved_at?: string | null
          artist_count?: number
          artist_double_qty?: number
          artist_single_qty?: number
          artists?: Json | null
          artists_ids_later?: boolean
          booth_size?: Database["public"]["Enums"]["booth_size"] | null
          business_name: string
          contact_name: string
          corner_count?: number
          created_at?: string
          deposit_due_at?: string | null
          email: string
          event_id: string
          exhibitor_type: Database["public"]["Enums"]["exhibitor_type"]
          facebook?: string | null
          final_due_at?: string | null
          id?: string
          id_doc_url?: string | null
          instagram?: string | null
          is_corner?: boolean
          is_veteran?: boolean
          logo_url?: string | null
          needs_roster?: boolean
          notes?: string | null
          other_links?: string | null
          phone?: string | null
          portfolio_image_urls?: string[] | null
          status?: Database["public"]["Enums"]["application_status"]
          total_amount: number
          tv_show?: string | null
          updated_at?: string
          user_id: string
          vendor_double_qty?: number
          vendor_single_qty?: number
          veteran_id_url?: string | null
          website?: string | null
        }
        Update: {
          add_ons?: Json
          approved_at?: string | null
          artist_count?: number
          artist_double_qty?: number
          artist_single_qty?: number
          artists?: Json | null
          artists_ids_later?: boolean
          booth_size?: Database["public"]["Enums"]["booth_size"] | null
          business_name?: string
          contact_name?: string
          corner_count?: number
          created_at?: string
          deposit_due_at?: string | null
          email?: string
          event_id?: string
          exhibitor_type?: Database["public"]["Enums"]["exhibitor_type"]
          facebook?: string | null
          final_due_at?: string | null
          id?: string
          id_doc_url?: string | null
          instagram?: string | null
          is_corner?: boolean
          is_veteran?: boolean
          logo_url?: string | null
          needs_roster?: boolean
          notes?: string | null
          other_links?: string | null
          phone?: string | null
          portfolio_image_urls?: string[] | null
          status?: Database["public"]["Enums"]["application_status"]
          total_amount?: number
          tv_show?: string | null
          updated_at?: string
          user_id?: string
          vendor_double_qty?: number
          vendor_single_qty?: number
          veteran_id_url?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      booths: {
        Row: {
          application_id: string | null
          booth_number: string
          created_at: string
          event_id: string
          height: number
          id: string
          is_corner: boolean
          size: Database["public"]["Enums"]["booth_size"]
          status: Database["public"]["Enums"]["booth_status"]
          updated_at: string
          width: number
          x: number
          y: number
        }
        Insert: {
          application_id?: string | null
          booth_number: string
          created_at?: string
          event_id: string
          height?: number
          id?: string
          is_corner?: boolean
          size: Database["public"]["Enums"]["booth_size"]
          status?: Database["public"]["Enums"]["booth_status"]
          updated_at?: string
          width?: number
          x?: number
          y?: number
        }
        Update: {
          application_id?: string | null
          booth_number?: string
          created_at?: string
          event_id?: string
          height?: number
          id?: string
          is_corner?: boolean
          size?: Database["public"]["Enums"]["booth_size"]
          status?: Database["public"]["Enums"]["booth_status"]
          updated_at?: string
          width?: number
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "booths_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booths_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      contest_entries: {
        Row: {
          artist_name: string | null
          collector_name: string
          contest_id: string
          created_at: string
          id: string
          photo_url: string | null
        }
        Insert: {
          artist_name?: string | null
          collector_name: string
          contest_id: string
          created_at?: string
          id?: string
          photo_url?: string | null
        }
        Update: {
          artist_name?: string | null
          collector_name?: string
          contest_id?: string
          created_at?: string
          id?: string
          photo_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contest_entries_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
        ]
      }
      contest_votes: {
        Row: {
          contest_id: string
          created_at: string
          entry_id: string
          id: string
          voter_token: string
        }
        Insert: {
          contest_id: string
          created_at?: string
          entry_id: string
          id?: string
          voter_token: string
        }
        Update: {
          contest_id?: string
          created_at?: string
          entry_id?: string
          id?: string
          voter_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "contest_votes_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "contest_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      contests: {
        Row: {
          created_at: string
          description: string | null
          event_id: string
          id: string
          name: string
          order: number
          scheduled_time: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          event_id: string
          id?: string
          name: string
          order?: number
          scheduled_time?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          event_id?: string
          id?: string
          name?: string
          order?: number
          scheduled_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          city: string
          created_at: string
          end_date: string
          id: string
          is_active: boolean
          name: string
          registration_open_date: string | null
          start_date: string
          state: string
          updated_at: string
          venue: string
        }
        Insert: {
          city: string
          created_at?: string
          end_date: string
          id?: string
          is_active?: boolean
          name: string
          registration_open_date?: string | null
          start_date: string
          state: string
          updated_at?: string
          venue: string
        }
        Update: {
          city?: string
          created_at?: string
          end_date?: string
          id?: string
          is_active?: boolean
          name?: string
          registration_open_date?: string | null
          start_date?: string
          state?: string
          updated_at?: string
          venue?: string
        }
        Relationships: []
      }
      exhibitors: {
        Row: {
          application_id: string
          bio: string | null
          booth_id: string | null
          business_name: string
          contact_name: string
          created_at: string
          email: string
          event_id: string
          exhibitor_type: Database["public"]["Enums"]["exhibitor_type"]
          id: string
          instagram: string | null
          logo_url: string | null
          phone: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          application_id: string
          bio?: string | null
          booth_id?: string | null
          business_name: string
          contact_name: string
          created_at?: string
          email: string
          event_id: string
          exhibitor_type: Database["public"]["Enums"]["exhibitor_type"]
          id?: string
          instagram?: string | null
          logo_url?: string | null
          phone?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          application_id?: string
          bio?: string | null
          booth_id?: string | null
          business_name?: string
          contact_name?: string
          created_at?: string
          email?: string
          event_id?: string
          exhibitor_type?: Database["public"]["Enums"]["exhibitor_type"]
          id?: string
          instagram?: string | null
          logo_url?: string | null
          phone?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exhibitors_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exhibitors_booth_id_fkey"
            columns: ["booth_id"]
            isOneToOne: false
            referencedRelation: "booths"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exhibitors_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      food_trucks: {
        Row: {
          business_name: string
          contact_name: string
          created_at: string
          cuisine_type: string
          days: string[]
          description: string
          email: string
          event_id: string
          facebook: string | null
          id: string
          instagram: string | null
          is_published: boolean
          logo_url: string | null
          phone: string | null
          thursday_setup: boolean
          updated_at: string
          user_id: string | null
          website: string | null
        }
        Insert: {
          business_name: string
          contact_name: string
          created_at?: string
          cuisine_type?: string
          days?: string[]
          description?: string
          email: string
          event_id: string
          facebook?: string | null
          id?: string
          instagram?: string | null
          is_published?: boolean
          logo_url?: string | null
          phone?: string | null
          thursday_setup?: boolean
          updated_at?: string
          user_id?: string | null
          website?: string | null
        }
        Update: {
          business_name?: string
          contact_name?: string
          created_at?: string
          cuisine_type?: string
          days?: string[]
          description?: string
          email?: string
          event_id?: string
          facebook?: string | null
          id?: string
          instagram?: string | null
          is_published?: boolean
          logo_url?: string | null
          phone?: string | null
          thursday_setup?: boolean
          updated_at?: string
          user_id?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "food_trucks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          amount_paid: number
          application_id: string | null
          created_at: string
          deposit_paid_at: string | null
          due_date: string | null
          final_paid_at: string | null
          food_truck_id: string | null
          id: string
          paid_at: string | null
          sponsorship_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          amount_paid?: number
          application_id?: string | null
          created_at?: string
          deposit_paid_at?: string | null
          due_date?: string | null
          final_paid_at?: string | null
          food_truck_id?: string | null
          id?: string
          paid_at?: string | null
          sponsorship_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          amount_paid?: number
          application_id?: string | null
          created_at?: string
          deposit_paid_at?: string | null
          due_date?: string | null
          final_paid_at?: string | null
          food_truck_id?: string | null
          id?: string
          paid_at?: string | null
          sponsorship_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_food_truck_id_fkey"
            columns: ["food_truck_id"]
            isOneToOne: false
            referencedRelation: "food_trucks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_sponsorship_id_fkey"
            columns: ["sponsorship_id"]
            isOneToOne: false
            referencedRelation: "sponsorships"
            referencedColumns: ["id"]
          },
        ]
      }
      panel_registrations: {
        Row: {
          attendee_type: Database["public"]["Enums"]["panel_attendee_type"]
          created_at: string
          email: string
          id: string
          name: string
          panel_id: string
          payment_status: string
          phone: string | null
          social_media: string | null
          stripe_payment_intent_id: string | null
        }
        Insert: {
          attendee_type?: Database["public"]["Enums"]["panel_attendee_type"]
          created_at?: string
          email: string
          id?: string
          name: string
          panel_id: string
          payment_status?: string
          phone?: string | null
          social_media?: string | null
          stripe_payment_intent_id?: string | null
        }
        Update: {
          attendee_type?: Database["public"]["Enums"]["panel_attendee_type"]
          created_at?: string
          email?: string
          id?: string
          name?: string
          panel_id?: string
          payment_status?: string
          phone?: string | null
          social_media?: string | null
          stripe_payment_intent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "panel_registrations_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "panels"
            referencedColumns: ["id"]
          },
        ]
      }
      panels: {
        Row: {
          cost: number
          created_at: string
          description: string
          event_id: string
          host_email: string | null
          id: string
          image_url: string | null
          is_free: boolean
          is_published: boolean
          location: string
          max_capacity: number | null
          panel_date: string
          panel_time: string
          panelists: string
          signup_type: Database["public"]["Enums"]["panel_signup_type"]
          title: string
          updated_at: string
        }
        Insert: {
          cost?: number
          created_at?: string
          description?: string
          event_id: string
          host_email?: string | null
          id?: string
          image_url?: string | null
          is_free?: boolean
          is_published?: boolean
          location?: string
          max_capacity?: number | null
          panel_date?: string
          panel_time?: string
          panelists?: string
          signup_type?: Database["public"]["Enums"]["panel_signup_type"]
          title: string
          updated_at?: string
        }
        Update: {
          cost?: number
          created_at?: string
          description?: string
          event_id?: string
          host_email?: string | null
          id?: string
          image_url?: string | null
          is_free?: boolean
          is_published?: boolean
          location?: string
          max_capacity?: number | null
          panel_date?: string
          panel_time?: string
          panelists?: string
          signup_type?: Database["public"]["Enums"]["panel_signup_type"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "panels_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      page_content: {
        Row: {
          content: string | null
          content_type: string | null
          id: string
          page_key: string
          section_key: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          content?: string | null
          content_type?: string | null
          id?: string
          page_key: string
          section_key: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          content?: string | null
          content_type?: string | null
          id?: string
          page_key?: string
          section_key?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      sponsorships: {
        Row: {
          additional_items: string[] | null
          amount: number
          contact_name: string | null
          created_at: string
          email: string | null
          event_id: string
          facebook: string | null
          featured_footer: boolean
          show_on_homepage: boolean
          homepage_order: number | null
          id: string
          instagram: string | null
          logo_url: string | null
          notes: string | null
          phone: string | null
          sponsor_name: string
          status: Database["public"]["Enums"]["sponsor_status"]
          tier: Database["public"]["Enums"]["sponsor_tier"]
          updated_at: string
          user_id: string | null
          website: string | null
        }
        Insert: {
          additional_items?: string[] | null
          amount?: number
          contact_name?: string | null
          created_at?: string
          email?: string | null
          event_id: string
          facebook?: string | null
          featured_footer?: boolean
          show_on_homepage?: boolean
          homepage_order?: number | null
          id?: string
          instagram?: string | null
          logo_url?: string | null
          notes?: string | null
          phone?: string | null
          sponsor_name: string
          status?: Database["public"]["Enums"]["sponsor_status"]
          tier: Database["public"]["Enums"]["sponsor_tier"]
          updated_at?: string
          user_id?: string | null
          website?: string | null
        }
        Update: {
          additional_items?: string[] | null
          amount?: number
          contact_name?: string | null
          created_at?: string
          email?: string | null
          event_id?: string
          facebook?: string | null
          featured_footer?: boolean
          show_on_homepage?: boolean
          homepage_order?: number | null
          id?: string
          instagram?: string | null
          logo_url?: string | null
          notes?: string | null
          phone?: string | null
          sponsor_name?: string
          status?: Database["public"]["Enums"]["sponsor_status"]
          tier?: Database["public"]["Enums"]["sponsor_tier"]
          updated_at?: string
          user_id?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sponsorships_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      application_status:
        | "pending"
        | "approved"
        | "rejected"
        | "waitlisted"
        | "expired"
        | "canceled"
      booth_size: "single" | "double" | "triple" | "quad"
      booth_status: "available" | "reserved" | "sold"
      exhibitor_type: "artist" | "vendor"
      invoice_status: "pending" | "paid" | "overdue" | "cancelled"
      panel_attendee_type: "artist" | "vendor" | "patron"
      panel_signup_type:
        | "none"
        | "aatc_invoice"
        | "email_host"
        | "free_registration"
      sponsor_status: "pending" | "confirmed" | "cancelled"
      sponsor_tier:
        | "platinum"
        | "gold"
        | "silver"
        | "bronze"
        | "title"
        | "brass"
        | "collectible_coin"
        | "vip_bag"
        | "collectors_choice"
        | "artist_lounge"
        | "rafter_banner"
      user_role: "admin" | "exhibitor" | "public"
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
      application_status: [
        "pending",
        "approved",
        "rejected",
        "waitlisted",
        "expired",
        "canceled",
      ],
      booth_size: ["single", "double", "triple", "quad"],
      booth_status: ["available", "reserved", "sold"],
      exhibitor_type: ["artist", "vendor"],
      invoice_status: ["pending", "paid", "overdue", "cancelled"],
      panel_attendee_type: ["artist", "vendor", "patron"],
      panel_signup_type: [
        "none",
        "aatc_invoice",
        "email_host",
        "free_registration",
      ],
      sponsor_status: ["pending", "confirmed", "cancelled"],
      sponsor_tier: [
        "platinum",
        "gold",
        "silver",
        "bronze",
        "title",
        "brass",
        "collectible_coin",
        "vip_bag",
        "collectors_choice",
        "artist_lounge",
        "rafter_banner",
      ],
      user_role: ["admin", "exhibitor", "public"],
    },
  },
} as const
