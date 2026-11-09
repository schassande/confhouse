import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/**
 * PrimeNG preset aligned with the snowcamp.io visual identity.
 * Based on Aura, with a primary palette built around the snowcamp purple `#544a78`.
 * Global color tokens are mirrored as CSS variables in `styles.scss`.
 */
export const SnowcampPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#f4f3f8',
      100: '#e6e3ef',
      200: '#cdc7df',
      300: '#aca3c8',
      400: '#8579ab',
      500: '#544a78',
      600: '#4a4169',
      700: '#3f3859',
      800: '#342e49',
      900: '#2e2841',
      950: '#1c1828',
    },
  },
});
