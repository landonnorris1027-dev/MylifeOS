import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';

/**
 * Accessibility linting only.
 *
 * The project has no general-purpose lint baseline, and adding one now would
 * bury the a11y signal under thousands of style complaints. This config is
 * deliberately scoped: it parses TS/TSX and runs the jsx-a11y rules, nothing
 * else. Formatting is not its job.
 *
 * Rules are split by what they can actually prove:
 *
 * - `error` — statically decidable and almost always a real defect
 *   (a clickable div that cannot be focused, a label pointing nowhere).
 * - `warn`  — real but with legitimate exceptions in this codebase; the list
 *   below documents each exception rather than silencing the rule entirely.
 */
export default tseslint.config(
  {
    ignores: [
      'dist',
      'dist-main',
      'out',
      'build',
      'node_modules',
      'output',
      'tmp',
      'android',
      'public',
      'scripts',
    ],
  },
  {
    // Test files render stand-ins (`<div onClick>` mocks, fixture wrappers)
    // that exist only to drive a component. Linting them reports the harness,
    // not the product.
    ignores: ['**/*.test.ts', '**/*.test.tsx', 'src/testSetup.ts'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' },
    },
    plugins: { 'jsx-a11y': jsxA11y },
    settings: {
      'jsx-a11y': {
        // Custom components forward their props to the DOM element, so the
        // plugin has to resolve them the way React does.
        components: {
          Button: 'button',
          IconButton: 'button',
          Input: 'input',
          Textarea: 'textarea',
          Select: 'select',
        },
        attributes: {
          for: ['htmlFor'],
        },
      },
    },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,

      // --- Promoted to error: silent breakage that a screenshot cannot catch.
      'jsx-a11y/label-has-associated-control': [
        'error',
        {
          assert: 'either',
          depth: 3,
          labelComponents: [],
          labelAttributes: [],
          controlComponents: ['Input', 'Textarea', 'Select', 'NumberField', 'Switch', 'Checkbox'],
        },
      ],
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-proptypes': 'error',
      'jsx-a11y/aria-role': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',
      'jsx-a11y/no-redundant-roles': 'error',

      // --- Kept at warn, with the handler set narrowed to real click targets.
      //
      // Both rules answer "does this look clickable but ignore the keyboard?".
      // They infer clickability from any handler, which misfires on three
      // patterns this codebase uses on purpose:
      //   * `onClick={e => e.stopPropagation()}` — containment, not a target;
      //   * `onPointerEnter/Leave` and `onDragOver` — hover and drop-zone
      //     affordances that are enhancements, never the only path;
      //   * keyboard events delegated from a child to a list container.
      // Narrowing `handlers` keeps the rule pointing at actual onClick /
      // onMouseDown targets, which is what the rule is really about.
      'jsx-a11y/click-events-have-key-events': ['warn', {
        handlers: ['onClick', 'onMouseDown', 'onMouseUp'],
      }],
      'jsx-a11y/no-static-element-interactions': ['warn', {
        handlers: ['onClick', 'onMouseDown', 'onMouseUp'],
      }],
      // Deliberately off: a scroll container must accept focus so keyboard
      // users can scroll it (WCAG 2.1.1). ContributionGraph marks its
      // horizontally scrollable year view `tabIndex={0} role="region"`, which
      // this rule flags even though it is the documented remedy.
      'jsx-a11y/no-noninteractive-tabindex': 'off',
      // Focus moves programmatically when a dialog opens or a task mounts;
      // that is the intended behaviour, not a stray autoFocus.
      'jsx-a11y/no-autofocus': 'off',
      // The app is a single document; media-caption rules do not apply.
      'jsx-a11y/media-has-caption': 'off',
    },
  },
);
