# Advanced Caching Strategies

Effective caching can dramatically reduce workflow execution time and cost. This guide covers patterns for complex caching scenarios.

## Cache Fundamentals

### How Cache Keys Work

Cache entries are identified by a unique key. When a workflow runs:

1. **Restore phase**: Checks for exact key match → falls back to `restore-keys` prefix matches
2. **Save phase**: Creates new cache entry with the exact key (if not already exists)

**Key patterns:**

```yaml
- uses: actions/cache@cdf6c1fa76f9f475f3d7449005a359c84ca0f306 # v5.0.3
  with:
    path: ~/.npm
    key: npm-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
    restore-keys: |
      npm-${{ runner.os }}-
```

**Matching logic:**
- Tries exact match: `npm-Linux-abc123def456`
- Falls back to: `npm-Linux-` (most recent)

### Cache Limits

- **Maximum cache size**: 10 GB per repository
- **Maximum entries**: Unlimited, but old entries are evicted when total exceeds 10 GB
- **Eviction policy**: Least recently used (LRU)
- **Retention**: 7 days if not accessed

**Best practices:**
- Keep caches focused and minimal
- Don't cache generated artifacts
- Use multiple caches instead of one giant cache
- Regularly validate cache effectiveness

## Language-Specific Patterns

### Node.js / npm

**Simple approach (built-in):**

```yaml
- uses: actions/setup-node@cdf6c1fa76f9f475f3d7449005a359c84ca0f306 # v5.0.3
  with:
    node-version: '20'
    cache: 'npm'  # Automatically handles caching

- run: npm ci
```

**Advanced multi-path caching:**

```yaml
- uses: actions/cache@cdf6c1fa76f9f475f3d7449005a359c84ca0f306 # v5.0.3
  with:
    path: |
      ~/.npm
      node_modules
      .next/cache
    key: node-${{ runner.os }}-${{ hashFiles('package-lock.json') }}-${{ hashFiles('.next/cache/**') }}
    restore-keys: |
      node-${{ runner.os }}-${{ hashFiles('package-lock.json') }}-
      node-${{ runner.os }}-
```

### Python / pip

**Built-in approach:**

```yaml
- uses: actions/setup-python@a309ff8b426b58ec0e2a45f0f869d46889d02405  # v6.0.2
  with:
    python-version: '3.11'
    cache: 'pip'

- run: pip install -r requirements.txt
```

**Poetry with custom cache:**

```yaml
- uses: actions/cache@cdf6c1fa76f9f475f3d7449005a359c84ca0f306 # v5.0.3
  with:
    path: |
      ~/.cache/pypoetry
      .venv
    key: poetry-${{ runner.os }}-python-${{ matrix.python-version }}-${{ hashFiles('poetry.lock') }}
    restore-keys: |
      poetry-${{ runner.os }}-python-${{ matrix.python-version }}-
      poetry-${{ runner.os }}-
```

### Rust / Cargo

**Comprehensive Cargo cache:**

```yaml
- uses: actions/cache@cdf6c1fa76f9f475f3d7449005a359c84ca0f306 # v5.0.3
  with:
    path: |
      ~/.cargo/bin/
      ~/.cargo/registry/index/
      ~/.cargo/registry/cache/
      ~/.cargo/git/db/
      target/
    key: cargo-${{ runner.os }}-${{ hashFiles('**/Cargo.lock') }}
    restore-keys: |
      cargo-${{ runner.os }}-
```

**Optimization: Separate registry from target:**

```yaml
- uses: actions/cache@cdf6c1fa76f9f475f3d7449005a359c84ca0f306 # v5.0.3
  with:
    path: |
      ~/.cargo/registry/index/
      ~/.cargo/registry/cache/
      ~/.cargo/git/db/
    key: cargo-registry-${{ hashFiles('**/Cargo.lock') }}

- uses: actions/cache@cdf6c1fa76f9f475f3d7449005a359c84ca0f306 # v5.0.3
  with:
    path: target/
    key: cargo-target-${{ runner.os }}-${{ hashFiles('**/Cargo.lock') }}-${{ hashFiles('**/*.rs') }}
    restore-keys: |
      cargo-target-${{ runner.os }}-${{ hashFiles('**/Cargo.lock') }}-
      cargo-target-${{ runner.os }}-
```

### Go

**Go modules cache:**

```yaml
- uses: actions/cache@cdf6c1fa76f9f475f3d7449005a359c84ca0f306 # v5.0.3
  with:
    path: |
      ~/go/pkg/mod
      ~/.cache/go-build
    key: go-${{ runner.os }}-${{ hashFiles('**/go.sum') }}
    restore-keys: |
      go-${{ runner.os }}-
```

