# Self-Hosted Runners

Self-hosted runners provide more control over the execution environment but introduce unique security and operational considerations.

## Security Considerations

### ⚠️ Critical Security Rules

**NEVER use self-hosted runners for public repositories**

Self-hosted runners on public repos are extremely dangerous:
- Anyone can open a PR and execute arbitrary code on your infrastructure
- Attackers can exfiltrate secrets, access internal networks, or mine cryptocurrency
- Even with approval workflows, sophisticated attacks can bypass protections

**Use self-hosted runners ONLY for:**
- Private repositories
- Trusted contributors only
- Internal enterprise workflows

**For public repos, always use GitHub-hosted runners.**

### Isolation and Sandboxing

**Run in ephemeral, isolated environments:**

```yaml
# Use Docker containers for isolation
jobs:
  build:
    runs-on: self-hosted
    container:
      image: node:20
      options: --cpus 2 --memory 4g
    steps:
      - uses: actions/github-script@ed597411d8f924073f98dfc5c65a23a2325f34cd  # v8.0.0
      - run: npm ci
      - run: npm test
```

**Best practices:**
- Use disposable VMs/containers that are destroyed after each job
- Never run multiple jobs on the same runner simultaneously
- Implement network segmentation to limit runner access
- Use separate runners for different security contexts

### Runner Permissions

**Principle of least privilege:**

```bash
# Create dedicated user for runner (Linux)
sudo useradd -m -s /bin/bash github-runner
sudo usermod -aG docker github-runner  # Only if Docker needed

# Set up runner as this user
sudo -u github-runner ./config.sh --url https://github.com/myorg/myrepo --token TOKEN

# Start runner as service with limited permissions
sudo ./svc.sh install github-runner
sudo ./svc.sh start
```

**Avoid:**
- Running runner as root
- Giving runner sudo access without password
- Allowing network access to internal services unless necessary

### Secret Management

**Limit secret exposure:**

```yaml
jobs:
  deploy:
    runs-on: self-hosted
    environment: production  # Requires approval
    steps:
      - uses: actions/github-script@ed597411d8f924073f98dfc5c65a23a2325f34cd  # v8.0.0

      - name: Deploy
        env:
          DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}
        run: |
          # Secret only available in this step
          ./deploy.sh
```

**For sensitive deployments:**
- Use environment protection rules
- Require manual approval
- Limit which branches can access secrets
- Rotate secrets regularly

### Network Security

**Implement network controls:**

1. **Egress filtering**: Restrict outbound connections to approved destinations
2. **No inbound access**: Runners should only poll GitHub, not accept connections
3. **Internal network isolation**: Segment runner network from production systems
4. **VPN/private networking**: Use for accessing internal resources

**Example AWS security group:**

```hcl
# Terraform example
resource "aws_security_group" "runner" {
  name = "github-runner"

  # Allow outbound to GitHub only
  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["140.82.112.0/20"]  # GitHub IP range
  }

  # No inbound rules
}
```

## Infrastructure Patterns

### Auto-Scaling Runners

**Using Kubernetes with actions-runner-controller:**

```yaml
# runner-deployment.yaml
apiVersion: actions.summerwind.dev/v1alpha1
kind: RunnerDeployment
metadata:
  name: github-runner
spec:
  replicas: 3
  template:
    spec:
      repository: myorg/myrepo
      labels:
        - self-hosted
        - linux
        - x64
      dockerdWithinRunnerContainer: true
      ephemeral: true  # Destroy after one job
```

**Auto-scaling based on load:**

```yaml
apiVersion: actions.summerwind.dev/v1alpha1
kind: HorizontalRunnerAutoscaler
metadata:
  name: github-runner-autoscaler
spec:
  scaleTargetRef:
    name: github-runner
  minReplicas: 1
  maxReplicas: 10
  metrics:
    - type: TotalNumberOfQueuedAndInProgressWorkflowRuns
      repositoryNames:
        - myorg/myrepo
```

### AWS Auto Scaling

**Using philips-labs/terraform-aws-github-runner:**

