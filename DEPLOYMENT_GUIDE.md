# ACS CDK Deployment Guide

## 🚨 Current Issue: Existing Resources Conflict

If you're seeing deployment failures like:
```
Resource handler returned message: "Resource of type 'AWS::DynamoDB::Table' with identifier 'dev-Threads' already exists."
```

This means you have existing resources from a previous deployment that need to be handled properly.

## 🔧 Solution: Resource Management

### Option 1: Use the Resource Management Script (Recommended)

1. **Run the resource management script**:
   ```bash
   node scripts/manage-resources.js dev
   ```

2. **Review the generated `.env.local` file**:
   ```bash
   cat .env.local
   ```

3. **Deploy with existing resource handling**:
   ```bash
   npx cdk deploy --context env=dev
   ```

### Option 2: Manual Configuration

1. **Create `.env.local` file**:
   ```bash
   cp config.env .env.local
   ```

2. **Edit `.env.local`** to include existing Cognito resources (if any):
   ```env
   ENVIRONMENT=dev
   EXISTING_USER_POOL_ID=us-west-1_xxxxxxxxx
   EXISTING_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
   EXISTING_USER_POOL_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

3. **Deploy**:
   ```bash
   npx cdk deploy --context env=dev
   ```

## 🏗️ What the Fix Does

The updated code now:

1. **Detects existing resources** automatically
2. **Imports existing resources** instead of trying to create them
3. **Preserves all data** in DynamoDB tables and S3 buckets
4. **Creates only new resources** (Lambda functions, API Gateway, etc.)

## 📋 Resource Types Handled

### ✅ Automatically Imported (if they exist)
- **DynamoDB Tables**: `dev-Users`, `dev-Conversations`, `dev-Threads`, `dev-Organizations`, `dev-RateLimiting`
- **S3 Buckets**: `dev-storage`, `dev-email-attachments`
- **SQS Queues**: `dev-EmailProcessQueue`, `dev-EmailProcessDLQ`

### 🆕 Always Created (new)
- **Lambda Functions**: All functions in `lambdas/` directory
- **API Gateway**: REST API with all routes
- **IAM Roles**: Service roles for Lambda functions
- **CloudWatch Logs**: Log groups for Lambda functions

## 🔍 Verification Steps

After deployment, verify:

1. **Check DynamoDB tables**:
   ```bash
   aws dynamodb list-tables --region us-west-1
   ```

2. **Check S3 buckets**:
   ```bash
   aws s3 ls --region us-west-1
   ```

3. **Check Lambda functions**:
   ```bash
   aws lambda list-functions --region us-west-1
   ```

4. **Check API Gateway**:
   ```bash
   aws apigateway get-rest-apis --region us-west-1
   ```

## 🚀 Deployment Commands

### Development Environment
```bash
# Check existing resources
node scripts/manage-resources.js dev

# Deploy to development
npx cdk deploy --context env=dev
```

### Production Environment
```bash
# Check existing resources
node scripts/manage-resources.js prod

# Deploy to production (with approval)
npx cdk deploy --context env=prod --require-approval never
```

## 🛠️ Troubleshooting

### Issue: Resources still failing to create
**Solution**: The script assumes resources exist. If they don't, modify the `checkExistingResources` method in `lib/acsd2p-stack.ts` to return `undefined` instead of the existence checks.

### Issue: Cognito User Pool not found
**Solution**: Leave the Cognito environment variables empty in `.env.local` to create a new User Pool.

### Issue: Permission errors
**Solution**: Ensure your AWS credentials have the necessary permissions for all AWS services used.

## 📚 Additional Resources

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [ACS Workflow Guide](WORKFLOW_GUIDE.md)
- [Resource Management Script](scripts/manage-resources.js)

---

**Note**: This deployment approach ensures data preservation while allowing infrastructure updates. All existing data in DynamoDB tables and S3 buckets will be retained. 