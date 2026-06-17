import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import AdminShell from '@/components/admin/AdminShell'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // No session → bounce to login, preserving where they were headed.
  if (!user) {
    redirect('/auth/login?redirect=/admin')
  }

  return <AdminShell>{children}</AdminShell>
}