```hcl
module "runners" {
  source  = "philips-labs/github-runner/aws"
  version = "5.0.0"

  aws_region = "us-east-1"
  vpc_id     = "vpc-123456"
  subnet_ids = ["subnet-123456"]

  github_app = {
    id         = "123456"
    key_base64 = var.github_app_key
  }

  # Auto scaling
  runners = {
    linux = {
      enable           = true
      min_size         = 1
      max_size         = 10
      instance_type    = "m5.large"

      # Ephemeral runners (destroyed after job)
      ephemeral = true

      # Custom AMI with dependencies
      ami_filter = {
        name  = ["github-runner-ubuntu-*"]
        state = ["available"]
      }
    }
  }

  # Scale down when idle
  idle_config = {
    enable         = true
    idle_timeout   = 60  # seconds
  }
}
```

### Azure VM Scale Sets

**Auto-scaling runners on Azure:**

```bash
# Install Azure VM extension
az vmss extension set \
  --vmss-name github-runners \
  --resource-group runners-rg \
  --name CustomScript \
  --publisher Microsoft.Azure.Extensions \
  --version 2.1 \
  --protected-settings ./runner-setup.json

# Auto-scale rules
az monitor autoscale create \
  --resource-group runners-rg \
  --resource github-runners \
  --resource-type Microsoft.Compute/virtualMachineScaleSets \
  --min-count 1 \
  --max-count 10 \
  --count 2

az monitor autoscale rule create \
  --resource-group runners-rg \
  --autoscale-name github-runners-autoscale \
  --scale out 1 \
  --condition "Percentage CPU > 70 avg 5m"
```

## Configuration Best Practices

### Runner Labels

**Use descriptive labels for targeting:**

```yaml
# Configure runner with labels
./config.sh \
  --url https://github.com/myorg/myrepo \
  --token TOKEN \
  --labels self-hosted,linux,gpu,cuda-12
```

**Target in workflow:**

```yaml
jobs:
  ml-training:
    runs-on: [self-hosted, linux, gpu, cuda-12]
    steps:
      - uses: actions/github-script@ed597411d8f924073f98dfc5c65a23a2325f34cd  # v8.0.0
      - run: python train_model.py
```

**Common label patterns:**
- OS: `linux`, `windows`, `macos`
- Architecture: `x64`, `arm64`
- Capabilities: `gpu`, `docker`, `kubernetes`
- Environment: `dev`, `staging`, `prod`
- Location: `us-east`, `eu-west`

### Runner Groups

**Organize runners by access level:**

1. Go to Organization Settings → Actions → Runner groups
2. Create groups: `production-runners`, `dev-runners`, `security-sensitive`
3. Assign runners to groups
4. Control repository access per group

**Workflow targeting:**

```yaml
jobs:
  deploy-prod:
    runs-on:
      group: production-runners
      labels: [self-hosted, linux]
    steps: [...]
```

### Resource Limits

**Set resource constraints:**

```yaml
jobs:
  build:
    runs-on: self-hosted
    container:
      image: ubuntu:22.04
      options: >-
        --cpus 4
        --memory 8g
        --memory-swap 8g
        --storage-opt size=20g
    steps: [...]
```

**Monitor resource usage:**

```yaml
- name: Check resources
  run: |
    echo "CPU cores: $(nproc)"
    echo "Memory: $(free -h)"
    echo "Disk: $(df -h /)"
```

## Maintenance

### Health Checks

**Monitor runner health:**

```bash
#!/bin/bash
# runner-health-check.sh

# Check if runner is online
if ! pgrep -f "Runner.Listener" > /dev/null; then
    echo "Runner not running, restarting..."
    sudo ./svc.sh start
fi

# Check disk space
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 80 ]; then
    echo "Disk usage high: ${DISK_USAGE}%"
    # Clean up old Docker images
    docker system prune -af --volumes
fi

# Check memory
MEMORY_USAGE=$(free | grep Mem | awk '{print ($3/$2) * 100}' | cut -d. -f1)
if [ $MEMORY_USAGE -gt 90 ]; then
    echo "Memory usage high: ${MEMORY_USAGE}%"
    # Restart runner if memory leak suspected
    sudo ./svc.sh restart
fi
```

**Schedule with cron:**

```bash
# Add to crontab
*/5 * * * * /home/github-runner/health-check.sh >> /var/log/runner-health.log 2>&1
```

### Log Management

**Configure log rotation:**

