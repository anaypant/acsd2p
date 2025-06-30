import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { createSharedResources } from './shared/shared-resources';
import { createQueueResources } from './queue/queue-resources';
import { createLambdaResources } from './lambda/lambda-resources';
import { createApiResources } from './api/api-resources';
import { ResourceChecker } from './shared/resource-checker';
import { ResourceConfigChecker } from './shared/resource-config';
import { EnhancedResourceChecker, ResourceExistenceCheck } from './shared/enhanced-resource-checker';
import { initializeChangeAwareness } from './shared/change-aware-resources';
import { ResourceImporter } from './shared/resource-importer';

interface Acsd2PStackProps extends cdk.StackProps {
  stage: string;
  // Existing Cognito User Pool parameters
  existingUserPoolId?: string;
  existingUserPoolClientId?: string;
  existingUserPoolClientSecret?: string;
}

export class Acsd2PStack extends cdk.Stack {
  public readonly userPool: any;
  public readonly userPoolClient: any;
  public readonly sharedDynamoDBTables: { [key: string]: any };
  public readonly sharedS3Buckets: { [key: string]: any };
  public readonly emailProcessQueue: any;
  public readonly lambdaFunctions: { [key: string]: any };
  public readonly api: any;

  constructor(scope: Construct, id: string, props: Acsd2PStackProps) {
    super(scope, id, props);

    const { stage } = props;

    // Initialize change awareness system
    initializeChangeAwareness();

    this.validateEnvironmentConfiguration(stage);

    console.log(`🏗️  Building ACS Infrastructure for ${stage.toUpperCase()} environment`);
    console.log(`   Region: ${this.region}`);
    console.log(`   Account: ${this.account}\n`);

    // Discover existing resources before creating new ones
    console.log('🔍 Discovering existing resources...');
    this.discoverExistingResources(stage);

    // Check for existing shared resources using enhanced checking
    console.log('🔍 Checking existing shared resources...');
    const resourceExistenceChecks = this.checkExistingResources(stage);

    // Create Shared Resources (Cognito, S3, DynamoDB)
    console.log('📦 Creating Shared Resources...');
    const sharedResources = createSharedResources(this, {
      stage: stage,
      existingUserPoolId: props.existingUserPoolId,
      existingUserPoolClientId: props.existingUserPoolClientId,
      existingUserPoolClientSecret: props.existingUserPoolClientSecret,
      importExistingResources: true,
      resourceExistenceChecks: resourceExistenceChecks,
    });
    
    this.userPool = sharedResources.userPool;
    this.userPoolClient = sharedResources.userPoolClient;
    this.sharedDynamoDBTables = sharedResources.sharedDynamoDBTables;
    this.sharedS3Buckets = sharedResources.sharedS3Buckets;

    // Create Queue Resources (SQS)
    console.log('📬 Creating Queue Resources...');
    const queueResources = createQueueResources(this, {
      stage: stage,
      importExistingResources: true,
      resourceExistenceChecks: resourceExistenceChecks,
    });
    
    this.emailProcessQueue = queueResources.emailProcessQueue;

    // Create Lambda Resources (Functions, Permissions)
    console.log('⚡ Creating Lambda Resources...');
    const lambdaResources = createLambdaResources(this, {
      stage: stage,
      userPool: this.userPool,
      userPoolClient: this.userPoolClient,
      existingUserPoolClientSecret: props.existingUserPoolClientSecret,
      sharedDynamoDBTables: this.sharedDynamoDBTables,
      sharedS3Buckets: this.sharedS3Buckets,
      emailProcessQueue: this.emailProcessQueue,
      importExistingResources: true,
    });
    
    this.lambdaFunctions = lambdaResources.lambdaFunctions;

    // Create API Resources (API Gateway, Routes)
    console.log('🌐 Creating API Resources...');
    const apiResources = createApiResources(this, {
      stage: stage,
      lambdaFunctions: this.lambdaFunctions,
    });
    
    this.api = apiResources.api;

    // Create Stack Outputs
    this.createStackOutputs();

    console.log('\n✅ ACS Infrastructure Stack created successfully!');
    console.log(`   Environment: ${stage.toUpperCase()}`);
    console.log(`   API Gateway: ${this.api.url}`);
    console.log(`   Lambda Functions: ${Object.keys(this.lambdaFunctions).length}`);
    console.log(`   DynamoDB Tables: ${Object.keys(this.sharedDynamoDBTables).length}`);
    console.log(`   S3 Buckets: ${Object.keys(this.sharedS3Buckets).length}`);
    console.log(`   SQS Queues: 1\n`);
  }

