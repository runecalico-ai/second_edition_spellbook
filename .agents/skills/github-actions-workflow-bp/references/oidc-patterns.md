# OIDC Authentication Patterns

OpenID Connect (OIDC) allows workflows to authenticate with cloud providers without storing long-lived credentials. This is the recommended approach for cloud deployments.

## Benefits of OIDC

- No long-lived credentials to rotate or leak
- Automatic credential expiration (typically 1 hour)
- Fine-grained IAM role assumptions
- Cloud provider validates the request origin

## Azure Configuration

### 1. Configure Azure AD

**Create Azure AD Application and Service Principal:**

```bash
# Create app registration
az ad app create --display-name GitHubActionsOIDC

# Create service principal
az ad sp create --id <APP_ID>

# Create federated credential
az ad app federated-credential create \
  --id <APP_ID> \
  --parameters '{
    "name": "GitHubActions",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:myorg/myrepo:ref:refs/heads/main",
    "audiences": ["api://AzureADTokenExchange"]
  }'

# Assign role to service principal
az role assignment create \
  --assignee <SERVICE_PRINCIPAL_ID> \
  --role Contributor \
  --scope /subscriptions/<SUBSCRIPTION_ID>/resourceGroups/<RESOURCE_GROUP>
```

### 2. Configure Workflow

```yaml
name: Deploy to Azure

on:
  push:
    branches: [main]

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    runs-on: ${{ vars.DEFAULT_DEV_UBUNTU_RUNNER }}
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.1

      - name: Azure Login
        uses: azure/login@a457da9ea143d694b1b9c7c869ebb04ebe844ef5  # v2.3.0
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ vars.AZURE_TENANT_ID }}
          # subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }} # Uncomment if using Azure Managed SPN
          # allow-no-subscriptions: true # Uncomment if using Stratosphere Managed SPN

      - name: Deploy to Azure Web App
        uses: azure/webapps-deploy@v2
        with:
          app-name: my-web-app
          package: ./dist
```

## Security Considerations

### Limit OIDC Scope

Always restrict the trust policy to specific:
- **Repositories**: `repo:myorg/myrepo:*`
- **Branches**: `repo:myorg/myrepo:ref:refs/heads/main`
- **Environments**: `repo:myorg/myrepo:environment:production`
- **Tags**: `repo:myorg/myrepo:ref:refs/tags/v*`

### Use Environment Protection

For production deployments, configure environment protection rules:

1. Go to repository Settings → Environments
2. Create "production" environment
3. Add required reviewers
4. Restrict to specific branches
5. Add environment secrets

```yaml
jobs:
  deploy:
    runs-on: ${{ vars.DEFAULT_DEV_UBUNTU_RUNNER }}
    environment: production  # Requires approval before running
    steps: [...]
```

### Monitor and Audit

- Activity Log (Azure)
- Review role assumptions regularly
- Set up alerts for suspicious activity
- Rotate OIDC configurations periodically

## Troubleshooting

**Error: "Not authorized to perform sts:AssumeRoleWithWebIdentity"**
- Verify trust policy includes correct repository name
- Check that `permissions: id-token: write` is set
- Ensure OIDC provider is created correctly

**Error: "Token audience validation failed"**
- For Azure, ensure audience is `api://AzureADTokenExchange`

**Token expires during long jobs**
- OIDC tokens typically valid for 1 hour
- Break long jobs into separate jobs
- Re-authenticate if necessary within job
