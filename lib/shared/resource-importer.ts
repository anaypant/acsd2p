import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface ExistingResourceInfo {
  exists: boolean;
  physicalId?: string;
  arn?: string;
  name?: string;
}

export class ResourceImporter {
  private static existingResources: Map<string, ExistingResourceInfo> = new Map();

  static setExistingResource(resourceName: string, info: ExistingResourceInfo) {
    this.existingResources.set(resourceName, info);
  }

  static getExistingResource(resourceName: string): ExistingResourceInfo | undefined {
    return this.existingResources.get(resourceName);
  }

  static hasExistingResource(resourceName: string): boolean {
    return this.existingResources.has(resourceName) && 
           this.existingResources.get(resourceName)?.exists === true;
  }

  static importDynamoDBTable(
    scope: cdk.Stack,
    tableName: string,
    props: dynamodb.TableProps
  ): dynamodb.ITable {
    const existingInfo = this.getExistingResource(tableName);
    
    if (existingInfo?.exists && existingInfo.physicalId) {
      console.log(`   📋 Importing existing DynamoDB table: ${tableName} (${existingInfo.physicalId})`);
      
      return dynamodb.Table.fromTableName(
        scope,
        `${tableName}Imported`,
        existingInfo.physicalId
      );
    } else {
      console.log(`   🆕 Creating new DynamoDB table: ${tableName}`);
      return new dynamodb.Table(scope, tableName, {
        ...props,
        removalPolicy: cdk.RemovalPolicy.RETAIN, // Preserve data
      });
    }
  }

  static importS3Bucket(
    scope: cdk.Stack,
    bucketName: string,
    props: s3.BucketProps
  ): s3.IBucket {
    const existingInfo = this.getExistingResource(bucketName);
    
    if (existingInfo?.exists && existingInfo.name) {
      console.log(`   📋 Importing existing S3 bucket: ${bucketName} (${existingInfo.name})`);
      
      return s3.Bucket.fromBucketName(
        scope,
        `${bucketName}Imported`,
        existingInfo.name
      );
    } else {
      console.log(`   🆕 Creating new S3 bucket: ${bucketName}`);
      return new s3.Bucket(scope, bucketName, {
        ...props,
        autoDeleteObjects: false, // Preserve objects
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });
    }
  }

  static importSQSQueue(
    scope: cdk.Stack,
    queueName: string,
    props: sqs.QueueProps
  ): sqs.IQueue {
    const existingInfo = this.getExistingResource(queueName);
    
    if (existingInfo?.exists && existingInfo.physicalId) {
      console.log(`   📋 Importing existing SQS queue: ${queueName} (${existingInfo.physicalId})`);
      
      return sqs.Queue.fromQueueArn(
        scope,
        `${queueName}Imported`,
        existingInfo.arn || `arn:aws:sqs:${scope.region}:${scope.account}:${existingInfo.physicalId}`
      );
    } else {
      console.log(`   🆕 Creating new SQS queue: ${queueName}`);
      return new sqs.Queue(scope, queueName, {
        ...props,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });
    }
  }

  static importCognitoUserPool(
    scope: cdk.Stack,
    userPoolName: string,
    props: cognito.UserPoolProps,
    existingUserPoolId?: string
  ): cognito.IUserPool {
    if (existingUserPoolId) {
      console.log(`   📋 Importing existing Cognito User Pool: ${userPoolName} (${existingUserPoolId})`);
      
      return cognito.UserPool.fromUserPoolId(
        scope,
        `${userPoolName}Imported`,
        existingUserPoolId
      );
    } else {
      const existingInfo = this.getExistingResource(userPoolName);
      
      if (existingInfo?.exists && existingInfo.physicalId) {
        console.log(`   📋 Importing existing Cognito User Pool: ${userPoolName} (${existingInfo.physicalId})`);
        
        return cognito.UserPool.fromUserPoolId(
          scope,
          `${userPoolName}Imported`,
          existingInfo.physicalId
        );
      } else {
        console.log(`   🆕 Creating new Cognito User Pool: ${userPoolName}`);
        return new cognito.UserPool(scope, userPoolName, {
          ...props,
          removalPolicy: cdk.RemovalPolicy.RETAIN,
        });
      }
    }
  }

  static importLambdaFunction(
    scope: cdk.Stack,
    functionName: string,
    props: lambda.FunctionProps
  ): lambda.IFunction {
    const existingInfo = this.getExistingResource(functionName);
    
    if (existingInfo?.exists && existingInfo.physicalId) {
      console.log(`   📋 Importing existing Lambda function: ${functionName} (${existingInfo.physicalId})`);
      
      return lambda.Function.fromFunctionName(
        scope,
        `${functionName}Imported`,
        existingInfo.physicalId
      );
    } else {
      console.log(`   🆕 Creating new Lambda function: ${functionName}`);
      return new lambda.Function(scope, functionName, props);
    }
  }

  static importIAMRole(
    scope: cdk.Stack,
    roleName: string,
    props: iam.RoleProps
  ): iam.IRole {
    const existingInfo = this.getExistingResource(roleName);
    
    if (existingInfo?.exists && existingInfo.physicalId) {
      console.log(`   📋 Importing existing IAM role: ${roleName} (${existingInfo.physicalId})`);
      
      return iam.Role.fromRoleName(
        scope,
        `${roleName}Imported`,
        existingInfo.physicalId
      );
    } else {
      console.log(`   🆕 Creating new IAM role: ${roleName}`);
      return new iam.Role(scope, roleName, props);
    }
  }