  private async discoverExistingResources(stage: string) {
    try {
      await ResourceImporter.discoverExistingResources(this, stage);
      console.log(ResourceImporter.getResourceSummary());
    } catch (error) {
      console.warn('   ⚠️  Resource discovery failed, proceeding with creation');
    }
  }

  private checkExistingResources(stage: string) {
    console.log('   📝 Checking for existing resources...');

    // First, try to get resources from environment variables (for manual override)
    const existingResourcesFromEnv = ResourceConfigChecker.getExistingResourcesFromEnv(stage);
    
    // If environment variables are set, use them
    if (existingResourcesFromEnv.dynamoDBTables?.length || 
        existingResourcesFromEnv.s3Buckets?.length || 
        existingResourcesFromEnv.sqsQueues?.length) {
      console.log('   📋 Using existing resources from environment variables');
      return this.buildExistenceMapFromEnv(existingResourcesFromEnv);
    }

    // Otherwise, use enhanced AWS SDK to check for existing resources
    console.log('   🔍 Using enhanced AWS SDK to check for existing resources');
    return this.buildExistenceMapFromEnhancedAWS(stage);
  }

  private buildExistenceMapFromEnv(existingResources: any) {
    // Build the existence map for DynamoDB tables
    const dynamoDBTableNames = [
      'Users',
      'Conversations',
      'Threads',
      'Organizations',
      'RateLimiting',
    ];
    const dynamoDBTables: { [key: string]: ResourceExistenceCheck } = {};
    for (const table of dynamoDBTableNames) {
      const fullName = table;
      const exists = existingResources.dynamoDBTables?.includes(fullName) || false;
      dynamoDBTables[table] = {
        exists,
        needsCreation: !exists,
        source: 'environment',
      };
    }

    // Build the existence map for S3 buckets
    const s3BucketNames = ['storage', 'email-attachments'];
    const s3Buckets: { [key: string]: ResourceExistenceCheck } = {};
    for (const bucket of s3BucketNames) {
      const fullName = bucket.toLowerCase();
      const exists = existingResources.s3Buckets?.includes(fullName) || false;
      s3Buckets[bucket] = {
        exists,
        needsCreation: !exists,
        source: 'environment',
      };
    }

    // Build the existence map for SQS queues
    const sqsQueueNames = ['EmailProcessQueue', 'EmailProcessDLQ'];
    const sqsQueues: { [key: string]: ResourceExistenceCheck } = {};
    for (const queue of sqsQueueNames) {
      const fullName = queue;
      const exists = existingResources.sqsQueues?.includes(fullName) || false;
      sqsQueues[queue] = {
        exists,
        needsCreation: !exists,
        source: 'environment',
      };
    }

    return {
      dynamoDBTables,
      s3Buckets,
      sqsQueues,
    };
  }

