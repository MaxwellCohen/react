import {Document} from './doc';
import CollapseAll from './comments-thread-recursive.collapse.client';

export const id = 'comments-thread-recursive';
export const title = 'Deeply nested recursive comment thread';
export const category = 'recursion';
export const description =
  'Pure server comment thread (avatar, author, text, nested replies up to depth 8) laid out as a binary tree; one client collapse-all label button. size = total comments.';
export const expectedBenefit = 'high';
export const sizes = {smoke: 30, full: 500};

const names = ['Alice Johnson', 'Bob Williams', 'Carol Davis', 'Dan Miller', 'Eve Wilson', 'Frank Moore', 'Grace Taylor'];
const bodies = [
  'Great write-up. The part about boundaries finally made it click for me.',
  'I disagree with the last point, the cache behaviour is different on mobile.',
  'Could you share the benchmark numbers? Curious how this scales past a few thousand rows.',
  'Same here. Shipped it last week and the payload dropped noticeably.',
  'Minor nit: the second example is missing an import.',
];

// Binary-heap layout: comment k's replies are 2k+1 and 2k+2. For 500 comments
// the maximum depth is 8 (indices 255..499), as required.
function Comment({k, n}) {
  const kids = [2 * k + 1, 2 * k + 2].filter(c => c < n);
  const name = names[k % names.length];
  return (
    <li className="comment" data-depth={Math.floor(Math.log2(k + 1))}>
      <div className="meta">
        <span className="avatar">{name.split(' ').map(w => w[0]).join('')}</span>
        <strong className="author">{name}</strong>
        <span className="time">{(k % 23) + 1} hours ago</span>
      </div>
      <p className="text">{bodies[k % bodies.length] + ' (#' + (k + 1) + ')'}</p>
      {kids.length > 0 && (
        <ul className="replies">
          {kids.map(c => (
            <Comment key={c} k={c} n={n} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function Root({size}) {
  return (
    <Document title="Discussion">
      <main>
        <h1>Discussion ({size} comments)</h1>
        <CollapseAll />
        <ul className="thread">{size > 0 && <Comment k={0} n={size} />}</ul>
      </main>
    </Document>
  );
}

export const interact = [
  {click: 'button.collapse-all', nth: 0},
  {expectText: {selector: 'button.collapse-all', nth: 0, text: 'Expand all'}},
  {expectCount: {selector: 'li.comment', count: 'size'}},
];
