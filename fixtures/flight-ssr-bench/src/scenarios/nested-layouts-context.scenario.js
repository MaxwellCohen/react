import {Document} from './doc';
import ThemeLayout from './nested-layouts-context.theme.client';
import LocaleLayout from './nested-layouts-context.locale.client';
import UserLayout from './nested-layouts-context.user.client';
import Leaf from './nested-layouts-context.leaf.client';

export const id = 'nested-layouts-context';
export const title = 'Nested client layouts with context';
export const category = 'client';
export const description =
  'Three nested client layouts each provide a context (theme, locale, user) and render server-passed children; a client leaf reads all three and toggles its theme label.';
export const expectedBenefit = 'low';
export const sizes = {smoke: 5, full: 200};

export function Root({size}) {
  return (
    <Document title="Nested layouts">
      <ThemeLayout>
        <LocaleLayout>
          <UserLayout>
            <main>
              <h1>Nested layouts</h1>
              <Leaf />
              {Array.from({length: size}, (_, i) => (
                <section className="content" key={i}>
                  <h2>Section {i}</h2>
                  <p>
                    Server-rendered content section {i} passed through three client
                    layouts as children.
                  </p>
                </section>
              ))}
            </main>
          </UserLayout>
        </LocaleLayout>
      </ThemeLayout>
    </Document>
  );
}

export const interact = [
  {click: 'button.leaf'},
  {
    expectText: {
      selector: 'button.leaf',
      text: 'theme=dark-alt locale=en-US user=Ada',
    },
  },
  {expectCount: {selector: 'section.content', count: 'size'}},
  {expectText: {selector: 'section.content h2', text: 'Section 0'}},
];
