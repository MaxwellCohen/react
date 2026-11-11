# fizz-dpu test pages

Streams `<template for>` patches from a Node server. The flag is off in every build, so build with
`enableFizzDeclarativePatching = true` locally (do not commit that):

    node ./scripts/rollup/build.js react/index,react-dom/index,react-dom/src/server/react-dom-server.node,react-dom/unstable_server-external-runtime,scheduler --type=NODE_DEV,BROWSER_SCRIPT --releaseChannel=experimental
    PORT=3010 node fixtures/fizz-dpu/server.js

- `/` lists scenarios (basic, nested, many, svg, style, vt) as inline or external runtime, whole or in 3-byte chunks.
- `/fuzz` re-runs every scenario split into 0/1/3/17/64/500-byte chunks for both runtimes. Each page checks itself (title PASS/FAIL).
- `node fixtures/fizz-dpu/run-fuzz.js 3010` runs `/fuzz` in headless Chrome and prints failures.
