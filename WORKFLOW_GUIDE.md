# ACS CDK Infrastructure Workflow Guide

## 🎯 Overview

This guide defines the workflow for managing the ACS (Automated Communication System) CDK infrastructure codebase. The infrastructure is designed to be **dev-friendly**, **dynamic**, and **automated** while maintaining **simplicity** and **efficiency** in development workflows.

## 🏗️ Architecture Principles

### Core Design Philosophy
- **Compartmentalization**: Each component is isolated for easy maintenance
- **Automation**: Minimal manual intervention required
- **Dynamism**: Environment variables and settings are automatically managed
- **Content Preservation**: Critical data is retained across deployments
- **Multi-Region**: Single account, multiple regions with shared resources

### Key Features
- **Auto-Detection**: Lambda runtime and handlers are automatically detected
- **Environment Management**: Seamless switching between dev/prod environments
- **Resource Retention**: S3, DynamoDB, and other data stores preserve content
- **Shared Resources**: Cognito and other global resources are shared across regions

## 📁 Project Structure

```
acsd2p/
├── bin/acsd2p.ts                 # CDK App entry point
├── lib/acsd2p-stack.ts           # Main infrastructure stack
├── lambdas/                      # Lambda functions (auto-detected)
│   ├── [FunctionName]/           # Each function in its own directory
│   │   ├── lambda_function.py    # Python handler (auto-detected)
│   │   ├── index.js/mjs          # Node.js handler (auto-detected)
│   │   ├── requirements.txt      # Python dependencies
│   │   └── package.json          # Node.js dependencies
├── cdk.json                      # CDK configuration with environment contexts
├── config.env                    # Environment configuration
└── WORKFLOW_GUIDE.md            # This guide
```

## 🔧 Development Workflow

### 1. Environment Setup

#### Prerequisites
```bash
# Install dependencies
npm install

# Install AWS CDK globally (if not already installed)
npm install -g aws-cdk
```

#### Environment Configuration
1. **Copy configuration template**:
   ```bash
   cp config.env .env.local
   ```

2. **Configure environment variables** in `.env.local`:
   ```env
   # For existing Cognito resources (recommended for production)
   EXISTING_USER_POOL_ID=us-west-1_xxxxxxxxx
   EXISTING_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
   EXISTING_USER_POOL_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxx
   
   # Environment selection
   ENVIRONMENT=dev
   ```

### 2. Lambda Development

#### Adding New Lambda Functions
1. **Create function directory** in `lambdas/`:
   ```bash
   mkdir lambdas/MyNewFunction
   ```

2. **Add function code** (supports both Python and Node.js):
   ```python
   # lambdas/MyNewFunction/lambda_function.py
   def handler(event, context):
       return {
           'statusCode': 200,
           'body': 'Hello from MyNewFunction!'
       }
   ```

3. **Add dependencies** (if needed):
   ```bash
   # For Python
   echo "requests==2.31.0" > lambdas/MyNewFunction/requirements.txt
   
   # For Node.js
   echo '{"dependencies": {"axios": "^1.6.0"}}' > lambdas/MyNewFunction/package.json
   ```

#### Auto-Detection Features
- **Runtime Detection**: Automatically detects Python vs Node.js based on file presence
- **Handler Detection**: Finds the appropriate entry point (`lambda_function.py`, `index.js`, etc.)
- **Environment Variables**: All functions automatically receive shared environment variables
- **Permissions**: Automatic IAM permissions for DynamoDB, S3, SQS, and Cognito

### 3. Database Management

#### DynamoDB Tables
All tables are created with `RemovalPolicy.RETAIN` to preserve data during deployments:

```typescript
// Tables are automatically created with retention policies
const table = new dynamodb.Table(this, 'TableName', {
  removalPolicy: cdk.RemovalPolicy.RETAIN, // Data preserved during deployments
  // ... other configuration
});
```

#### Adding New Tables
1. **Add table definition** in `lib/acsd2p-stack.ts`
2. **Grant permissions** to lambda functions (automatic)
3. **Add to shared environment** variables if needed

### 4. API Gateway Management

#### Adding New Routes
1. **Add route definition** in the `routeMap` array:
   ```typescript
   { path: ['api', 'new', 'endpoint'], method: 'POST', lambda: "MyNewFunction" }
   ```

2. **CORS is automatically configured** for all routes
3. **Lambda integration is automatic**

## 🚀 Deployment Workflow

### Development Deployment
```bash
# Deploy to development environment (us-west-1)
npx cdk deploy --context env=dev

# Or using environment variable
ENVIRONMENT=dev npx cdk deploy
```

### Production Deployment
```bash
# Deploy to production environment (us-east-2)
npx cdk deploy --context env=prod --require-approval never
```

### Deployment Safety Features
- **Production Warning**: 10-second delay with clear warnings
- **Environment Validation**: Ensures correct region deployment
- **Resource Retention**: Critical data is preserved
- **Rollback Capability**: Previous versions can be restored

## 🔄 Multi-Region Considerations

### Shared Resources
The following resources are **shared across regions** within the same account:

1. **Cognito User Pool**: Global resource, imported by reference
2. **IAM Roles**: Global resources, reused across regions
3. **S3 Buckets**: Can be accessed from any region
4. **DynamoDB Tables**: Global tables or cross-region access

### Region-Specific Resources
- **Lambda Functions**: Deployed per region
- **API Gateway**: Region-specific endpoints
- **CloudWatch Logs**: Region-specific
- **SQS Queues**: Region-specific

### Content Preservation Strategy
```typescript
// All data stores use retention policies
removalPolicy: cdk.RemovalPolicy.RETAIN

// S3 buckets preserve objects
autoDeleteObjects: false

// DynamoDB tables retain data
removalPolicy: cdk.RemovalPolicy.RETAIN
```

