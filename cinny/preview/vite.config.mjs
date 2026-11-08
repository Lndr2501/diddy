// Dev-server config for the call tile preview: same plugins as the app, two hooks stubbed.
import { fileURLToPath } from 'node:url';
import base from '../vite.config.js';

const stub = fileURLToPath(new URL('./stubs.ts', import.meta.url));
export default {
  ...base,
  root: fileURLToPath(new URL('..', import.meta.url)),
  resolve: {
    ...(base.resolve ?? {}),
    alias: [
      ...(Array.isArray(base.resolve?.alias) ? base.resolve.alias : []),
      { find: /^(\.\.?\/)+hooks\/useMediaAuthentication$/, replacement: stub },
      { find: /^\.\/useMediaAuthentication$/, replacement: stub },
    ],
  },
};
