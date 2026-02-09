import { setProjectAnnotations } from '@storybook/react-vite';
import * as projectAnnotations from './preview';

// This is an important step to apply the right configuration when testing your stories.
// More info at: https://storybook.js.org/docs/api/portable-stories/portable-stories-vitest#setprojectannotations
// Note: a11y addon is disabled in automated tests due to compatibility issues with Vitest
// Accessibility checks still run in interactive Storybook UI
setProjectAnnotations([projectAnnotations]);