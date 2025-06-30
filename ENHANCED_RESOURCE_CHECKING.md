# Enhanced Resource Checking System

## Overview

The Enhanced Resource Checking System is designed to prevent redeployment of existing AWS resources by comprehensively checking for their existence before deployment. This system ensures that shared resources (DynamoDB tables, S3 buckets, SQS queues) are not accidentally recreated, preserving data and maintaining service continuity.

## Key Features

### 🔍 Multi-Source Resource Detection
- **CloudFormation Stack Resources**: Checks existing CloudFormation stacks for resources
- **Direct AWS API Calls**: Falls back to direct AWS SDK calls for resource verification
- **Environment Variables**: Supports manual configuration via environment variables
- **Configuration Files**: Uses predefined resource configurations

### 🛡️ Resource Preservation
- **Data Retention**: Prevents accidental deletion of DynamoDB tables and S3 buckets
- **Service Continuity**: Maintains existing SQS queues and their configurations
- **Import Strategy**: Imports existing resources instead of recreating them

### 📊 Comprehensive Logging
- **Resource Status**: Shows whether resources exist or need creation
- **Source Tracking**: Identifies where resource information came from
- **Stack Integration**: Shows CloudFormation stack resource IDs when available

## Architecture

### Enhanced Resource Checker (`lib/shared/enhanced-resource-checker.ts`)

The core component that provides comprehensive resource checking capabilities:

```typescript
export class EnhancedResourceChecker {
  // Check resources in CloudFormation stack
  static async checkResourceInStack(resourceName, resourceType, stackName, region)
  
  // Enhanced resource existence checks
  static async checkDynamoDBTableExists(tableName, region, stackName?)
  static async checkS3BucketExists(bucketName, region, stackName?)
  static async checkSQSQueueExists(queueName, region, stackName?)
  
  // Comprehensive resource checking
  static async checkSharedResourcesComprehensive(stage, region, account, stackName?)
}
```

### Resource Existence Check Interface

```typescript
export interface ResourceExistenceCheck {
  exists: boolean;
  needsCreation: boolean;
  resourceArn?: string;
  source: 'cloudformation' | 'aws' | 'environment' | 'unknown';
  stackResourceId?: string;
}
```

## Usage

### 1. Resource Discovery

Before deployment, discover existing resources:

```bash
# Discover resources in development environment
npm run discover:resources:dev

# Discover resources in production environment
npm run discover:resources:prod
```

This will:
- Scan AWS for existing DynamoDB tables, S3 buckets, and SQS queues
- Generate `discovered-resources.json` with detailed resource information
- Create `.env.discovered` with environment variables for existing resources

### 2. Enhanced Deployment

Use the enhanced deployment script for comprehensive resource checking:

```bash
# Deploy to development with enhanced checking
npm run deploy:enhanced:dev

# Deploy to production with enhanced checking
npm run deploy:enhanced:prod
```

### 3. Manual Configuration

You can manually configure existing resources in your `.env.local` file:

```env
# Existing DynamoDB tables
EXISTING_DYNAMODB_TABLES=dev-Users,dev-Conversations,dev-Threads

# Existing S3 buckets
EXISTING_S3_BUCKETS=dev-storage,dev-email-attachments

# Existing SQS queues
EXISTING_SQS_QUEUES=dev-EmailProcessQueue,dev-EmailProcessDLQ
```

## Resource Checking Process

### 1. Environment Variable Check
The system first checks for manually configured resources in environment variables.

### 2. CloudFormation Stack Check
If no environment variables are set, it checks the current CloudFormation stack for existing resources.

### 3. Direct AWS API Check
As a fallback, it makes direct AWS API calls to verify resource existence.

### 4. Resource Import vs Creation
Based on the check results:
- **Existing Resources**: Imported using CDK's `from*` methods
- **Missing Resources**: Created as new CDK constructs

## Resource Types

### DynamoDB Tables
- **Check Method**: `describeTable` API call
- **Import Method**: `dynamodb.Table.fromTableName()`
- **Naming Convention**: `${stage}-${tableName}`

### S3 Buckets
- **Check Method**: `headBucket` API call
- **Import Method**: `s3.Bucket.fromBucketName()`
- **Naming Convention**: `${stage}-${bucketName}` (lowercase)

### SQS Queues
- **Check Method**: `getQueueUrl` API call
- **Import Method**: `sqs.Queue.fromQueueAttributes()`
- **Naming Convention**: `${stage}-${queueName}`

## Configuration

### Environment Configuration

Update `lib/shared/resource-config.ts` to include existing resources:

```typescript
export const SHARED_RESOURCE_CONFIGS: { [key: string]: SharedResourceConfig } = {
  'dev': {
    stage: 'dev',
    region: 'us-west-1',
    account: '123456789012',
    existingResources: {
      dynamoDBTables: ['dev-Users', 'dev-Conversations'],
      s3Buckets: ['dev-storage', 'dev-email-attachments'],
      sqsQueues: ['dev-EmailProcessQueue', 'dev-EmailProcessDLQ']
    }
  }
};
```

### CDK Context Configuration

