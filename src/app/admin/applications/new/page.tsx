import Link from 'next/link'
import ApplicationEditorForm from '@/components/admin/ApplicationEditorForm'

/** /admin/applications/new - an application entered on someone's behalf (admin only: src/proxy.ts). */
export default function NewApplicationPage() {
  return (
    <>
      <div className="mb-6">
        <Link href="/admin/applications" className="text-sm font-semibold" style={{ color: '#8B7355' }}>← Applications</Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-white sm:text-3xl">New application</h1>
        <p className="mt-1 text-sm" style={{ color: '#999' }}>
          For a recruit or an in-person booking. Priced and checked by the same rules as the public forms.
        </p>
      </div>
      <ApplicationEditorForm />
    </>
  )
}
