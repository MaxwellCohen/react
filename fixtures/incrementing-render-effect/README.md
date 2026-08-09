# Incrementing render-effect microbenchmark

Chained `useLayoutEffect` → microtask → `setState` loop used to stress
post-commit update costs in React.

## Preferred harness

Use the scripts/bench entry (compares local UMD builds via Lighthouse user timings):

```bash
yarn --cwd=../.. build react/index,react-dom/index --type=UMD_PROD
cd ../../scripts/bench
yarn start --skip-build --local --headless --benchmark=incrementing
```

## Jest informational timing

```bash
yarn test --no-watchman ReactDOMIncrementingRenderEffectPerf-test
```

This runs 5,000 iterations under the Jest/jsdom environment and logs ms/update.
Absolute numbers are not comparable to Chrome production timings; use the
scripts/bench harness for that.
