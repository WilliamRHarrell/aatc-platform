import { getContent } from '@/content/getContent'
import SponsorsClient from './SponsorsClient'

export default async function SponsorsPage() {
  const content = await getContent('sponsors')
  return <SponsorsClient content={content} />
}
