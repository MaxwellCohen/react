'use strict';

/* global React, ReactDOM, performance */

const UPDATES = 100000;

function App({onDone}) {
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
        throw new Error(
          'State drifted from expected value: ' +
            outputRef.current +
            ' !== ' +
            last
        );
      }
      if (element.textContent !== String(last)) {
        throw new Error(
          'DOM out of sync: ' + element.textContent + ' !== ' + last
        );
      }
      if (last === UPDATES) {
        performance.mark(':done');
        performance.measure('Incrementing Render Effect', ':start', ':done');
        onDone();
        return;
      }
      Promise.resolve().then(() => {
        last = last + 1;
        setOutput(last);
      });
    };

    advancerRef.current = advance;
    performance.mark(':start');
    advance();
  });

  return React.createElement('output', {ref: elRef}, output);
}

function render() {
  return new Promise(resolve => {
    const root = ReactDOM.createRoot(document.getElementById('app'));
    root.render(
      React.createElement(App, {
        onDone: resolve,
      })
    );
  });
}

module.exports = render;
