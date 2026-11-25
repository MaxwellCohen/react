'use client';

import {Children, useState} from 'react';

// Keeps only the <li> children whose data-kind matches the selected kind.
export default function Filter({kinds, children}) {
  const [kind, setKind] = useState('all');
  const items = Children.toArray(children).filter(
    child =>
      child.type === 'li' &&
      (kind === 'all' || child.props['data-kind'] === kind)
  );
  return (
    <div className="filter">
      {['all'].concat(kinds).map(k => (
        <button key={k} className={'kind-' + k} onClick={() => setKind(k)}>
          {k}
        </button>
      ))}
      <ul>{items}</ul>
    </div>
  );
}
