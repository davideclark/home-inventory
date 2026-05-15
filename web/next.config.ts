import type { NextConfig } from 'next';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version } = require('./package.json') as { version: string };

const config: NextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
};

export default config;
