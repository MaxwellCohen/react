import {Document} from './doc';
import Widget from './dashboard-client-widgets.widget.client';

export const id = 'dashboard-client-widgets';
export const title = 'Dashboard with client chart widgets';
export const category = 'composition';
export const description =
  'Mostly-server dashboard shell (header, sidebar, stat cards) with many small client widgets rendering inline SVG from numeric props. size = widgets.';
export const expectedBenefit = 'low';
export const sizes = {smoke: 4, full: 60};

const nav = ['Overview', 'Orders', 'Products', 'Customers', 'Reports', 'Settings'];
const stats = [
  ['Revenue', '$48,210'],
  ['Orders', '1,094'],
  ['Refunds', '17'],
  ['Visitors', '23,870'],
];

// Deterministic numeric series for widget i.
const seriesOf = i => Array.from({length: 12}, (_, j) => ((i * 7 + j * 13) % 23) + 1);

export function Root({size}) {
  const widgets = [];
  for (let i = 0; i < size; i++) widgets.push(i);
  return (
    <Document title="Dashboard">
      <header className="top">
        <strong>Acme Analytics</strong>
        <span className="range">Last 30 days</span>
      </header>
      <div className="layout">
        <aside className="sidebar">
          <ul>
            {nav.map(n => (
              <li key={n}>
                <a href={'/' + n.toLowerCase()}>{n}</a>
              </li>
            ))}
          </ul>
        </aside>
        <main>
          <div className="stats">
            {stats.map(([label, value]) => (
              <div className="stat" key={label}>
                <h3>{label}</h3>
                <p className="value">{value}</p>
              </div>
            ))}
          </div>
          <div className="widgets">
            {widgets.map(i => (
              <section className="widget" key={i}>
                <h2>Metric {i + 1}</h2>
                <Widget title={'Metric ' + (i + 1)} values={seriesOf(i)} />
              </section>
            ))}
          </div>
        </main>
      </div>
    </Document>
  );
}

export const interact = [
  {click: 'button.widget-toggle', nth: 0},
  {expectText: {selector: 'button.widget-toggle', nth: 0, text: 'Mode: bar'}},
  {click: 'button.widget-toggle', nth: 2},
  {expectText: {selector: 'button.widget-toggle', nth: 2, text: 'Mode: bar'}},
  {expectCount: {selector: 'section.widget', count: 'size'}},
];
