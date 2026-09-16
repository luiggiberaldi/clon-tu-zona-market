import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({plugins:[react()],resolve:{alias:{'@':resolve(__dirname)}},test:{environment:'jsdom',globals:true,maxWorkers:2,testTimeout:15000,setupFiles:['./tests/setup.ts'],include:['tests/**/*.{test,spec}.{ts,tsx}']}});
