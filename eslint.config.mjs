import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

// ESLint 9 (flat config). Dois mundos neste projeto:
//  - src/ e vite.config.js: módulos ES + JSX, rodam no navegador (interface React)
//  - electron/: CommonJS, rodam no Node (processo principal e preloads)
const regrasComuns = {
  // Componentes (maiúscula) importados e só usados em JSX não contam como "sem uso"; _nome é descarte de propósito.
  'no-unused-vars': ['warn', {
    varsIgnorePattern: '^[A-Z_]',
    argsIgnorePattern: '^_',
    caughtErrors: 'none',
    ignoreRestSiblings: true,
  }],
  'no-empty': ['error', { allowEmptyCatch: true }],   // o projeto usa catch { /* ... */ } de propósito
};

export default [
  { ignores: ['dist/**', 'release/**', 'build/**', 'node_modules/**', 'src/features/vale/pokedex.json'] },
  js.configs.recommended,

  {
    files: ['src/**/*.{js,jsx}', 'vite.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...regrasComuns,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  {
    files: ['electron/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      // o webview-preload.js roda dentro da página do jogo, então também enxerga window/document
      globals: { ...globals.node, ...globals.browser },
    },
    rules: regrasComuns,
  },
];
