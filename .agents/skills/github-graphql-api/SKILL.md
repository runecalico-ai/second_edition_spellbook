---
name: github-graphql-api
description: Expert guidance for GitHub GraphQL API development with proven patterns and working examples. Use when querying GitHub data, implementing GitHub integrations, working with repositories/issues/PRs/discussions via GraphQL, handling GitHub API rate limits, or building GitHub automation. Covers authentication, pagination, rate limiting, query optimization, and GitHub-specific patterns.
---

# GitHub GraphQL API Best Practices

Expert guidance for building robust GitHub integrations using the GitHub GraphQL API with proven patterns and working examples.

## When to Use This Skill

- Querying GitHub repositories, issues, pull requests, or discussions
- Implementing GitHub integrations and automations
- Optimizing GitHub GraphQL queries for rate limits
- Handling pagination with GitHub's connection pattern
- Authenticating to GitHub GraphQL API
- Migrating from GitHub REST API to GraphQL
- Troubleshooting GitHub API rate limits or node limits
- Working with global node IDs and references

## Core Principles

### GitHub GraphQL Specifics

- **Single endpoint**: All requests go to `https://api.github.com/graphql`
- **Rate limit aware**: Point-based system (5,000/hr for users, varies by auth)
- **Node limit conscious**: Max 500,000 nodes per query
- **Pagination required**: All connections require `first` or `last` (1-100)
- **Point calculation matters**: Complex queries consume more points
- **Webhook preferred**: Subscribe to events instead of polling
- **10-second timeout**: Queries must complete within 10 seconds

## Authentication

### Personal Access Token (Recommended for Scripts)

```bash
# Classic token - requires public_repo scope for public repos
# Fine-grained token - requires appropriate permissions (e.g., issues:read)

curl -H "Authorization: bearer YOUR_TOKEN" \
  -X POST \
  -d '{"query": "query { viewer { login }}"}' \
  https://api.github.com/graphql
```

### GitHub App Installation Token

```javascript
// For org/enterprise integrations - higher rate limits
const { Octokit } = require("@octokit/core");

const octokit = new Octokit({
  auth: process.env.GITHUB_APP_INSTALLATION_TOKEN
});

const result = await octokit.graphql(`
  query {
    viewer { login }
  }
`);
```

### Rate Limit Considerations by Auth Type

| Auth Type | Rate Limit | Use Case |
|-----------|------------|----------|
| User token | 5,000 pts/hr | Personal scripts |
| Enterprise user token | 10,000 pts/hr | Enterprise members |
| App installation | 5,000 pts/hr base | Automation (scales with repos/users) |
| Enterprise app installation | 10,000 pts/hr | Enterprise integrations |
| `GITHUB_TOKEN` in Actions | 1,000 pts/hr/repo | CI/CD workflows |

## Rate Limiting & Query Optimization

### Check Rate Limit Status

```graphql
query CheckRateLimit {
  viewer {
    login
  }
  rateLimit {
    limit          # Max points per hour
    remaining      # Points left in current window
    used           # Points used in current window
    resetAt        # When limit resets (ISO 8601)
    cost           # Points this query will cost
  }
}
```

**Response Headers** (preferred method):
- `x-ratelimit-limit`: Maximum points per hour
- `x-ratelimit-remaining`: Points remaining
- `x-ratelimit-used`: Points used
- `x-ratelimit-reset`: Reset time (UTC epoch seconds)
- `x-ratelimit-resource`: Always `graphql`

### Calculate Query Cost Before Running

**Formula**:
1. Count requests needed for each connection
2. Divide by 100 and round up

```graphql
# Example: Cost calculation
query ExpensiveQuery {
  viewer {
    repositories(first: 50) {        # 1 request
      edges {
        node {
          issues(first: 20) {         # 50 × 20 = 1,000 requests
            edges {
              node {
                comments(first: 10) { # 50 × 20 × 10 = 10,000 requests
                  edges {
                    node {
                      body
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

# Total: 1 + 1,000 + 10,000 = 11,001 requests
# Cost: 11,001 ÷ 100 = 111 points (rounded up)
```

