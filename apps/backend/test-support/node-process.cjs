// Stands in for `require("node:process")` in the tests only. See
// requireLikeNode in vitest.config.ts for why. With nodejs_compat, workerd's
// global `process` is the same object the real module exports.
module.exports = globalThis.process;
