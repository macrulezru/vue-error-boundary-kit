---
name: Feature request
about: Propose new functionality or an API change
title: ''
labels: enhancement
assignees: ''
---

**What problem does this solve?**
Describe the use case — ideally with a concrete example of code you'd want to write but currently can't.

**Proposed API**
Sketch the shape you have in mind (prop, option, new entry point, etc.), if you have one.

```ts
// e.g. a new option on useErrorBoundary(), a new adapter, ...
```

**Alternatives considered**
Any workaround you're using today, or other libraries that solve this.

**Would this fit the package's constraints?**
This package is intentionally zero-runtime-dependency (beyond the `vue` peer) and avoids internal Vue renderer APIs — see [CONTRIBUTING.md](../../CONTRIBUTING.md#design-constraints-worth-knowing-before-you-start). If your proposal needs either, say so; it may still be worth discussing as an opt-in entry point.