  static async discoverExistingResources(
    scope: cdk.Stack,
    stage: string
  ): Promise<void> {
    console.log('🔍 Discovering existing resources...');
    
    try {
      // Discover DynamoDB tables
      await this.discoverDynamoDBTables(scope, stage);
      
      // Discover S3 buckets
      await this.discoverS3Buckets(scope, stage);
      
      // Discover SQS queues
      await this.discoverSQSQueues(scope, stage);
      
      // Discover Lambda functions
      await this.discoverLambdaFunctions(scope, stage);
      
      console.log('   ✅ Resource discovery completed');
    } catch (error: any) {
      console.warn(`   ⚠️  Resource discovery failed: ${error.message}`);
      console.log('   📋 Proceeding with resource creation...');
    }
  }

  private static async discoverDynamoDBTables(scope: cdk.Stack, stage: string): Promise<void> {
    const tableNames = ['Users', 'Conversations', 'Threads', 'Organizations', 'RateLimiting'];
    
    for (const tableName of tableNames) {
      const fullTableName = `${stage}-${tableName}`;
      
      try {
        // Try to describe the table
        const { execSync } = require('child_process');
        const result = execSync(
          `aws dynamodb describe-table --table-name ${fullTableName} --region ${scope.region} --output json`,
          { encoding: 'utf8', stdio: 'pipe' }
        );
        
        const tableInfo = JSON.parse(result);
        this.setExistingResource(tableName, {
          exists: true,
          physicalId: fullTableName,
          arn: tableInfo.Table.TableArn,
          name: fullTableName
        });
        
        console.log(`   📋 Found existing DynamoDB table: ${fullTableName}`);
      } catch (error) {
        // Table doesn't exist
        this.setExistingResource(tableName, { exists: false });
      }
    }
  }

  private static async discoverS3Buckets(scope: cdk.Stack, stage: string): Promise<void> {
    const bucketNames = ['storage', 'email-attachments'];
    
    for (const bucketName of bucketNames) {
      const fullBucketName = `${stage}-${bucketName}`;
      
      try {
        const { execSync } = require('child_process');
        const result = execSync(
          `aws s3api head-bucket --bucket ${fullBucketName} --region ${scope.region}`,
          { encoding: 'utf8', stdio: 'pipe' }
        );
        
        this.setExistingResource(bucketName, {
          exists: true,
          physicalId: fullBucketName,
          name: fullBucketName
        });
        
        console.log(`   📋 Found existing S3 bucket: ${fullBucketName}`);
      } catch (error) {
        // Bucket doesn't exist
        this.setExistingResource(bucketName, { exists: false });
      }
    }
  }

  private static async discoverSQSQueues(scope: cdk.Stack, stage: string): Promise<void> {
    const queueNames = ['EmailProcessQueue', 'EmailProcessDLQ'];
    
    for (const queueName of queueNames) {
      const fullQueueName = `${stage}-${queueName}`;
      
      try {
        const { execSync } = require('child_process');
        const result = execSync(
          `aws sqs get-queue-url --queue-name ${fullQueueName} --region ${scope.region} --output json`,
          { encoding: 'utf8', stdio: 'pipe' }
        );
        
        const queueInfo = JSON.parse(result);
        this.setExistingResource(queueName, {
          exists: true,
          physicalId: fullQueueName,
          arn: `arn:aws:sqs:${scope.region}:${scope.account}:${fullQueueName}`
        });
        
        console.log(`   📋 Found existing SQS queue: ${fullQueueName}`);
      } catch (error) {
        // Queue doesn't exist
        this.setExistingResource(queueName, { exists: false });
      }
    }
  }

  private static async discoverLambdaFunctions(scope: cdk.Stack, stage: string): Promise<void> {
    try {
      const { execSync } = require('child_process');
      const result = execSync(
        `aws lambda list-functions --region ${scope.region} --output json`,
        { encoding: 'utf8', stdio: 'pipe' }
      );
      
      const functions = JSON.parse(result).Functions;
      
      for (const func of functions) {
        const functionName = func.FunctionName;
        // Check if this is one of our functions (starts with stage prefix)
        if (functionName.startsWith(`${stage}-`)) {
          const baseName = functionName.replace(`${stage}-`, '');
          this.setExistingResource(baseName, {
            exists: true,
            physicalId: functionName,
            arn: func.FunctionArn
          });
          
          console.log(`   📋 Found existing Lambda function: ${functionName}`);
        }
      }
    } catch (error: any) {
      console.warn(`   ⚠️  Could not discover Lambda functions: ${error.message}`);
    }
  }

  static getResourceSummary(): string {
    const existing = Array.from(this.existingResources.values()).filter(r => r.exists).length;
    const total = this.existingResources.size;
    
    return `
📊 Resource Discovery Summary:
=============================
📋 Existing Resources: ${existing}/${total}
🆕 New Resources: ${total - existing}

${existing > 0 ? '📋 Existing resources will be imported' : '🆕 All resources will be created'}
    `.trim();
  }
} 