# ACS Backend - Multi-Environment CDK Setup

This project uses AWS CDK to deploy a multi-environment backend infrastructure with separate development and production environments.

## Environment Configuration

The project supports two environments:
- **Development (dev)**: For testing and development work
- **Production (prod)**: For live production workloads

### Environment Differences

| Resource | Development | Production |
|----------|-------------|------------|
| Stack Name | `Acsd2PStack-Dev` | `Acsd2PStack-Prod` |
| API Gateway Stage | `dev` | `prod` |
| Lambda Functions | Same names | Same names |
| DynamoDB Tables | Same names | Same names |

**Note**: All AWS resources (Lambda functions, DynamoDB tables, API Gateway) keep the same names across environments. Only the CloudFormation stack name and API Gateway stage differ to distinguish between environments.

## Prerequisites

1. AWS CLI configured with appropriate credentials
2. Node.js and npm installed
3. AWS CDK CLI installed globally: `npm install -g aws-cdk`

## Installation

```bash
npm install
```

## Deployment Commands

### Development Environment

```bash
# Deploy to development
npm run deploy:dev

# View differences before deployment
npm run diff:dev

# Synthesize CloudFormation template
npm run synth:dev

# Destroy development environment
npm run destroy:dev
```

### Production Environment

```bash
# Deploy to production
npm run deploy:prod

# View differences before deployment
npm run diff:prod

# Synthesize CloudFormation template
npm run synth:prod

# Destroy production environment
npm run destroy:prod
```

### Manual CDK Commands

You can also use CDK commands directly:

```bash
# Deploy to specific environment
cdk deploy --context env=dev
cdk deploy --context env=prod

# View differences
cdk diff --context env=dev
cdk diff --context env=prod

# Synthesize templates
cdk synth --context env=dev
cdk synth --context env=prod
```

## Infrastructure Components

### Lambda Functions
- All Lambda functions maintain the same names across environments
- Each function has the `STAGE` environment variable set to identify the environment
- Functions are deployed with the same configuration in both environments

### DynamoDB Tables
- All tables maintain the same names across environments
- Tables use PAY_PER_REQUEST billing mode
- RETAIN removal policy to prevent accidental data loss

### API Gateway
- Single API Gateway instance with environment-specific stages
- Development stage: `dev`
- Production stage: `prod`
- CORS enabled for all origins

## Security Considerations

- All Lambda functions have AdministratorAccess policy (consider restricting this for production)
- DynamoDB tables use PAY_PER_REQUEST billing mode
- Tables have RETAIN removal policy to prevent accidental data loss
- CORS is enabled for all origins (consider restricting for production)

## Best Practices

1. **Always review changes**: Use `npm run diff:dev` or `npm run diff:prod` before deploying
2. **Test in dev first**: Always test changes in development before deploying to production
3. **Backup data**: Ensure you have backups before making destructive changes
4. **Monitor costs**: Keep an eye on AWS costs, especially in production
5. **Security review**: Regularly review IAM permissions and security configurations
6. **Environment isolation**: Be aware that both environments share the same resource names, so they cannot coexist in the same AWS account/region

## Important Notes

⚠️ **Environment Isolation**: Since all resources have the same names, you cannot deploy both dev and prod environments to the same AWS account and region simultaneously. You have two options:

1. **Use different AWS accounts** for dev and prod
2. **Use different AWS regions** for dev and prod
3. **Deploy one environment at a time** (destroy dev before deploying prod, or vice versa)

## Troubleshooting

### Common Issues

1. **CDK context not found**: Ensure you're using the correct environment context
2. **Permission errors**: Verify AWS credentials and permissions
3. **Resource naming conflicts**: Cannot deploy both environments simultaneously in same account/region
4. **Deployment failures**: Check CloudFormation events for specific error messages

### Useful Commands

```bash
# Check CDK version
cdk --version

# List all stacks
cdk list

# View stack details
cdk describe Acsd2PStack-Dev
cdk describe Acsd2PStack-Prod

# Bootstrap CDK (if needed)
cdk bootstrap aws://ACCOUNT-NUMBER/REGION
```

## Support

For issues or questions about the CDK setup, please refer to:
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [AWS CDK API Reference](https://docs.aws.amazon.com/cdk/api/)
- [CloudFormation Documentation](https://docs.aws.amazon.com/cloudformation/)
