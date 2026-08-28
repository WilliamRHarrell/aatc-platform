import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://aatc-platform.vercel.app'

export async function POST(req: Request) {
  // Auth check - caller must be an admin
  const cookieStore = await cookies()
  const userClient = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { email } = await req.json() as { email: string }
  if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 })

  const adminClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: linkData, error } = await adminClient.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${SITE_URL}/auth/reset-password` },
  })

  if (error || !linkData?.properties?.action_link) {
    return NextResponse.json({ error: error?.message ?? 'Failed to generate link' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, resetLink: linkData.properties.action_link })
}
