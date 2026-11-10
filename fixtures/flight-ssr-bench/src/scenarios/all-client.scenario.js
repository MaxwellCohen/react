import ClientPage from './all-client.page.client';

export const id = 'all-client';
export const title = 'Everything is a client component';
export const category = 'client';
export const description =
  'The server root only renders one client component that renders the whole document; nothing to elide.';
export const expectedBenefit = 'none';
export const sizes = {smoke: 5, full: 200};

export function Root({size}) {
  return <ClientPage size={size} />;
}

export const interact = [
  {click: '#inc'},
  {expectText: {selector: '#count', text: 'Count: 1'}},
];
