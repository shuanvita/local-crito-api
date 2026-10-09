import type { MediaItem } from '@crito/contract'

/** Операции с медиатекой проекта. */
export function useMedia(project: MaybeRefOrGetter<string>) {
  const api = useApi()
  const toast = useToast()
  const base = () => `/projects/${toValue(project)}/media`

  const list = (search?: string) =>
    api<MediaItem[]>(base(), { query: search ? { search } : undefined })

  /** Загружает файлы по одному; ошибки показываются тостами, остальные файлы продолжают грузиться. */
  async function upload(files: File[]): Promise<MediaItem[]> {
    const uploaded: MediaItem[] = []
    for (const file of files) {
      const body = new FormData()
      body.append('file', file)
      try {
        uploaded.push(await api<MediaItem>(base(), { method: 'POST', body }))
      } catch (error) {
        toast.add({ title: `Не удалось загрузить ${file.name}`, description: apiErrorMessage(error), color: 'error' })
      }
    }
    return uploaded
  }

  const remove = (id: string) => api(`${base()}/${id}`, { method: 'DELETE' })

  return { list, upload, remove }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}