## 🛠️ Development Best Practices

### 1. Code Organization
- **Keep lambdas modular**: Each function in its own directory
- **Use shared utilities**: Common code in `lambdas/utils/`
- **Environment variables**: Use the shared environment system
- **Configuration**: Centralize in `config.env` and `cdk.json`

### 2. Testing
```bash
# Synthesize CloudFormation template
npx cdk synth

# Diff changes before deployment
npx cdk diff

# Validate stack
npx cdk validate
```

### 3. Environment Variables
All lambda functions automatically receive these environment variables:
- `STAGE`: Current environment (dev/prod)
- `AWS_ACCOUNT_ID`: AWS account ID
- `CDK_AWS_REGION`: Current region
- All function names for cross-function communication
- Database table names
- S3 bucket names
- SQS queue URLs

### 4. Adding New Resources

#### New DynamoDB Table
```typescript
// In lib/acsd2p-stack.ts
const newTable = new dynamodb.Table(this, 'NewTable', {
  tableName: getResourceName('NewTable'),
  partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
});

// Add to tables array for automatic permissions
tables.push(newTable);
```

#### New S3 Bucket
```typescript
// Add to s3Buckets array
const s3Buckets = [
  // ... existing buckets
  'new-bucket-name'
];
```

#### New Environment Variable
```typescript
// Add to sharedEnv object
const sharedEnv = {
  // ... existing variables
  NEW_VARIABLE: 'new-value',
};
```

## 🔍 Monitoring and Debugging

### CloudWatch Logs
- **Automatic logging**: All lambda functions log to CloudWatch
- **Structured logging**: Use JSON format for better querying
- **Log retention**: Configured per environment

### Error Handling
```python
# In lambda functions
import logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handler(event, context):
    try:
        # Your logic here
        return {'statusCode': 200, 'body': 'Success'}
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return {'statusCode': 500, 'body': 'Internal Server Error'}
```

## 🚨 Troubleshooting

### Common Issues

#### 1. Lambda Function Not Found
- **Check**: Function directory exists in `lambdas/`
- **Check**: Handler file exists (`lambda_function.py`, `index.js`, etc.)
- **Check**: Function name matches directory name

#### 2. Environment Variables Missing
- **Check**: Variable is added to `sharedEnv` object
- **Check**: Variable is properly formatted
- **Check**: No circular dependencies

#### 3. Permission Errors
- **Check**: Lambda function is in `lambdaFunctions` map
- **Check**: Tables are in `tables` array
- **Check**: Buckets are in `buckets` object

#### 4. Region Mismatch
- **Check**: `cdk.json` environment configuration
- **Check**: AWS CLI region setting
- **Check**: Environment variable `ENVIRONMENT`

### Debug Commands
```bash
# Check current environment
echo $ENVIRONMENT

# List all lambda functions
ls lambdas/

# Check CDK context
npx cdk context

# Validate stack
npx cdk validate

# Diff changes
npx cdk diff --context env=dev
```

## 📋 Maintenance Checklist

### Before Deployment
- [ ] Environment variables configured in `.env.local`
- [ ] All lambda functions have proper handlers
- [ ] Dependencies are specified (`requirements.txt` or `package.json`)
- [ ] Environment context is correct in `cdk.json`
- [ ] No hardcoded values in lambda functions

### After Deployment
- [ ] Verify all resources created successfully
- [ ] Check CloudWatch logs for errors
- [ ] Test API endpoints
- [ ] Verify data retention in DynamoDB/S3
- [ ] Update documentation if needed

### Regular Maintenance
- [ ] Update dependencies
- [ ] Review and clean up unused resources
- [ ] Monitor costs and usage
- [ ] Update security policies
- [ ] Review and rotate secrets

## 🔐 Security Considerations

### Secrets Management
- **Cognito secrets**: Stored in environment variables
- **API keys**: Use AWS Secrets Manager for production
- **Database credentials**: Use IAM roles where possible

### Access Control
- **Least privilege**: Lambda functions get minimal required permissions
- **CORS**: Configured per environment
- **API Gateway**: Protected with Cognito authorizer

### Data Protection
- **Encryption**: All S3 buckets and DynamoDB tables encrypted
- **Backup**: Data retention policies prevent accidental deletion
- **Audit**: CloudTrail enabled for all environments

## 📚 Additional Resources

### Documentation
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [AWS DynamoDB Documentation](https://docs.aws.amazon.com/dynamodb/)

### Tools
- **AWS CLI**: For manual AWS operations
- **CloudWatch**: For monitoring and logging
- **AWS Console**: For visual resource management

### Support
- **Team Lead**: For production deployment approval
- **AWS Support**: For AWS-specific issues
- **CDK Community**: For CDK-related questions

---

## 🎯 Quick Reference

### Common Commands
```bash
# Development deployment
ENVIRONMENT=dev npx cdk deploy

# Production deployment
ENVIRONMENT=prod npx cdk deploy --require-approval never

# Synthesize template
npx cdk synth

# Diff changes
npx cdk diff

# Destroy stack (use with caution)
npx cdk destroy
```

### Environment Variables
```bash
# Set environment
export ENVIRONMENT=dev

# Set AWS region
export AWS_DEFAULT_REGION=us-west-1
```

### File Locations
- **Stack Definition**: `lib/acsd2p-stack.ts`
- **App Entry**: `bin/acsd2p.ts`
- **Configuration**: `cdk.json`, `config.env`
- **Lambda Functions**: `lambdas/[FunctionName]/`

---

*This guide is maintained by the development team and should be updated as the infrastructure evolves.* 