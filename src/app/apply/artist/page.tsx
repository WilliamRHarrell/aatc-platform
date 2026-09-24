import { getContent } from '@/content/getContent'
import ArtistApplyForm from './ArtistApplyForm'

/**
 * Server wrapper: the form is a client component; the veteran upload wording
 * comes from the applyForms registry entry (editable at /admin/content) and is
 * passed in as props so a copy change needs no deploy.
 */
export default async function ArtistApplyPage() {
  const c = await getContent('applyForms')
  return <ArtistApplyForm content={{ veteranDocLabel: c.veteran_doc_label, veteranDocHelp: c.veteran_doc_help }} />
}