Update `cdk.json` to include environment-specific settings:

```json
{
  "context": {
    "dev": {
      "region": "us-west-1",
      "importExistingResources": true
    },
    "prod": {
      "region": "us-east-2",
      "importExistingResources": true
    }
  }
}
```

## Deployment Workflow

### 1. Pre-Deployment Check
```bash
# Discover existing resources
npm run discover:resources:dev

# Review discovered resources
cat discovered-resources.json
```

### 2. Configuration Update
```bash
# Copy discovered environment variables
cp .env.discovered .env.local

# Edit .env.local to include only relevant resources
nano .env.local
```

### 3. Enhanced Deployment
```bash
# Deploy with enhanced resource checking
npm run deploy:enhanced:dev
```

## Monitoring and Debugging

### Resource Check Summary

The enhanced deployment provides a detailed summary:

```
📊 Resource Check Summary:
   DynamoDB Tables:
     Users: ✅ EXISTS (cloudformation)
     Conversations: ❌ MISSING
   S3 Buckets:
     storage: ✅ EXISTS (aws)
     email-attachments: ❌ MISSING
   SQS Queues:
     EmailProcessQueue: ✅ EXISTS (cloudformation)
     EmailProcessDLQ: ❌ MISSING
```

### CloudWatch Logs

All resource checking activities are logged to CloudWatch with structured logging:

```json
{
  "level": "INFO",
  "message": "Resource check completed",
  "stage": "dev",
  "region": "us-west-1",
  "resources": {
    "dynamoDBTables": {"Users": {"exists": true, "source": "cloudformation"}},
    "s3Buckets": {"storage": {"exists": true, "source": "aws"}},
    "sqsQueues": {"EmailProcessQueue": {"exists": true, "source": "cloudformation"}}
  }
}
```

## Best Practices

### 1. Resource Naming
- Use consistent naming conventions: `${stage}-${resourceName}`
- Avoid special characters in resource names
- Keep names descriptive but concise

### 2. Environment Separation
- Use different resource names for different environments
- Avoid sharing resources between environments unless necessary
- Use environment-specific configurations

### 3. Data Preservation
- Always use `RemovalPolicy.RETAIN` for data stores
- Test resource import functionality in development first
- Keep backups of critical data before major deployments

### 4. Monitoring
- Monitor resource creation and import activities
- Set up CloudWatch alarms for resource-related errors
- Review resource check summaries after each deployment

## Troubleshooting

### Common Issues

#### 1. Resource Not Found
```
Error: Could not check DynamoDB table dev-Users: ResourceNotFoundException
```
**Solution**: Verify the resource name and region. Use the discovery script to find correct names.

#### 2. Permission Denied
```
Error: Access Denied when checking S3 bucket
```
**Solution**: Ensure AWS credentials have appropriate permissions for resource checking.

#### 3. Stack Resource Mismatch
```
Warning: Resource found in stack but name doesn't match
```
**Solution**: Check the CloudFormation stack for the exact resource names.

### Debug Commands

```bash
# Check AWS credentials
aws sts get-caller-identity

# List all DynamoDB tables
aws dynamodb list-tables --region us-west-1

# List all S3 buckets
aws s3api list-buckets

# List all SQS queues
aws sqs list-queues --region us-west-1

# Check CloudFormation stack resources
aws cloudformation list-stack-resources --stack-name Acsd2PStack-dev --region us-west-1
```

## Migration Guide

### From Basic Resource Checking

1. **Update Imports**: Replace `ResourceChecker` with `EnhancedResourceChecker`
2. **Update Interfaces**: Use the enhanced `ResourceExistenceCheck` interface
3. **Add Source Tracking**: Include source information in resource checks
4. **Test Deployment**: Run discovery and enhanced deployment scripts

### Example Migration

**Before:**
```typescript
import { ResourceChecker } from './shared/resource-checker';

const check = await ResourceChecker.checkDynamoDBTableExists(tableName, region);
```

**After:**
```typescript
import { EnhancedResourceChecker } from './shared/enhanced-resource-checker';

const check = await EnhancedResourceChecker.checkDynamoDBTableExists(tableName, region, stackName);
console.log(`Resource source: ${check.source}`);
```

## Security Considerations

### IAM Permissions

The enhanced resource checker requires the following IAM permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:DescribeTable",
        "dynamodb:ListTables",
        "s3:HeadBucket",
        "s3:ListBucket",
        "sqs:GetQueueUrl",
        "sqs:GetQueueAttributes",
        "sqs:ListQueues",
        "cloudformation:ListStackResources",
        "cloudformation:DescribeStacks"
      ],
      "Resource": "*"
    }
  ]
}
```

### Resource Access Control

- Resources are imported with read-only access where possible
- Creation permissions are only used when resources don't exist
- All resource operations are logged for audit purposes

## Conclusion

The Enhanced Resource Checking System provides a robust solution for preventing accidental resource redeployment while maintaining the flexibility to create new resources when needed. By combining multiple checking strategies and providing comprehensive logging, it ensures reliable and safe deployments across all environments.

For additional support or questions, refer to the main workflow guide or contact the development team. 