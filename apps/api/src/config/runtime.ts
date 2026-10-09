/**
 * Режим «разработка» включается только явно: `NODE_ENV=development` (или `test` в тестах).
 * Любое другое значение, в том числе пустое, считается боевым режимом и требует полной конфигурации:
 * забытая переменная не должна открывать приложение с небезопасными значениями по умолчанию.
 *
 * Модуль без зависимостей, чтобы его можно было импортировать откуда угодно без циклов.
 */
const DEVELOPMENT_ENVS = new Set(['development', 'test']);

export const isDevelopmentEnv = (nodeEnv: string | undefined): boolean => DEVELOPMENT_ENVS.has(nodeEnv ?? '');

export const isDevelopment = (): boolean => isDevelopmentEnv(process.env.NODE_ENV);
