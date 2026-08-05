# Performance Rules

- Optimize delivery for reads and compile snapshots at publication.
- Use cursor pagination for scalable lists.
- Bound page size, filters, sorting, expansion depth, nested values, and response size.
- Prevent N+1 query patterns.
- Select only required data.
- Add and verify indexes based on real query paths.
- Use connection pooling and observe pool behavior.
- Avoid unbounded concurrency, retries, queues, logs, metrics labels, or in-memory caches.
- Measure before introducing clever optimizations.
