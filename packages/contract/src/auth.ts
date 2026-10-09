/**
 * Право, выданное в LMS: на весь проект или на отдельные страницы.
 * Редактирование включает публикацию; ролей нет.
 */
export type Grant =
  | { project: string, scope: 'project' }
  | { project: string, scope: 'pages', pageIds: string[] }
