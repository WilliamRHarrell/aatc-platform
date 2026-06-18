import { getContent } from '@/content/getContent'
import ContestsClient from './ContestsClient'

export default async function ContestsPage() {
  const content = await getContent('contests')
  return <ContestsClient content={content} />
}