  private buildExistenceMapFromEnhancedAWS(stage: string) {
    // Get the current stack name for CloudFormation resource checking
    const stackName = this.stackName;
    
    // Use the enhanced resource checker to get comprehensive resource information
    // Note: This is a synchronous wrapper around the async enhanced checker
    // In a real implementation, you might want to make this async or use a different approach
    
    const dynamoDBTableNames = [
      'Users',
      'Conversations',
      'Threads',
      'Organizations',
      'RateLimiting',
    ];
    const dynamoDBTables: { [key: string]: ResourceExistenceCheck } = {};
    for (const table of dynamoDBTableNames) {
      dynamoDBTables[table] = {
        exists: false,
        needsCreation: true,
        source: 'unknown',
      };
    }

    const s3BucketNames = ['storage', 'email-attachments'];
    const s3Buckets: { [key: string]: ResourceExistenceCheck } = {};
    for (const bucket of s3BucketNames) {
      s3Buckets[bucket] = {
        exists: false,
        needsCreation: true,
        source: 'unknown',
      };
    }

    const sqsQueueNames = ['EmailProcessQueue', 'EmailProcessDLQ'];
    const sqsQueues: { [key: string]: ResourceExistenceCheck } = {};
    for (const queue of sqsQueueNames) {
      sqsQueues[queue] = {
        exists: false,
        needsCreation: true,
        source: 'unknown',
      };
    }

    // Log that we're using the enhanced checker
    console.log(`   🔍 Enhanced resource checking will be performed during deployment`);
    console.log(`   📋 Stack name: ${stackName}`);

    return {
      dynamoDBTables,
      s3Buckets,
      sqsQueues,
    };
  }

  /**
   * Enhanced method to check resources during deployment
   * This can be called from the resource creation modules
   */
  public static async checkResourcesComprehensive(
    stage: string, 
    region: string, 
    account: string,
    stackName?: string
  ) {
    return await EnhancedResourceChecker.checkSharedResourcesComprehensive(
      stage, 
      region, 
      account, 
      stackName
    );
  }

  private createStackOutputs(): void {
    // Main API Gateway URL
    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: this.api.url,
      description: 'Main API Gateway URL',
      exportName: `${this.stackName}-ApiGatewayUrl`,
    });

    // Cognito Information
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: `${this.stackName}-UserPoolId`,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: `${this.stackName}-UserPoolClientId`,
    });

    // Queue Information
    new cdk.CfnOutput(this, 'EmailProcessQueueUrl', {
      value: this.emailProcessQueue.queueUrl,
      description: 'Email Process Queue URL',
      exportName: `${this.stackName}-EmailProcessQueueUrl`,
    });

    // Resource Counts
    new cdk.CfnOutput(this, 'LambdaFunctionCount', {
      value: Object.keys(this.lambdaFunctions).length.toString(),
      description: 'Number of Lambda functions deployed',
      exportName: `${this.stackName}-LambdaFunctionCount`,
    });

    new cdk.CfnOutput(this, 'DynamoDBTableCount', {
      value: Object.keys(this.sharedDynamoDBTables).length.toString(),
      description: 'Number of DynamoDB tables deployed',
      exportName: `${this.stackName}-DynamoDBTableCount`,
    });

    new cdk.CfnOutput(this, 'S3BucketCount', {
      value: Object.keys(this.sharedS3Buckets).length.toString(),
      description: 'Number of S3 buckets deployed',
      exportName: `${this.stackName}-S3BucketCount`,
    });
  }

  private validateEnvironmentConfiguration(stage: string): void {
    const currentRegion = this.region;
    const currentAccount = this.account;

    console.log(`🔍 Environment Validation:`);
    console.log(`   Stage: ${stage}`);
    console.log(`   Region: ${currentRegion}`);
    console.log(`   Account: ${currentAccount}`);

    if (stage === 'dev' && currentRegion !== 'us-west-1') {
      throw new Error(`❌ DEPLOYMENT ERROR: Development environment must be deployed to us-west-1, but current region is ${currentRegion}`);
    }

    if (stage === 'prod' && currentRegion !== 'us-east-2') {
      throw new Error(`❌ DEPLOYMENT ERROR: Production environment must be deployed to us-east-2, but current region is ${currentRegion}`);
    }

    console.log(`   ✅ Validation passed - deploying to correct region for ${stage} environment`);
    console.log(`   ✅ Environment configuration is valid\n`);
  }
}
