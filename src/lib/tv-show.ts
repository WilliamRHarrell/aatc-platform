/**
 * The artist form's TV show answer for admin (094). tv_show_featured is the
 * Yes/No; tv_show is the show's name. Null means the question was not asked
 * (vendors) or the answer predates 094; then nothing is shown.
 */
export function tvShowLabel(featured: boolean | null | undefined, show: string | null | undefined): string | null {
  const name = (show ?? '').trim()
  if (featured === true) return name ? `Yes: ${name}` : 'Yes (show not named)'
  if (featured === false) return 'No'
  return name || null
}
