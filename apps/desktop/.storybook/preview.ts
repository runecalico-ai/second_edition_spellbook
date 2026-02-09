import type { Preview } from '@storybook/react-vite';
import '../src/index.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },

    a11y: {
      // 'error' - fail tests on a11y violations (enables automated defect detection)
      // 'todo' - show a11y violations in the test UI only (current: using 'todo' to avoid false positives)
      // 'off' - skip a11y checks entirely
      test: 'todo',
      config: {
        rules: {
          // Allow color contrast issues in dark mode for now (components use dark backgrounds)
          'color-contrast': { enabled: false },
        },
      },
    },

    backgrounds: {
      default: 'dark',
      values: [
        {
          name: 'dark',
          value: '#1a1a1a',
        },
        {
          name: 'light',
          value: '#ffffff',
        },
      ],
    },
  },
};

export default preview;
