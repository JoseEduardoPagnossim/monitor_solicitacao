const readonlyGlobals = (names) => Object.fromEntries(names.map((name) => [name, "readonly"]));

const browserGlobals = readonlyGlobals([
  "AbortController", "Blob", "CustomEvent", "Document", "Element", "Event", "File", "FileReader",
  "FormData", "HTMLDialogElement", "HTMLElement", "Image", "KeyboardEvent", "MutationObserver",
  "Notification", "ResizeObserver", "URL", "URLSearchParams", "WebSocket", "Window", "alert", "atob",
  "btoa", "clearInterval", "clearTimeout", "confirm", "console", "crypto", "document", "fetch", "history",
  "localStorage", "location", "matchMedia", "navigator", "performance", "queueMicrotask",
  "requestAnimationFrame", "sessionStorage", "setInterval", "setTimeout", "structuredClone", "window"
]);

const nodeGlobals = readonlyGlobals([
  "Buffer", "URL", "URLSearchParams", "clearInterval", "clearTimeout", "console", "crypto", "fetch",
  "performance", "process", "queueMicrotask", "setInterval", "setTimeout", "structuredClone"
]);

const serviceWorkerGlobals = readonlyGlobals(["Request", "Response", "URL", "caches", "clients", "fetch", "self"]);

const safetyRules = {
  "constructor-super": "error",
  "for-direction": "error",
  "getter-return": "error",
  "no-async-promise-executor": "error",
  "no-class-assign": "error",
  "no-compare-neg-zero": "error",
  "no-cond-assign": ["error", "except-parens"],
  "no-const-assign": "error",
  "no-constant-binary-expression": "error",
  "no-constant-condition": ["error", { checkLoops: false }],
  "no-control-regex": "error",
  "no-debugger": "error",
  "no-dupe-args": "error",
  "no-dupe-class-members": "error",
  "no-dupe-else-if": "error",
  "no-dupe-keys": "error",
  "no-duplicate-case": "error",
  "no-empty-character-class": "error",
  "no-ex-assign": "error",
  "no-extra-boolean-cast": "error",
  "no-fallthrough": "error",
  "no-func-assign": "error",
  "no-import-assign": "error",
  "no-invalid-regexp": "error",
  "no-irregular-whitespace": "error",
  "no-loss-of-precision": "error",
  "no-new-native-nonconstructor": "error",
  "no-obj-calls": "error",
  "no-promise-executor-return": "error",
  "no-prototype-builtins": "error",
  "no-self-assign": "error",
  "no-setter-return": "error",
  "no-shadow-restricted-names": "error",
  "no-sparse-arrays": "error",
  "no-this-before-super": "error",
  "no-undef": "error",
  "no-unexpected-multiline": "error",
  "no-unreachable": "error",
  "no-unreachable-loop": "error",
  "no-unsafe-finally": "error",
  "no-unsafe-negation": "error",
  "no-unsafe-optional-chaining": "error",
  "no-unused-labels": "error",
  "no-useless-backreference": "error",
  "no-useless-catch": "error",
  "no-useless-escape": "error",
  "no-with": "error",
  "require-yield": "error",
  "use-isnan": "error",
  "valid-typeof": "error"
};

export default [
  {
    name: "ignorar-arquivos-gerados",
    ignores: [".git/**", "node_modules/**", "_site/**", "coverage/**", "playwright-report/**", "test-results/**"]
  },
  {
    name: "javascript-base",
    files: ["**/*.{js,mjs}"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module" },
    linterOptions: { reportUnusedDisableDirectives: "warn" },
    rules: {
      ...safetyRules,
      eqeqeq: ["warn", "smart"],
      "no-console": "off",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrors: "none", varsIgnorePattern: "^_" }]
    }
  },
  {
    name: "navegador",
    files: [
      "app.js", "project-system.js", "save-flow.js", "supabase-compat.js", "supabase-config.js",
      "security-config.js", "legal-config.js"
    ],
    languageOptions: { globals: browserGlobals }
  },
  {
    name: "service-worker",
    files: ["service-worker.js"],
    languageOptions: { globals: { ...browserGlobals, ...serviceWorkerGlobals } }
  },
  {
    name: "node-e-testes",
    files: ["eslint.config.js", "playwright.config.mjs", "scripts/**/*.{js,mjs}", "tests/**/*.{js,mjs}", "e2e/**/*.{js,mjs}"],
    languageOptions: { globals: nodeGlobals }
  },
  {
    name: "legado-gradual",
    files: ["app.js", "supabase-compat.js"],
    rules: { "no-undef": "off", "no-unused-vars": "off", "no-fallthrough": "off" }
  }
];
