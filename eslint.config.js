import js from '@eslint/js'
import stylistic from '@stylistic/eslint-plugin'
import tseslint from 'typescript-eslint'

export default tseslint.config(
    { ignores: ['**/node_modules/**', '**/dist/**', '**/.office/**'] },

    js.configs.recommended,
    ...tseslint.configs.recommended,

    {
        plugins: { '@stylistic': stylistic },
        rules: {
            // Отступ — 4 пробела.
            '@stylistic/indent': ['error', 4],

            // Фигурные скобки — всегда, и тело блока — всегда с новой строки: никаких `if (x) return` в одну строку.
            // (Открывающая скобка остаётся на строке оператора; стиль «скобка на своей строке» — это 'allman' вместо '1tbs'.)
            'curly': ['error', 'all'],
            '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: false }],

            // Одна инструкция на строку, без хвостовых пробелов.
            '@stylistic/max-statements-per-line': ['error', { max: 1 }],
            '@stylistic/no-trailing-spaces': 'error',
        },
    },
)
