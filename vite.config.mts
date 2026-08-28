import { globSync } from 'node:fs';
import { relative } from 'node:path';
import { defineConfig } from 'vite';

const sourceFiles: any = globSync('src/**/*.{ts,mts}');

export default defineConfig({
  build: {
    emptyOutDir: true,
    minify: 'esbuild',
    rollupOptions: {
      input: sourceFiles,
      external: (id: any) => sourceFiles.indexOf(id) === -1 && id.charAt(0) !== '.' && id.charAt(0) !== '/',
      preserveEntrySignatures: 'strict',
      output: {
        chunkFileNames: '[name].js',
        entryFileNames: ({ facadeModuleId }: { facadeModuleId: string | null }) => {
          const sourcePath: any = relative('src', facadeModuleId || '');
          const extension = sourcePath.slice(-4) === '.mts' ? '.mjs' : '.js';
          return sourcePath.replace(/\.(?:m?ts)$/, extension);
        },
        preserveModules: true,
        preserveModulesRoot: 'src',
      },
    },
  },
});
