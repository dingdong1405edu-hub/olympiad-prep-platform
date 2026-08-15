import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // .tsx nằm trong danh sách để test được các thành phần hiển thị thuần (không
    // hook, không state) như bộ render công thức toán của đề thi.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    reporters: ['default'],
  },
  // tsconfig để `jsx: preserve` cho Next tự biên dịch; vitest chạy thẳng nên cần
  // tự bật cách biên dịch JSX ở đây.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
    },
  },
});
