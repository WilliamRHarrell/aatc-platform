import { createPagesBrowserClient } from '@supabase/auth-helpers-nextjs'
import type { Database } from '@/types/database'

export const createClient = () => createPagesBrowserClient<Database>()
