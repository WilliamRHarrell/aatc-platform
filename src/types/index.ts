import type { Database } from './database'

export type Event = Database['public']['Tables']['events']['Row']
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Application = Database['public']['Tables']['applications']['Row']
export type Booth = Database['public']['Tables']['booths']['Row']
export type Exhibitor = Database['public']['Tables']['exhibitors']['Row']
export type Invoice = Database['public']['Tables']['invoices']['Row']
export type Contest = Database['public']['Tables']['contests']['Row']
export type Sponsorship = Database['public']['Tables']['sponsorships']['Row']

export type ExhibitorType = 'artist' | 'vendor'
export type BoothSize = 'single' | 'double' | 'triple' | 'quad'
export type ApplicationStatus = 'pending' | 'approved' | 'rejected' | 'waitlisted'
export type BoothStatus = 'available' | 'reserved' | 'sold'
export type InvoiceStatus = 'pending' | 'paid' | 'overdue' | 'cancelled'
export type UserRole = 'admin' | 'exhibitor' | 'public'
export type SponsorTier = 'platinum' | 'gold' | 'silver' | 'bronze'

export interface ApplicationWithDetails extends Application {
  booth?: Booth | null
  exhibitor?: Exhibitor | null
  invoices?: Invoice[]
}

export interface ExhibitorWithBooth extends Exhibitor {
  booth?: Booth | null
}
