const { execSync } = require('child_process');

console.log('🚀 Example Usage of the Create Module\n');

console.log('📋 The Create module provides intelligent resource management:');
console.log('   - Checks if resources exist in AWS');
console.log('   - Imports existing resources if found');
console.log('   - Creates new resources if not found');
console.log('   - Handles logical ID conflicts automatically\n');

console.log('🔧 Available Create Methods:');
console.log('   create.createLambda(name, params)');
console.log('   create.createTable(name, params)');
console.log('   create.createS3Bucket(name, params)');
console.log('   create.createSQSQueue(name, params)');
console.log('   create.createCognitoUserPool(name, params)');
console.log('   create.createApiRoute(api, pathParts, params)');
console.log('   create.createIAMRole(name, params)\n');

console.log('💡 Example Usage in TypeScript:');
console.log(`
import { Create } from './lib/create';

// Initialize the Create utility
const create = new Create(this, stage, account, region);

// Create or import a Lambda function
const myLambda = await create.createLambda('MyFunction', {
  memorySize: 512,
  timeout: Duration.minutes(5),
  environment: {
    MY_VAR: 'value'
  }
});

// Create or import a DynamoDB table
const myTable = await create.createTable('MyTable', {
  partitionKey: { name: 'id', type: AttributeType.STRING },
  sortKey: { name: 'timestamp', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  pointInTimeRecovery: true
});

// Create or import an S3 bucket
const myBucket = await create.createS3Bucket('MyBucket', {
  versioned: true,
  encryption: BucketEncryption.S3_MANAGED,
  blockPublicAccess: BlockPublicAccess.BLOCK_ALL
});

// Create or import an SQS queue
const myQueue = await create.createSQSQueue('MyQueue', {
  visibilityTimeout: Duration.minutes(5),
  retentionPeriod: Duration.days(14)
});

// Create an API route
create.createApiRoute(api, ['api', 'my', 'endpoint'], {
  method: 'POST',
  lambdaFunction: myLambda
});
`);

console.log('🎯 Benefits:');
console.log('   ✅ No more resource naming conflicts');
console.log('   ✅ Automatic resource import/creation');
console.log('   ✅ Consistent resource management');
console.log('   ✅ Environment-aware resource naming');
console.log('   ✅ Auto-detection of runtime and handlers');
console.log('   ✅ Built-in best practices and defaults\n');

console.log('🔍 Resource Existence Check:');
console.log('   The Create module will:');
console.log('   1. Check if a resource with the same name exists in AWS');
console.log('   2. If found: Import the existing resource');
console.log('   3. If not found: Create a new resource');
console.log('   4. Use unique logical IDs to avoid CloudFormation conflicts\n');

console.log('📝 Environment Variables for Import Control:');
console.log('   TABLES_TO_IMPORT=Users,Conversations,Threads');
console.log('   BUCKETS_TO_IMPORT=storage,email-attachments');
console.log('   LAMBDAS_TO_IMPORT=LoginUser,DBSelect,Send-Email\n');

console.log('🚀 Ready to deploy with intelligent resource management!'); 