### Ruby / Bundler

**Bundler cache:**

```yaml
- uses: ruby/setup-ruby@09a7688d3b55cf0e976497ff046b70949eeaccfd  # v1.288.0
  with:
    ruby-version: '3.2'
    bundler-cache: true  # Built-in caching
```

**Manual approach:**

```yaml
- uses: actions/cache@cdf6c1fa76f9f475f3d7449005a359c84ca0f306 # v5.0.3
  with:
    path: vendor/bundle
    key: bundle-${{ runner.os }}-${{ hashFiles('**/Gemfile.lock') }}
    restore-keys: |
      bundle-${{ runner.os }}-

- run: |
    bundle config path vendor/bundle
    bundle install --jobs 4 --retry 3
```

### Java / Maven

**Maven dependencies:**

```yaml
- uses: actions/cache@cdf6c1fa76f9f475f3d7449005a359c84ca0f306 # v5.0.3
  with:
    path: ~/.m2/repository
    key: maven-${{ runner.os }}-${{ hashFiles('**/pom.xml') }}
    restore-keys: |
      maven-${{ runner.os }}-

- run: mvn clean install
```

### Java / Gradle

**Gradle cache:**

```yaml
  # https://github.com/gradle/actions/blob/main/docs/setup-gradle.md
- uses: gradle/actions/setup-gradle@f29f5a9d7b09a7c6b29859002d29d24e1674c884  # v5.0.1
  with:
    gradle-version: '8.10' # Quotes required to prevent YAML converting to number

- run: ./gradlew build
```

**Manual approach:**

```yaml
- uses: actions/cache@cdf6c1fa76f9f475f3d7449005a359c84ca0f306 # v5.0.3
  with:
    path: |
      ~/.gradle/caches
      ~/.gradle/wrapper
    key: gradle-${{ runner.os }}-${{ hashFiles('**/*.gradle*', '**/gradle-wrapper.properties') }}
    restore-keys: |
      gradle-${{ runner.os }}-
```

## Advanced Patterns

### Multi-Stage Caching

**Problem**: Different steps need different cache granularity

**Solution**: Use multiple caches with different keys

```yaml
jobs:
  build:
    steps:
      # Cache 1: Dependencies (changes rarely)
      - uses: actions/cache@cdf6c1fa76f9f475f3d7449005a359c84ca0f306 # v5.0.3
        with:
          path: ~/.npm
          key: npm-deps-${{ hashFiles('package-lock.json') }}

      # Cache 2: Build output (changes frequently)
      - uses: actions/cache@cdf6c1fa76f9f475f3d7449005a359c84ca0f306 # v5.0.3
        with:
          path: dist/
          key: build-${{ github.sha }}
          restore-keys: build-

      - run: npm ci
      - run: npm run build
```

### Cross-Job Caching

**Share cache between jobs in same workflow:**

```yaml
jobs:
  prepare:
    runs-on: ${{ vars.DEFAULT_DEV_UBUNTU_RUNNER }}
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.1
      - uses: actions/cache@cdf6c1fa76f9f475f3d7449005a359c84ca0f306 # v5.0.3
        with:
          path: node_modules
          key: deps-${{ hashFiles('package-lock.json') }}
      - run: npm ci

  test:
    needs: prepare
    runs-on: ${{ vars.DEFAULT_DEV_UBUNTU_RUNNER }}
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.1
      - uses: actions/cache@cdf6c1fa76f9f475f3d7449005a359c84ca0f306 # v5.0.3
        with:
          path: node_modules
          key: deps-${{ hashFiles('package-lock.json') }}
      - run: npm test

  build:
    needs: prepare
    runs-on: ${{ vars.DEFAULT_DEV_UBUNTU_RUNNER }}
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.1
      - uses: actions/cache@cdf6c1fa76f9f475f3d7449005a359c84ca0f306 # v5.0.3
        with:
          path: node_modules
          key: deps-${{ hashFiles('package-lock.json') }}
      - run: npm run build
```

### Conditional Cache Saving

**Only save cache on main branch:**

```yaml
- uses: actions/cache@cdf6c1fa76f9f475f3d7449005a359c84ca0f306 # v5.0.3
  if: github.ref == 'refs/heads/main'
  with:
    path: ~/.npm
    key: npm-${{ hashFiles('package-lock.json') }}
```

**Separate caches for branches:**

```yaml
- uses: actions/cache@cdf6c1fa76f9f475f3d7449005a359c84ca0f306 # v5.0.3
  with:
    path: node_modules
    key: deps-${{ github.ref }}-${{ hashFiles('package-lock.json') }}
    restore-keys: |
      deps-${{ github.ref }}-
      deps-refs/heads/main-
```

