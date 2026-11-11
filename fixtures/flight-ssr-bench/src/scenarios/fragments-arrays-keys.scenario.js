import {Fragment} from 'react';
import {Document} from './doc';
import Leaf from './fragments-arrays-keys.leaf.client';

export const id = 'fragments-arrays-keys';
export const title = 'Fragments, arrays, keys and empty children';
export const category = 'static';
export const description =
  'Nested and keyed Fragments, keyed arrays, unkeyed text arrays, null/false/undefined/""/0 children, adjacent text nodes, plus one client leaf.';
export const expectedBenefit = 'low';

export function Root() {
  return (
    <Document title="Fragments">
      <div id="a">
        <>
          <>
            <span>nested</span>
          </>
          {null}
          {false}
          {undefined}
          {''}
          {0}
        </>
        text-1{' '}text-2{3}
        {['u', 'v', 'w']}
      </div>
      <div id="b">
        {[1, 2, 3].map(i => (
          <Fragment key={'f' + i}>
            <b>b{i}</b>
            <i>i{i}</i>
          </Fragment>
        ))}
        <Fragment key="solo">
          <u>solo</u>
        </Fragment>
        {[<em key="e1">e1</em>, <em key="e2">e2</em>]}
      </div>
      <div id="c">
        <Leaf />
        {[<p key="p">after leaf</p>]}
        {null}
      </div>
    </Document>
  );
}

export const interact = [
  {expectText: {selector: '#a', text: 'nested0text-1 text-23uvw'}},
  {expectText: {selector: '#b', text: 'b1i1b2i2b3i3soloe1e2'}},
  {click: 'button.leaf'},
  {expectText: {selector: 'button.leaf', text: 'leaf 1'}},
  {expectText: {selector: '#c p', text: 'after leaf'}},
];
