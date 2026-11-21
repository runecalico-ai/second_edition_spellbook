# Advanced GitHub GraphQL Patterns

Comprehensive examples and advanced patterns for GitHub GraphQL API.

## Complex Search Queries

### Search Issues Across Organization

```graphql
query SearchOrgIssues($query: String!, $first: Int!, $cursor: String) {
  search(query: $query, type: ISSUE, first: $first, after: $cursor) {
    issueCount
    edges {
      node {
        ... on Issue {
          number
          title
          url
          state
          createdAt
          repository {
            nameWithOwner
          }
          author {
            login
          }
          labels(first: 5) {
            nodes {
              name
              color
            }
          }
          assignees(first: 5) {
            nodes {
              login
            }
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

# Variables:
# {
#   "query": "org:github is:open label:bug created:>2024-01-01",
#   "first": 50,
#   "cursor": null
# }
```

### Search Code with Context

```graphql
query SearchCode($query: String!, $first: Int!) {
  search(query: $query, type: CODE, first: $first) {
    codeCount
    edges {
      node {
        ... on CodeSearchResult {
          path
          repository {
            nameWithOwner
            url
          }
          textMatches {
            fragment
            highlights {
              text
              beginOffset
              endOffset
            }
          }
        }
      }
    }
  }
}

# Variables:
# {
#   "query": "org:github language:typescript async function",
#   "first": 25
# }
```

## Mutation Patterns

### Create Pull Request

```graphql
# Step 1: Get repository ID
query GetRepoId($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    id
  }
}

# Step 2: Create pull request
mutation CreatePR($repositoryId: ID!, $baseRefName: String!, $headRefName: String!, $title: String!, $body: String) {
  createPullRequest(input: {
    repositoryId: $repositoryId
    baseRefName: $baseRefName
    headRefName: $headRefName
    title: $title
    body: $body
    draft: false
  }) {
    pullRequest {
      number
      url
      title
      author {
        login
      }
    }
  }
}

# Variables for mutation:
# {
#   "repositoryId": "R_kgDOABCDEF",
#   "baseRefName": "main",
#   "headRefName": "feature/new-feature",
#   "title": "Add new feature",
#   "body": "This PR implements the new feature"
# }
```

### Update Issue with Labels and Assignees

```graphql
mutation UpdateIssue($issueId: ID!, $labelIds: [ID!], $assigneeIds: [ID!]) {
  # Remove existing labels
  removeLabelsFromLabelable(input: {
    labelableId: $issueId
    labelIds: $labelIds
  }) {
    clientMutationId
  }

  # Add new labels
  addLabelsToLabelable(input: {
    labelableId: $issueId
    labelIds: $labelIds
  }) {
    labelable {
      ... on Issue {
        labels(first: 10) {
          nodes {
            name
          }
        }
      }
    }
  }

  # Add assignees
  addAssigneesToAssignable(input: {
    assignableId: $issueId
    assigneeIds: $assigneeIds
  }) {
    assignable {
      ... on Issue {
        assignees(first: 10) {
          nodes {
            login
          }
        }
      }
    }
  }
}
```

### Create Issue with Project Board

```graphql
mutation CreateIssueWithProject($repositoryId: ID!, $title: String!, $body: String!, $projectId: ID!) {
  createIssue(input: {
    repositoryId: $repositoryId
    title: $title
    body: $body
  }) {
    issue {
      id
      number
      url
    }
  }

  # Add to project (requires issue ID from above)
  addProjectV2ItemById(input: {
    projectId: $projectId
    contentId: $issueId  # ID from createIssue response
  }) {
    item {
      id
    }
  }
}
```

## Fragments for Reusability

### Define Common Fragments

```graphql
fragment UserFields on User {
  login
  name
  avatarUrl
  url
}

fragment RepositoryFields on Repository {
  name
  nameWithOwner
  description
  url
  isPrivate
  stargazerCount
  forkCount
  primaryLanguage {
    name
    color
  }
}

fragment IssueFields on Issue {
  number
  title
  url
  state
  createdAt
  updatedAt
  author {
    ...UserFields
  }
  labels(first: 5) {
    nodes {
      name
      color
    }
  }
}

query GetRepoWithIssues($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    ...RepositoryFields
    issues(first: 20, states: OPEN) {
      nodes {
        ...IssueFields
      }
    }
  }
}
```

