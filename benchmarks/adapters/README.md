# Benchmark adapters (kata-only)

Shims that translate between pinned external benchmarks and KATA compiler
targets. Adapters must not edit task definitions, expected outputs, or
special-case task identifiers (Rule B). Record benchmark commit SHAs in
`../manifests/*.json` and asymmetric budgets as explicit, published
exclusions or not at all.