```bash
# /etc/logrotate.d/github-runner
/home/github-runner/_diag/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
}
```

### Updates

**Keep runners updated:**

```bash
#!/bin/bash
# update-runner.sh

cd /home/github-runner

# Stop runner
sudo ./svc.sh stop

# Download latest version
LATEST_VERSION=$(curl -s https://api.github.com/repos/actions/runner/releases/latest | jq -r '.tag_name' | sed 's/v//')
wget https://github.com/actions/runner/releases/download/v${LATEST_VERSION}/actions-runner-linux-x64-${LATEST_VERSION}.tar.gz

# Extract
tar xzf actions-runner-linux-x64-${LATEST_VERSION}.tar.gz

# Restart
sudo ./svc.sh start
```

## Troubleshooting

### Runner Not Picking Up Jobs

**Check:**
1. Runner is online in GitHub Settings → Actions → Runners
2. Labels match workflow `runs-on` requirements
3. Runner has capacity (not already running max jobs)
4. Repository/organization has access to runner group

**Debug:**

```bash
# Check runner status
sudo ./svc.sh status

# View runner logs
tail -f _diag/Runner_*.log
```

### Permission Errors

**Common issues:**

```bash
# Fix Docker permissions
sudo usermod -aG docker github-runner
newgrp docker

# Fix Git permissions
sudo chown -R github-runner:github-runner /home/github-runner/_work
```

### Network Connectivity

**Test GitHub connectivity:**

```bash
# Test HTTPS to GitHub
curl -v https://api.github.com

# Check GitHub IPs
nslookup github.com

# Test webhook endpoint
curl -v https://pipelines.actions.githubusercontent.com
```

## Cost Optimization

### Spot/Preemptible Instances

**Use for non-critical workloads:**

```hcl
# AWS Spot instances
resource "aws_spot_instance_request" "runner" {
  ami           = "ami-123456"
  instance_type = "m5.large"
  spot_price    = "0.05"

  user_data = file("runner-setup.sh")
}
```

**Handle interruptions gracefully:**

```yaml
- name: Save progress
  if: failure()
  run: |
    # Save intermediate results to S3
    aws s3 cp ./artifacts s3://backup-bucket/ --recursive
```

### Efficient Scaling

**Scale to zero when idle:**

```yaml
# Kubernetes HPA with scale-to-zero
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: runner-autoscaler
spec:
  minReplicas: 0  # Scale to zero when no jobs
  maxReplicas: 10
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300  # Wait 5min before scaling down
```

### Resource Right-Sizing

**Match runner size to workload:**

- **Small (2 CPU, 4GB RAM)**: Linting, unit tests
- **Medium (4 CPU, 8GB RAM)**: Integration tests, builds
- **Large (8 CPU, 16GB RAM)**: E2E tests, Docker builds
- **XL (16+ CPU, 32GB+ RAM)**: ML training, large compilations

## Compliance and Auditing

### Audit Logging

**Enable comprehensive logging:**

```yaml
- name: Audit log
  run: |
    echo "Workflow: ${{ github.workflow }}"
    echo "Actor: ${{ github.actor }}"
    echo "Repository: ${{ github.repository }}"
    echo "Ref: ${{ github.ref }}"
    echo "SHA: ${{ github.sha }}"
    echo "Runner: $(hostname)"
```

**Ship logs to SIEM:**

```bash
# Forward to Splunk/ELK/etc
filebeat -c /etc/filebeat/filebeat.yml
```

### Compliance Requirements

**For regulated industries:**

1. **Access control**: MFA, role-based access
2. **Encryption**: At-rest and in-transit
3. **Audit trails**: Complete logging of all actions
4. **Data residency**: Runners in specific regions
5. **Vulnerability scanning**: Regular security scans
6. **Patch management**: Timely updates

## Summary

Self-hosted runners provide flexibility but require careful security planning:

- **Security first**: Ephemeral runners, isolation, least privilege
- **Never for public repos**: Too risky
- **Auto-scaling**: Match capacity to demand
- **Monitoring**: Health checks, logs, metrics
- **Maintenance**: Regular updates and cleanup
- **Cost optimization**: Right-size and scale to zero

For most use cases, GitHub-hosted runners are simpler and more secure. Use self-hosted only when you have specific requirements that justify the operational overhead.