### Cache Warming

**Pre-populate cache for faster subsequent runs:**

```yaml
name: Warm Cache

on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday
  workflow_dispatch:

jobs:
  warm-cache:
    runs-on: ${{ vars.DEFAULT_DEV_UBUNTU_RUNNER }}
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.1

      - uses: actions/cache@cdf6c1fa76f9f475f3d7449005a359c84ca0f306 # v5.0.3
        with:
          path: |
            ~/.npm
            node_modules
          key: deps-warm-${{ hashFiles('package-lock.json') }}

      - run: npm ci
      - run: npm run build  # Warm build cache too
```

### Docker Layer Caching

**Using Docker buildx:**

```yaml
- name: Set up Docker Buildx
  uses: docker/setup-buildx-action@f95db51fddba0c2d1ec667646a06c2ce06100226  # v3.0.0

- name: Build and push
  uses: docker/build-push-action@263435318d21b8e681c14492fe198d362a7d2c83 # v6.18.0
  with:
    context: .
    push: false
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

**Using cache action for Docker:**

```yaml
- uses: actions/cache@cdf6c1fa76f9f475f3d7449005a359c84ca0f306 # v5.0.3
  with:
    path: /tmp/.buildx-cache
    key: docker-${{ runner.os }}-${{ hashFiles('Dockerfile') }}
    restore-keys: docker-${{ runner.os }}-

- uses: docker/build-push-action@263435318d21b8e681c14492fe198d362a7d2c83 # v6.18.0
  with:
    context: .
    cache-from: type=local,src=/tmp/.buildx-cache
    cache-to: type=local,dest=/tmp/.buildx-cache-new,mode=max

- name: Move cache
  run: |
    rm -rf /tmp/.buildx-cache
    mv /tmp/.buildx-cache-new /tmp/.buildx-cache
```

## Troubleshooting

### Cache Not Restoring

**Check:**
1. Verify cache key matches exactly or has valid restore-keys
2. Ensure path exists and is correct
3. Check cache hasn't expired (7 days)
4. Review cache size limits

**Debug cache hits:**

```yaml
- uses: actions/cache@cdf6c1fa76f9f475f3d7449005a359c84ca0f306 # v5.0.3
  id: cache
  with:
    path: node_modules
    key: deps-${{ hashFiles('package-lock.json') }}

- name: Check cache
  run: |
    if [ "${{ steps.cache.outputs.cache-hit }}" == "true" ]; then
      echo "Cache hit!"
    else
      echo "Cache miss, installing dependencies..."
    fi
```

### Cache Size Issues

**Identify large cache entries:**

```yaml
- name: Check cache size
  run: |
    du -sh ~/.npm
    du -sh node_modules
    du -sh .next/cache
```

**Optimize by excluding unnecessary files:**

```yaml
- uses: actions/cache@cdf6c1fa76f9f475f3d7449005a359c84ca0f306 # v5.0.3
  with:
    path: |
      node_modules
      !node_modules/.cache
      !node_modules/**/*.md
    key: deps-${{ hashFiles('package-lock.json') }}
```

### Cache Corruption

**Clear and rebuild cache:**

```yaml
- uses: actions/cache@cdf6c1fa76f9f475f3d7449005a359c84ca0f306 # v5.0.3
  with:
    path: ~/.npm
    key: npm-${{ runner.os }}-v2-${{ hashFiles('package-lock.json') }}  # Increment version
```

Or manually delete via GitHub UI:
Actions → Caches → Delete specific cache

## Cache Performance Metrics

**Measure cache effectiveness:**

```yaml
- name: Benchmark cache
  run: |
    START_TIME=$(date +%s)
    npm ci
    END_TIME=$(date +%s)
    echo "Installation took: $((END_TIME - START_TIME)) seconds"
    echo "Cache hit: ${{ steps.cache.outputs.cache-hit }}"
```

**Expected improvements:**
- Node.js npm: 2-5x faster with cache
- Python pip: 3-10x faster with cache
- Rust cargo: 5-20x faster with cache
- Go modules: 2-4x faster with cache

## Best Practices Summary

1. **Use built-in caching when available** (setup-node, setup-python, etc.)
2. **Keep caches focused** - separate dependencies from build output
3. **Use descriptive cache keys** - include OS, language version, lock file hash
4. **Implement restore-keys** - fallback to partial matches
5. **Monitor cache size** - stay well under 10 GB limit
6. **Version cache keys** - increment when cache structure changes
7. **Test cache misses** - ensure workflows work without cache
8. **Document cache strategy** - explain what's cached and why
