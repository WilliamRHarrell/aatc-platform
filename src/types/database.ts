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
        Insert: Omit<Database['public']['Tables']['events']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['events']['Insert']>
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
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
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
          booth_size: 'single' | 'double' | 'triple' | 'quad'
          artist_count: number
          is_corner: boolean
          is_veteran: boolean
          total_amount: number
          status: 'pending' | 'approved' | 'rejected' | 'waitlisted'
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['applications']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['applications']['Insert']>
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
        Insert: Omit<Database['public']['Tables']['booths']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['booths']['Insert']>
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
        Insert: Omit<Database['public']['Tables']['exhibitors']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['exhibitors']['Insert']>
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
        Insert: Omit<Database['public']['Tables']['invoices']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['invoices']['Insert']>
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
        Insert: Omit<Database['public']['Tables']['contests']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['contests']['Insert']>
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
        Insert: Omit<Database['public']['Tables']['sponsorships']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['sponsorships']['Insert']>
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