### Optimization Strategies

#### 1. Reduce Query Depth
```graphql
# ❌ BAD: Deeply nested query
query DeepQuery {
  repository(owner: "octocat", name: "Hello-World") {
    issues(first: 100) {
      edges {
        node {
          comments(first: 50) {
            edges {
              node {
                reactions(first: 20) {
                  # Too deep!
                }
              }
            }
          }
        }
      }
    }
  }
}

# ✅ GOOD: Flatten with multiple queries
query GetIssues {
  repository(owner: "octocat", name: "Hello-World") {
    issues(first: 100) {
      edges {
        node {
          id
          number
          title
        }
      }
    }
  }
}

query GetCommentsForIssue($issueId: ID!) {
  node(id: $issueId) {
    ... on Issue {
      comments(first: 50) {
        edges {
          node {
            id
            body
          }
        }
      }
    }
  }
}
```

#### 2. Request Only Required Fields
```graphql
# ❌ BAD: Over-fetching
query AllFields {
  repository(owner: "octocat", name: "Hello-World") {
    description
    createdAt
    updatedAt
    pushedAt
    diskUsage
    forkCount
    stargazerCount
    watchers { totalCount }
    # ... and 50+ more fields
  }
}

# ✅ GOOD: Minimal fields
query MinimalFields {
  repository(owner: "octocat", name: "Hello-World") {
    name
    description
    stargazerCount
  }
}
```

#### 3. Use Smaller Page Sizes
```graphql
# ❌ BAD: Max page size increases cost
query MaxPageSize {
  repository(owner: "octocat", name: "Hello-World") {
    pullRequests(first: 100) {  # Max allowed but expensive
      edges { node { title } }
    }
  }
}

# ✅ GOOD: Smaller pages, paginate as needed
query ReasonablePageSize {
  repository(owner: "octocat", name: "Hello-World") {
    pullRequests(first: 25) {   # Start smaller
      edges { node { title } }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}
```

## Pagination Patterns

### Standard Forward Pagination

```graphql
query GetPullRequests($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(
      first: 50
      after: $cursor
      states: OPEN
      orderBy: {field: CREATED_AT, direction: DESC}
    ) {
      nodes {
        number
        title
        createdAt
        author {
          login
        }
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        endCursor      # Use this as next $cursor
        startCursor
      }
      totalCount
    }
  }
}

# Variables for first request:
# { "owner": "octocat", "name": "Hello-World", "cursor": null }

# Variables for subsequent requests:
# { "owner": "octocat", "name": "Hello-World", "cursor": "Y3Vyc29yOnYyOpHOUH8B7g==" }
```

### Backward Pagination

```graphql
query GetPullRequestsBackward($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(
      last: 50              # Use 'last' instead of 'first'
      before: $cursor       # Use 'before' instead of 'after'
      states: CLOSED
    ) {
      nodes {
        number
        title
        closedAt
      }
      pageInfo {
        hasPreviousPage
        startCursor         # Use this as next $cursor for 'before'
        hasNextPage
        endCursor
      }
    }
  }
}
```

### Pagination with Octokit Plugin