## Inline Fragments for Union Types

```graphql
query GetTimelineItems($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      timelineItems(first: 50) {
        nodes {
          ... on IssueComment {
            __typename
            body
            author {
              login
            }
            createdAt
          }
          ... on CrossReferencedEvent {
            __typename
            source {
              ... on Issue {
                number
                title
              }
              ... on PullRequest {
                number
                title
              }
            }
          }
          ... on LabeledEvent {
            __typename
            label {
              name
            }
            createdAt
          }
          ... on ClosedEvent {
            __typename
            actor {
              login
            }
            createdAt
          }
        }
      }
    }
  }
}
```

## Working with GitHub Projects (Beta)

### Query Project V2

```graphql
query GetProjectV2($org: String!, $number: Int!) {
  organization(login: $org) {
    projectV2(number: $number) {
      title
      shortDescription
      fields(first: 20) {
        nodes {
          ... on ProjectV2Field {
            name
            dataType
          }
          ... on ProjectV2SingleSelectField {
            name
            options {
              name
              id
            }
          }
          ... on ProjectV2IterationField {
            name
            configuration {
              iterations {
                title
                startDate
                duration
              }
            }
          }
        }
      }
      items(first: 50) {
        nodes {
          content {
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
          }
          fieldValues(first: 10) {
            nodes {
              ... on ProjectV2ItemFieldTextValue {
                text
                field {
                  ... on ProjectV2Field {
                    name
                  }
                }
              }
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field {
                  ... on ProjectV2SingleSelectField {
                    name
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

# Variables:
# {
#   "org": "github",
#   "number": 1
# }
```

## GitHub Discussions

### Query Discussions with Comments

```graphql
query GetDiscussions($owner: String!, $name: String!, $first: Int!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    discussions(first: $first, after: $cursor, orderBy: {field: CREATED_AT, direction: DESC}) {
      nodes {
        number
        title
        body
        createdAt
        author {
          login
        }
        category {
          name
          emoji
        }
        upvoteCount
        comments(first: 10) {
          nodes {
            body
            author {
              login
            }
            createdAt
          }
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
#   "first": 25,
#   "cursor": null
# }
```

### Create Discussion

```graphql
mutation CreateDiscussion($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
  createDiscussion(input: {
    repositoryId: $repositoryId
    categoryId: $categoryId
    title: $title
    body: $body
  }) {
    discussion {
      id
      number
      url
      title
    }
  }
}
```

## Release Management

### Query Releases

```graphql
query GetReleases($owner: String!, $name: String!, $first: Int!) {
  repository(owner: $owner, name: $name) {
    releases(first: $first, orderBy: {field: CREATED_AT, direction: DESC}) {
      nodes {
        name
        tagName
        description
        createdAt
        publishedAt
        isPrerelease
        isDraft
        author {
          login
        }
        releaseAssets(first: 10) {
          nodes {
            name
            downloadUrl
            size
            downloadCount
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
#   "first": 10
# }
```

## Commit and Branch Information

### Get Recent Commits

```graphql
query GetCommits($owner: String!, $name: String!, $ref: String!, $first: Int!) {
  repository(owner: $owner, name: $name) {
    ref(qualifiedName: $ref) {
      target {
        ... on Commit {
          history(first: $first) {
            nodes {
              oid
              message
              committedDate
              author {
                name
                email
                user {
                  login
                }
              }
              additions
              deletions
              changedFiles
            }
            pageInfo {
              hasNextPage
              endCursor
            }
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
#   "ref": "refs/heads/main",
#   "first": 50
# }
```

### Compare Branches

```graphql
query CompareBranches($owner: String!, $name: String!, $baseRef: String!, $headRef: String!) {
  repository(owner: $owner, name: $name) {
    base: ref(qualifiedName: $baseRef) {
      compare(headRef: $headRef) {
        aheadBy
        behindBy
        commits(first: 100) {
          nodes {
            oid
            message
            author {
              user {
                login
              }
            }
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
#   "baseRef": "main",
#   "headRef": "feature-branch"
# }
```

## Workflow and Actions

### Query Workflow Runs

