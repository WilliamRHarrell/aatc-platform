import { getContent } from '@/content/getContent'
import TicketsClient from './TicketsClient'

export default async function TicketsPage() {
  const content = await getContent('tickets')
  return <TicketsClient content={content} />
}
