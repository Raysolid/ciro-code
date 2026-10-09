import { test, expect } from '@playwright/test';

/**
 * Optional browser/API smoke against a running `ciro web --mock`.
 * Primary CI gate is Vitest `app.e2e.test.ts`.
 *
 *   node apps/ciro-cli/dist/cli.js web --mock --no-open
 *   CIRO_E2E_BASE_URL=http://127.0.0.1:3080 pnpm --filter @ciro/harness-web test:e2e
 */
const baseURL = process.env.CIRO_E2E_BASE_URL;

test.describe('Playwright against live server', () => {
  test.skip(!baseURL, 'Set CIRO_E2E_BASE_URL to run');

  test('Ask denies write', async ({ request }) => {
    const session = await request.post(`${baseURL}/api/v1/sessions`, {
      data: { mode: 'ask' },
    });
    expect(session.ok()).toBeTruthy();
    const { id } = (await session.json()) as { id: string };

    const chat = await request.post(`${baseURL}/api/v1/chat/${id}/send`, {
      data: { message: 'Please write to file.txt' },
    });
    expect(chat.ok()).toBeTruthy();
    expect(await chat.text()).toContain('error');
  });

  test('Agent completes write turn', async ({ request }) => {
    const session = await request.post(`${baseURL}/api/v1/sessions`, {
      data: { mode: 'agent' },
    });
    const { id } = (await session.json()) as { id: string };

    const chat = await request.post(`${baseURL}/api/v1/chat/${id}/send`, {
      data: { message: 'write pw-out.txt <<<from-playwright>>>', mode: 'agent' },
    });
    expect(chat.ok()).toBeTruthy();
    expect(await chat.text()).toContain('complete');
  });
});
