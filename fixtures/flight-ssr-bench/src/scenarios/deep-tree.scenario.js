import {Document} from './doc';
import Counter from './deep-tree.counter.client';

export const id = 'deep-tree';
export const title = 'Deeply nested tree';
export const category = 'composition';
export const description =
  'A chain of `size` nested divs, one paragraph at each level, with a single client counter at the deepest level.';
export const expectedBenefit = 'high';
export const sizes = {smoke: 20, full: 200};

function Node({depth, max}) {
  return (
    <div className="node" data-depth={depth}>
      <p>
        Level {depth} of {max}
      </p>
      {depth < max ? (
        <Node depth={depth + 1} max={max} />
      ) : (
        <Counter label="deep" />
      )}
    </div>
  );
}

export function Root({size}) {
  return (
    <Document title="Deep tree">
      <main>
        <h1>Deep tree</h1>
        <Node depth={1} max={size} />
      </main>
    </Document>
  );
}

export const interact = [
  {click: 'button.counter'},
  {expectText: {selector: 'button.counter', text: 'deep: 1'}},
  {expectCount: {selector: 'div.node', count: 'size'}},
];
