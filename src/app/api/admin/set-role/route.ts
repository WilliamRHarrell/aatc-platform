import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { createServerClient } from '@/lib/supabase-server'
import { ADMIN_ROLES } from '@/lib/roles'

/**
 * Assign a role. FULL ADMINS ONLY — deliberately not delegated to the granular
 * roles, or a content_editor could promote themselves to admin and the split
 * would mean nothing.
 *
 * Two guards beyond that:
 * - you cannot change your own role, so the last admin cannot lock themselves
 *    out or accidentally self-demote mid-session
 * - the last remaining full admin cannot be demoted, so the install can never
 *    end up with nobody able to grant roles (which would need SQL to escape)
 */
const ASSIGNABLE = [...ADMIN_ROLES, 'exhibitor', 'public'] as const

export async function POST(request: Request) {
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') {
    return NextResponse.json({ error: 'Full admin only' }, { status: 403 })
  }

  let body: { userId?: string; role?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

  const { userId, role } = body
  if (!userId || !role || !(ASSIGNABLE as readonly string[]).includes(role)) {
    return NextResponse.json({ error: 'Unknown role' }, { status: 400 })
  }
  if (userId === user.id) {
    return NextResponse.json({ error: 'You cannot change your own role.' }, { status: 400 })
  }

  const service = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Never leave the install with zero full admins.
  if (role !== 'admin') {
    const { data: target } = await service.from('profiles').select('role').eq('id', userId).single()
    if (target?.role === 'admin') {
      const { count } = await service
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin')
      if ((count ?? 0) <= 1) {
        return NextResponse.json(
          { error: 'This is the last full admin. Promote someone else first.' },
          { status: 400 }
        )
      }
    }
  }

  const { error } = await service
    .from('profiles')
    .update({ role: role as Database['public']['Enums']['user_role'] })
    .eq('id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