```graphql
query GetWorkflowRuns($owner: String!, $name: String!, $workflowId: ID!) {
  repository(owner: $owner, name: $name) {
    # Note: Workflows API is limited in GraphQL
    # Consider using REST API for detailed workflow information
    object(expression: "HEAD:.github/workflows/") {
      ... on Tree {
        entries {
          name
          type
        }
      }
    }
  }
}

# For detailed workflow runs, use REST API:
# GET /repos/{owner}/{repo}/actions/runs
```

## Sponsorship Information

### Query User Sponsorships

```graphql
query GetSponsors($login: String!, $first: Int!) {
  user(login: $login) {
    sponsorshipsAsMaintainer(first: $first) {
      totalCount
      nodes {
        sponsor {
          ... on User {
            login
            name
            avatarUrl
          }
          ... on Organization {
            login
            name
            avatarUrl
          }
        }
        tier {
          name
          monthlyPriceInDollars
        }
        createdAt
      }
    }
  }
}

# Variables:
# {
#   "login": "octocat",
#   "first": 50
# }
```

## Security and Vulnerability Alerts

### Query Dependabot Alerts

```graphql
query GetVulnerabilityAlerts($owner: String!, $name: String!, $first: Int!) {
  repository(owner: $owner, name: $name) {
    vulnerabilityAlerts(first: $first, states: OPEN) {
      nodes {
        securityVulnerability {
          package {
            name
            ecosystem
          }
          severity
          advisory {
            description
            summary
            publishedAt
          }
          vulnerableVersionRange
          firstPatchedVersion {
            identifier
          }
        }
        createdAt
        dismissedAt
        dismissReason
      }
    }
  }
}

# Note: Requires appropriate permissions
# Variables:
# {
#   "owner": "octocat",
#   "name": "Hello-World",
#   "first": 50
# }
```

## Batch Operations with Aliases

```graphql
query BatchRepoInfo {
  repo1: repository(owner: "github", name: "docs") {
    name
    stargazerCount
  }
  repo2: repository(owner: "github", name: "gitignore") {
    name
    stargazerCount
  }
  repo3: repository(owner: "microsoft", name: "vscode") {
    name
    stargazerCount
  }
  # Can query up to multiple repos in single request
  # Each counts toward node limit
}
```

## Conditional Queries with Directives

```graphql
query GetRepoData($owner: String!, $name: String!, $includeIssues: Boolean!, $includePRs: Boolean!) {
  repository(owner: $owner, name: $name) {
    name
    description

    issues(first: 10) @include(if: $includeIssues) {
      nodes {
        title
        number
      }
    }

    pullRequests(first: 10) @include(if: $includePRs) {
      nodes {
        title
        number
      }
    }
  }
}

# Variables:
# {
#   "owner": "octocat",
#   "name": "Hello-World",
#   "includeIssues": true,
#   "includePRs": false
# }
```

## Performance Monitoring

### Track Query Performance

```javascript
const { graphql } = require("@octokit/graphql");

async function monitoredQuery(query, variables) {
  const startTime = Date.now();

  const result = await graphql(query, {
    ...variables,
    headers: {
      authorization: `token ${process.env.GITHUB_TOKEN}`
    }
  });

  const endTime = Date.now();
  const duration = endTime - startTime;

  console.log(`Query completed in ${duration}ms`);

  // Check rate limit from response
  if (result.rateLimit) {
    console.log(`Rate limit: ${result.rateLimit.remaining}/${result.rateLimit.limit}`);
    console.log(`Query cost: ${result.rateLimit.cost} points`);
    console.log(`Resets at: ${result.rateLimit.resetAt}`);
  }

  return result;
}
```

## Retry Logic with Exponential Backoff

```javascript
async function queryWithRetry(query, variables, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await graphql(query, {
        ...variables,
        headers: {
          authorization: `token ${process.env.GITHUB_TOKEN}`
        }
      });
    } catch (error) {
      // Rate limit exceeded
      if (error.status === 403 || error.message.includes("rate limit")) {
        const retryAfter = error.headers?.["retry-after"];
        const waitTime = retryAfter
          ? parseInt(retryAfter) * 1000
          : Math.pow(2, attempt) * 1000; // Exponential backoff

        console.log(`Rate limited. Waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      // Other errors - don't retry
      throw error;
    }
  }

  throw new Error(`Failed after ${maxRetries} retries`);
}
```