```javascript
const { Octokit } = require("@octokit/core");
const { paginateGraphql } = require("@octokit/plugin-paginate-graphql");

const MyOctokit = Octokit.plugin(paginateGraphql);
const octokit = new MyOctokit({ auth: process.env.GITHUB_TOKEN });

const { repository } = await octokit.graphql.paginate(`
  query ($owner: String!, $name: String!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      issues(first: 100, after: $cursor) {
        nodes {
          number
          title
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`, {
  owner: "octocat",
  name: "Hello-World"
});

console.log(`Total issues: ${repository.issues.length}`);
```

## Working Examples

### Query: Get Repository Issues with Labels

```graphql
query GetIssuesWithLabels($owner: String!, $name: String!, $states: [IssueState!]) {
  repository(owner: $owner, name: $name) {
    issues(
      first: 20
      states: $states
      orderBy: {field: CREATED_AT, direction: DESC}
    ) {
      nodes {
        number
        title
        url
        state
        createdAt
        author {
          login
          avatarUrl
        }
        labels(first: 5) {
          nodes {
            name
            color
          }
        }
        comments {
          totalCount
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}

# Variables:
# {
#   "owner": "octocat",
#   "name": "Hello-World",
#   "states": ["OPEN", "CLOSED"]
# }
```

### Query: Search Repositories with Filters

```graphql
query SearchRepos($query: String!, $first: Int!) {
  search(query: $query, type: REPOSITORY, first: $first) {
    repositoryCount
    edges {
      node {
        ... on Repository {
          name
          owner {
            login
          }
          description
          stargazerCount
          forkCount
          primaryLanguage {
            name
            color
          }
          pushedAt
          url
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}

# Variables:
# {
#   "query": "org:github language:typescript stars:>1000",
#   "first": 25
# }
```

### Mutation: Add Comment to Issue

```graphql
# Step 1: Get issue ID
query GetIssueId($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      id    # Returns global node ID like "I_kwDOABCDEFGH"
    }
  }
}

# Step 2: Add comment using the ID
mutation AddComment($subjectId: ID!, $body: String!) {
  addComment(input: {subjectId: $subjectId, body: $body}) {
    commentEdge {
      node {
        id
        body
        createdAt
        author {
          login
        }
      }
    }
  }
}

# Variables for mutation:
# {
#   "subjectId": "I_kwDOABCDEFGH",
#   "body": "Thanks for reporting this issue!"
# }
```

### Mutation: Add Reaction to Issue

```graphql
mutation AddReactionToIssue($subjectId: ID!, $content: ReactionContent!) {
  addReaction(input: {subjectId: $subjectId, content: $content}) {
    reaction {
      content
      createdAt
    }
    subject {
      id
    }
  }
}

# Variables:
# {
#   "subjectId": "I_kwDOABCDEFGH",
#   "content": "THUMBS_UP"  # Options: THUMBS_UP, THUMBS_DOWN, LAUGH, HOORAY, CONFUSED, HEART, ROCKET, EYES
# }
```

### Query: Pull Request with Reviews and Files

```graphql
query GetPRDetails($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      title
      body
      state
      author {
        login
      }
      reviews(first: 10) {
        nodes {
          author {
            login
          }
          state
          body
          createdAt
        }
      }
      files(first: 20) {
        nodes {
          path
          additions
          deletions
        }
      }
      commits(last: 1) {
        nodes {
          commit {
            oid
            message
          }
        }
      }
    }
  }
}

# Variables:
# {
#   "owner": "octocat",
#   "name": "Hello-World",
#   "number": 42
# }
```

### Query: Organization Repositories with Team Access

```graphql
query GetOrgRepos($org: String!, $cursor: String) {
  organization(login: $org) {
    repositories(
      first: 50
      after: $cursor
      orderBy: {field: PUSHED_AT, direction: DESC}
    ) {
      nodes {
        name
        description
        isPrivate
        pushedAt
        primaryLanguage {
          name
        }
        repositoryTopics(first: 5) {
          nodes {
            topic {
              name
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}

# Variables:
# {
#   "org": "github",
#   "cursor": null
# }
```

### Query: User Contributions Timeline

```graphql
query GetUserActivity($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
            color
          }
        }
      }
    }
  }
}

# Variables:
# {
#   "login": "octocat",
#   "from": "2024-01-01T00:00:00Z",
#   "to": "2024-12-31T23:59:59Z"
# }
```

## Using Global Node IDs

GitHub uses global node IDs that work across the entire platform.

```graphql
# Query any node by its global ID
query GetNode($id: ID!) {
  node(id: $id) {
    ... on Issue {
      number
      title
      repository {
        nameWithOwner
      }
    }
    ... on PullRequest {
      number
      title
      repository {
        nameWithOwner
      }
    }
    ... on Repository {
      nameWithOwner
      description
    }
  }
}

# Variables:
# {
#   "id": "I_kwDOABCDEFGH"  # Global node ID
# }
```

## Error Handling

### Common Error Patterns

```javascript
const { graphql } = require("@octokit/graphql");

async function queryGitHub(query, variables) {
  try {
    const result = await graphql(query, {
      ...variables,
      headers: {
        authorization: `token ${process.env.GITHUB_TOKEN}`
      }
    });
    return result;
  } catch (error) {
    // Rate limit exceeded
    if (error.message.includes("rate limit")) {
      const resetTime = error.headers?.["x-ratelimit-reset"];
      const resetDate = new Date(resetTime * 1000);
      console.error(`Rate limit exceeded. Resets at ${resetDate}`);
      // Wait until reset or implement exponential backoff
    }

    // Secondary rate limit (too many requests)
    if (error.status === 403 && error.headers?.["retry-after"]) {
      const retryAfter = error.headers["retry-after"];
      console.error(`Secondary rate limit. Retry after ${retryAfter} seconds`);
    }

    // Validation errors (bad query structure)
    if (error.errors) {
      error.errors.forEach(err => {
        console.error(`GraphQL Error: ${err.message}`);
        if (err.locations) {
          console.error(`Location: Line ${err.locations[0].line}, Column ${err.locations[0].column}`);
        }
      });
    }

    throw error;
  }
}
```

### Timeout Handling

```javascript
// GitHub terminates queries after 10 seconds
// Break complex queries into smaller chunks

async function getIssuesInBatches(owner, name) {
  const batchSize = 50;
  let allIssues = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    const result = await graphql(`
      query($owner: String!, $name: String!, $first: Int!, $after: String) {
        repository(owner: $owner, name: $name) {
          issues(first: $first, after: $after) {
            nodes {
              number
              title
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `, {
      owner,
      name,
      first: batchSize,
      after: cursor,
      headers: {
        authorization: `token ${process.env.GITHUB_TOKEN}`
      }
    });

    allIssues = allIssues.concat(result.repository.issues.nodes);
    hasNextPage = result.repository.issues.pageInfo.hasNextPage;
    cursor = result.repository.issues.pageInfo.endCursor;

    // Respect rate limits - wait 1 second between requests
    if (hasNextPage) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return allIssues;
}
```

## Best Practices Summary

### Query Design
- ✅ Start with minimal fields, add only what you need
- ✅ Use fragments to reuse field selections
- ✅ Paginate all connections with `first`/`last` (1-100)
- ✅ Include `pageInfo` for pagination state
- ✅ Calculate expected cost before running complex queries
- ❌ Don't request all fields when you need a few
- ❌ Don't use deeply nested queries
- ❌ Don't fetch max (100) items unless necessary

### Rate Limiting
- ✅ Check `x-ratelimit-*` headers after each request
- ✅ Implement exponential backoff for rate limit errors
- ✅ Use webhooks instead of polling
- ✅ Wait ≥1 second between mutative requests
- ✅ Avoid concurrent requests (max 100 allowed)
- ❌ Don't ignore `retry-after` header
- ❌ Don't make requests when `x-ratelimit-remaining` is 0

### Authentication
- ✅ Use fine-grained tokens with minimal permissions
- ✅ Use GitHub Apps for organization integrations (higher limits)
- ✅ Rotate tokens regularly
- ✅ Store tokens in environment variables, never in code
- ❌ Don't use personal tokens for production apps
- ❌ Don't share tokens across multiple applications

### Performance
- ✅ Request only required fields
- ✅ Use smaller page sizes (25-50) and paginate
- ✅ Split complex queries into multiple simple queries
- ✅ Cache results when appropriate
- ✅ Monitor query costs with `rateLimit { cost }`
- ❌ Don't fetch all data upfront
- ❌ Don't nest connections more than 2-3 levels deep

## References

- [GitHub GraphQL API Documentation](https://docs.github.com/en/graphql)
- [GraphQL Explorer](https://docs.github.com/en/graphql/overview/explorer) - Interactive testing
- [GitHub GraphQL Schema](https://docs.github.com/en/graphql/overview/public-schema)
- [Octokit GraphQL Plugin](https://github.com/octokit/plugin-paginate-graphql.js)
