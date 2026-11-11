import {Document} from './doc';
import Collapse from './docs-sidebar-toc.collapse.client';

export const id = 'docs-sidebar-toc';
export const title = 'Docs page with sidebar tree and table of contents';
export const category = 'static';
export const description =
  'Large server-rendered sidebar navigation tree, an in-page table of contents and content sections, plus one client button that toggles an attribute on itself.';
export const expectedBenefit = 'high';
// size = number of docs sections (each has 4 sidebar links and 1 TOC entry).
export const sizes = {smoke: 12, full: 400};

const GROUPS = ['Getting started', 'Guides', 'Concepts', 'API reference', 'Operations'];

function sectionId(i) {
  return 'section-' + i;
}

function Sidebar({size}) {
  const groups = [];
  for (let g = 0; g < GROUPS.length; g++) {
    const items = [];
    for (let i = g; i < size; i += GROUPS.length) {
      items.push(
        <li key={i}>
          <a href={'#' + sectionId(i)}>Topic {i}</a>
          <ul>
            <li>
              <a href={'/docs/' + i + '/install'}>Install</a>
            </li>
            <li>
              <a href={'/docs/' + i + '/usage'}>Usage</a>
            </li>
            <li>
              <a href={'/docs/' + i + '/options'}>Options</a>
            </li>
          </ul>
        </li>
      );
    }
    groups.push(
      <li key={g} className="group">
        <span>{GROUPS[g]}</span>
        <ul>{items}</ul>
      </li>
    );
  }
  return (
    <nav className="sidebar" aria-label="Docs">
      <ul>{groups}</ul>
    </nav>
  );
}

function Toc({size}) {
  const entries = [];
  for (let i = 0; i < size; i++) {
    entries.push(
      <li key={i}>
        <a href={'#' + sectionId(i)}>Topic {i}</a>
      </li>
    );
  }
  return (
    <nav className="toc" aria-label="On this page">
      <ul>{entries}</ul>
    </nav>
  );
}

function Section({i}) {
  return (
    <section id={sectionId(i)}>
      <h2>Topic {i}</h2>
      <p>
        This section documents topic {i}. It covers the configuration surface, the defaults that ship with the
        package, and the common mistakes teams make when they first wire it into an existing project.
      </p>
      <pre>
        <code>{'const config' + i + ' = {enabled: true, retries: ' + (i % 4) + '};'}</code>
      </pre>
    </section>
  );
}

export function Root({size}) {
  const sections = [];
  for (let i = 0; i < size; i++) sections.push(<Section key={i} i={i} />);
  return (
    <Document title="Docs">
      <div className="layout">
        <Collapse />
        <Sidebar size={size} />
        <main>
          <h1>Reference documentation</h1>
          <Toc size={size} />
          {sections}
        </main>
      </div>
    </Document>
  );
}

export const interact = [
  {click: 'button.collapse-toggle'},
  {expectText: {selector: 'button.collapse-toggle', text: 'Sidebar: collapsed'}},
  {expectCount: {selector: 'nav.toc a', count: 'size'}},
];
