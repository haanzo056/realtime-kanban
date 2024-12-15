import { expect, test, type Browser, type Page } from '@playwright/test';

async function signIn(browser: Browser, name: string): Promise<Page> {
  // Separate contexts = separate localStorage, so these really are two users.
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await page.getByPlaceholder('Your name').fill(name);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(`Signed in as ${name}`)).toBeVisible();
  return page;
}

test('changes made by one client show up in the other', async ({ browser }) => {
  const suffix = Date.now().toString(36);
  const alice = await signIn(browser, `alice-${suffix}`);
  const bob = await signIn(browser, `bob-${suffix}`);

  await alice.getByPlaceholder('New board title').fill(`e2e ${suffix}`);
  await alice.getByRole('button', { name: 'Create' }).click();
  await alice.waitForURL(/\/board\//);
  await bob.goto(alice.url());

  await expect(alice.getByTestId('connection')).toContainText('Live');
  await expect(bob.getByTestId('connection')).toContainText('Live');
  await expect(alice.getByTestId('presence-avatar')).toHaveCount(2);
  await expect(bob.getByTestId('presence-avatar')).toHaveCount(2);

  const aliceTodo = alice.getByTestId('column-Todo');
  await aliceTodo.getByRole('button', { name: '+ Add card' }).click();
  await aliceTodo.getByPlaceholder('Card title').fill('Ship it');
  await aliceTodo.getByPlaceholder('Card title').press('Enter');

  const bobCard = bob.getByTestId('column-Todo').getByTestId('card').filter({ hasText: 'Ship it' });
  await expect(bobCard).toBeVisible();

  await bobCard.hover();
  await bobCard.getByRole('button', { name: 'Delete card' }).click();
  await expect(alice.getByTestId('card').filter({ hasText: 'Ship it' })).toHaveCount(0);

  await bob.close();
  await expect(alice.getByTestId('presence-avatar')).toHaveCount(1);
});
