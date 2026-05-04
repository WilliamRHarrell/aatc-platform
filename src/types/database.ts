export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      events: {
        Row: {
          id: string
          name: string
          venue: string
          city: string
          state: string
          start_date: string
          end_date: string
          registration_open_date: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          venue: string
          city: string
          state: string
          start_date: string
          end_date: string
          registration_open_date?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          venue?: string
          city?: string
          state?: string
          start_date?: string
          end_date?: string
          registration_open_date?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          role: 'admin' | 'exhibitor' | 'public'
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          role?: 'admin' | 'exhibitor' | 'public'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          role?: 'admin' | 'exhibitor' | 'public'
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      applications: {
        Row: {
          id: string
          event_id: string
          user_id: string | null
          exhibitor_type: 'artist' | 'vendor'
          business_name: string
          contact_name: string
          email: string
          phone: string | null
          website: string | null
          instagram: string | null
          facebook: string | null
          other_links: string | null
          booth_size: 'single' | 'double' | 'triple' | 'quad' | null
          artist_single_qty: number
          artist_double_qty: number
          vendor_single_qty: number
          vendor_double_qty: number
          corner_count: number
          add_ons: Array<{ kind: string; term: string | null; qty: number }>
          artist_count: number
          is_corner: boolean
          is_veteran: boolean
          total_amount: number
          status: 'pending' | 'approved' | 'rejected' | 'waitlisted'
          tv_show: string | null
          id_doc_url: string | null
          veteran_id_url: string | null
          notes: string | null
          artists: Array<{ name: string; id_url: string | null; id_later?: boolean; nickname?: string; instagram?: string; portfolio_urls?: string[]; styles?: string[] }> | null
          artists_ids_later: boolean
          logo_url: string | null
          portfolio_image_urls: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          user_id?: string | null
          exhibitor_type: 'artist' | 'vendor'
          business_name: string
          contact_name: string
          email: string
          phone?: string | null
          website?: string | null
          instagram?: string | null
          facebook?: string | null
          other_links?: string | null
          booth_size?: 'single' | 'double' | 'triple' | 'quad' | null
          artist_single_qty?: number
          artist_double_qty?: number
          vendor_single_qty?: number
          vendor_double_qty?: number
          corner_count?: number
          add_ons?: Array<{ kind: string; term: string | null; qty: number }>
          artist_count?: number
          is_corner?: boolean
          is_veteran?: boolean
          total_amount: number
          status?: 'pending' | 'approved' | 'rejected' | 'waitlisted'
          tv_show?: string | null
          id_doc_url?: string | null
          veteran_id_url?: string | null
          notes?: string | null
          artists?: Array<{ name: string; id_url: string | null; id_later?: boolean; nickname?: string; instagram?: string; portfolio_urls?: string[]; styles?: string[] }> | null
          artists_ids_later?: boolean
          logo_url?: string | null
          portfolio_image_urls?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          user_id?: string | null
          exhibitor_type?: 'artist' | 'vendor'
          business_name?: string
          contact_name?: string
          email?: string
          phone?: string | null
          website?: string | null
          instagram?: string | null
          facebook?: string | null
          other_links?: string | null
          booth_size?: 'single' | 'double' | 'triple' | 'quad' | null
          artist_single_qty?: number
          artist_double_qty?: number
          vendor_single_qty?: number
          vendor_double_qty?: number
          corner_count?: number
          add_ons?: Array<{ kind: string; term: string | null; qty: number }>
          artist_count?: number
          is_corner?: boolean
          is_veteran?: boolean
          total_amount?: number
          status?: 'pending' | 'approved' | 'rejected' | 'waitlisted'
          tv_show?: string | null
          id_doc_url?: string | null
          veteran_id_url?: string | null
          notes?: string | null
          artists?: Array<{ name: string; id_url: string | null; id_later?: boolean; nickname?: string; instagram?: string; portfolio_urls?: string[]; styles?: string[] }> | null
          artists_ids_later?: boolean
          logo_url?: string | null
          portfolio_image_urls?: string[]
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      booths: {
        Row: {
          id: string
          event_id: string
          application_id: string | null
          booth_number: string
          size: 'single' | 'double' | 'triple' | 'quad'
          is_corner: boolean
          x: number
          y: number
          width: number
          height: number
          status: 'available' | 'reserved' | 'sold'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          application_id?: string | null
          booth_number: string
          size: 'single' | 'double' | 'triple' | 'quad'
          is_corner?: boolean
          x?: number
          y?: number
          width?: number
          height?: number
          status?: 'available' | 'reserved' | 'sold'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          application_id?: string | null
          booth_number?: string
          size?: 'single' | 'double' | 'triple' | 'quad'
          is_corner?: boolean
          x?: number
          y?: number
          width?: number
          height?: number
          status?: 'available' | 'reserved' | 'sold'
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      exhibitors: {
        Row: {
          id: string
          application_id: string
          event_id: string
          business_name: string
          contact_name: string
          email: string
          phone: string | null
          website: string | null
          instagram: string | null
          exhibitor_type: 'artist' | 'vendor'
          booth_id: string | null
          bio: string | null
          logo_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          application_id: string
          event_id: string
          business_name: string
          contact_name: string
          email: string
          phone?: string | null
          website?: string | null
          instagram?: string | null
          exhibitor_type: 'artist' | 'vendor'
          booth_id?: string | null
          bio?: string | null
          logo_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          application_id?: string
          event_id?: string
          business_name?: string
          contact_name?: string
          email?: string
          phone?: string | null
          website?: string | null
          instagram?: string | null
          exhibitor_type?: 'artist' | 'vendor'
          booth_id?: string | null
          bio?: string | null
          logo_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          id: string
          application_id: string | null
          sponsorship_id: string | null
          food_truck_id: string | null
          stripe_payment_intent_id: string | null
          stripe_invoice_id: string | null
          amount: number
          amount_paid: number
          status: 'pending' | 'paid' | 'overdue' | 'cancelled'
          due_date: string | null
          paid_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          application_id?: string | null
          sponsorship_id?: string | null
          food_truck_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_invoice_id?: string | null
          amount: number
          amount_paid?: number
          status?: 'pending' | 'paid' | 'overdue' | 'cancelled'
          due_date?: string | null
          paid_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          application_id?: string | null
          sponsorship_id?: string | null
          food_truck_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_invoice_id?: string | null
          amount?: number
          amount_paid?: number
          status?: 'pending' | 'paid' | 'overdue' | 'cancelled'
          due_date?: string | null
          paid_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      contests: {
        Row: {
          id: string
          event_id: string
          name: string
          description: string | null
          scheduled_time: string | null
          order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          name: string
          description?: string | null
          scheduled_time?: string | null
          order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          name?: string
          description?: string | null
          scheduled_time?: string | null
          order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      contest_entries: {
        Row: {
          id: string
          contest_id: string
          collector_name: string
          artist_name: string | null
          photo_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          contest_id: string
          collector_name: string
          artist_name?: string | null
          photo_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          contest_id?: string
          collector_name?: string
          artist_name?: string | null
          photo_url?: string | null
          created_at?: string
        }
        Relationships: []
      }
      contest_votes: {
        Row: {
          id: string
          entry_id: string
          contest_id: string
          voter_token: string
          created_at: string
        }
        Insert: {
          id?: string
          entry_id: string
          contest_id: string
          voter_token: string
          created_at?: string
        }
        Update: {
          id?: string
          entry_id?: string
          contest_id?: string
          voter_token?: string
          created_at?: string
        }
        Relationships: []
      }
      panels: {
        Row: {
          id: string
          event_id: string
          title: string
          description: string
          panel_date: string
          panel_time: string
          location: string
          panelists: string
          is_free: boolean
          cost: number
          signup_type: 'none' | 'aatc_invoice' | 'email_host' | 'free_registration'
          host_email: string | null
          max_capacity: number | null
          is_published: boolean
          image_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          title: string
          description?: string
          panel_date?: string
          panel_time?: string
          location?: string
          panelists?: string
          is_free?: boolean
          cost?: number
          signup_type?: 'none' | 'aatc_invoice' | 'email_host' | 'free_registration'
          host_email?: string | null
          max_capacity?: number | null
          is_published?: boolean
          image_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          title?: string
          description?: string
          panel_date?: string
          panel_time?: string
          location?: string
          panelists?: string
          is_free?: boolean
          cost?: number
          signup_type?: 'none' | 'aatc_invoice' | 'email_host' | 'free_registration'
          host_email?: string | null
          max_capacity?: number | null
          is_published?: boolean
          image_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      panel_registrations: {
        Row: {
          id: string
          panel_id: string
          name: string
          email: string
          phone: string | null
          social_media: string | null
          attendee_type: 'artist' | 'vendor' | 'patron'
          payment_status: string
          stripe_payment_intent_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          panel_id: string
          name: string
          email: string
          phone?: string | null
          social_media?: string | null
          attendee_type?: 'artist' | 'vendor' | 'patron'
          payment_status?: string
          stripe_payment_intent_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          panel_id?: string
          name?: string
          email?: string
          phone?: string | null
          social_media?: string | null
          attendee_type?: 'artist' | 'vendor' | 'patron'
          payment_status?: string
          stripe_payment_intent_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      sponsorships: {
        Row: {
          id: string
          event_id: string
          sponsor_name: string
          tier: 'title' | 'platinum' | 'gold' | 'silver' | 'brass' | 'collectible_coin' | 'vip_bag' | 'collectors_choice' | 'artist_lounge' | 'rafter_banner'
          logo_url: string | null
          website: string | null
          amount: number
          status: 'pending' | 'confirmed' | 'cancelled'
          contact_name: string | null
          email: string | null
          phone: string | null
          instagram: string | null
          facebook: string | null
          notes: string | null
          user_id: string | null
          additional_items: string[]
          featured_footer: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          sponsor_name: string
          tier: 'title' | 'platinum' | 'gold' | 'silver' | 'brass' | 'collectible_coin' | 'vip_bag' | 'collectors_choice' | 'artist_lounge' | 'rafter_banner'
          logo_url?: string | null
          website?: string | null
          amount?: number
          status?: 'pending' | 'confirmed' | 'cancelled'
          contact_name?: string | null
          email?: string | null
          phone?: string | null
          instagram?: string | null
          facebook?: string | null
          notes?: string | null
          user_id?: string | null
          additional_items?: string[]
          featured_footer?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          sponsor_name?: string
          tier?: 'title' | 'platinum' | 'gold' | 'silver' | 'brass' | 'collectible_coin' | 'vip_bag' | 'collectors_choice' | 'artist_lounge' | 'rafter_banner'
          logo_url?: string | null
          website?: string | null
          amount?: number
          status?: 'pending' | 'confirmed' | 'cancelled'
          contact_name?: string | null
          email?: string | null
          phone?: string | null
          instagram?: string | null
          facebook?: string | null
          notes?: string | null
          user_id?: string | null
          additional_items?: string[]
          featured_footer?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      food_trucks: {
        Row: {
          id: string
          event_id: string
          user_id: string | null
          business_name: string
          contact_name: string
          email: string
          phone: string | null
          website: string | null
          instagram: string | null
          facebook: string | null
          cuisine_type: string
          description: string
          logo_url: string | null
          days: string[]
          thursday_setup: boolean
          is_published: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          user_id?: string | null
          business_name: string
          contact_name: string
          email: string
          phone?: string | null
          website?: string | null
          instagram?: string | null
          facebook?: string | null
          cuisine_type?: string
          description?: string
          logo_url?: string | null
          days?: string[]
          thursday_setup?: boolean
          is_published?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          user_id?: string | null
          business_name?: string
          contact_name?: string
          email?: string
          phone?: string | null
          website?: string | null
          instagram?: string | null
          facebook?: string | null
          cuisine_type?: string
          description?: string
          logo_url?: string | null
          days?: string[]
          thursday_setup?: boolean
          is_published?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
