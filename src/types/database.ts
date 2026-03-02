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
          user_id: string
          exhibitor_type: 'artist' | 'vendor'
          business_name: string
          contact_name: string
          email: string
          phone: string | null
          website: string | null
          instagram: string | null
          facebook: string | null
          other_links: string | null
          booth_size: 'single' | 'double' | 'triple' | 'quad'
          artist_count: number
          is_corner: boolean
          is_veteran: boolean
          total_amount: number
          status: 'pending' | 'approved' | 'rejected' | 'waitlisted'
          tv_show: string | null
          id_doc_url: string | null
          veteran_id_url: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          user_id: string
          exhibitor_type: 'artist' | 'vendor'
          business_name: string
          contact_name: string
          email: string
          phone?: string | null
          website?: string | null
          instagram?: string | null
          facebook?: string | null
          other_links?: string | null
          booth_size: 'single' | 'double' | 'triple' | 'quad'
          artist_count?: number
          is_corner?: boolean
          is_veteran?: boolean
          total_amount: number
          status?: 'pending' | 'approved' | 'rejected' | 'waitlisted'
          tv_show?: string | null
          id_doc_url?: string | null
          veteran_id_url?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          user_id?: string
          exhibitor_type?: 'artist' | 'vendor'
          business_name?: string
          contact_name?: string
          email?: string
          phone?: string | null
          website?: string | null
          instagram?: string | null
          facebook?: string | null
          other_links?: string | null
          booth_size?: 'single' | 'double' | 'triple' | 'quad'
          artist_count?: number
          is_corner?: boolean
          is_veteran?: boolean
          total_amount?: number
          status?: 'pending' | 'approved' | 'rejected' | 'waitlisted'
          tv_show?: string | null
          id_doc_url?: string | null
          veteran_id_url?: string | null
          notes?: string | null
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
          application_id: string
          stripe_payment_intent_id: string | null
          stripe_invoice_id: string | null
          amount: number
          status: 'pending' | 'paid' | 'overdue' | 'cancelled'
          due_date: string | null
          paid_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          application_id: string
          stripe_payment_intent_id?: string | null
          stripe_invoice_id?: string | null
          amount: number
          status?: 'pending' | 'paid' | 'overdue' | 'cancelled'
          due_date?: string | null
          paid_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          application_id?: string
          stripe_payment_intent_id?: string | null
          stripe_invoice_id?: string | null
          amount?: number
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
      sponsorships: {
        Row: {
          id: string
          event_id: string
          sponsor_name: string
          tier: 'platinum' | 'gold' | 'silver' | 'bronze'
          logo_url: string | null
          website: string | null
          amount: number
          status: 'pending' | 'confirmed' | 'cancelled'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          sponsor_name: string
          tier: 'platinum' | 'gold' | 'silver' | 'bronze'
          logo_url?: string | null
          website?: string | null
          amount?: number
          status?: 'pending' | 'confirmed' | 'cancelled'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          sponsor_name?: string
          tier?: 'platinum' | 'gold' | 'silver' | 'bronze'
          logo_url?: string | null
          website?: string | null
          amount?: number
          status?: 'pending' | 'confirmed' | 'cancelled'
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
