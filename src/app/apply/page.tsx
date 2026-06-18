import { getContent } from '@/content/getContent'
import ApplyClient from './ApplyClient'

export default async function ApplyPage() {
  const content = await getContent('home')
  return <ApplyClient content={content} />
}
