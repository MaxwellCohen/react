/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

/**
 * Informational microbenchmark for chained layout-effect → setState.
 * Logs timing; soft upper bound only so CI catches runaway regressions.
 *
 * Also covered by the scripts/bench/benchmarks/incrementing-render-effect harness.
 */

let React;
let ReactDOMClient;
let act;

const UPDATES = 5000;

describe('ReactDOMIncrementingRenderEffectPerf', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactDOMClient = require('react-dom/client');
    act = require('internal-test-utils').act;
  });

  it('times chained layout-effect increments (informational)', async () => {
    const container = document.createElement('div');
    const root = ReactDOMClient.createRoot(container);

    function App() {
      const [output, setOutput] = React.useState(-1);
      const advancerRef = React.useRef(null);
      const outputRef = React.useRef(-1);
      const elRef = React.useRef(null);
      outputRef.current = output;

      React.useLayoutEffect(() => {
        if (advancerRef.current) {
          advancerRef.current();
          return;
        }

        let last = -1;
        const element = elRef.current;
        const advance = () => {
          if (outputRef.current !== last) {
            throw new Error('state drifted');
          }
          if (element.textContent !== String(last)) {
            throw new Error('DOM out of sync');
          }
          if (last === UPDATES) {
            return;
          }
          Promise.resolve().then(() => {
            last = last + 1;
            setOutput(last);
          });
        };

        advancerRef.current = advance;
        advance();
      });

      return <output ref={elRef}>{output}</output>;
    }

    const start = performance.now();
    await act(() => {
      root.render(<App />);
    });
    const elapsed = performance.now() - start;

    expect(container.textContent).toBe(String(UPDATES));
    // eslint-disable-next-line no-console
    console.log(
      `[incrementing-render-effect] ${UPDATES} updates in ${elapsed.toFixed(1)} ms ` +
        `(${(elapsed / UPDATES).toFixed(3)} ms/update)`,
    );
    expect(elapsed).toBeLessThan(60000);
  }, 60000);
});
