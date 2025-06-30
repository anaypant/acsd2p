import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as cloudformation from 'aws-cdk-lib/aws-cloudformation';
import { Construct } from 'constructs';

export interface ResourceExistenceCheck {
  exists: boolean;
  needsCreation: boolean;
  resourceArn?: string;
  source: 'cloudformation' | 'aws' | 'environment' | 'unknown';
  stackResourceId?: string;
}

export interface StackResourceInfo {
  logicalId: string;
  physicalId: string;
  resourceType: string;
  resourceStatus: string;
}

export class EnhancedResourceChecker {
  private static readonly AWS_SDK = require('aws-sdk');

  /**
   * Get all resources from the current CloudFormation stack
   */
  static async getStackResources(stackName: string, region: string): Promise<StackResourceInfo[]> {
    try {
      const cloudformationClient = new this.AWS_SDK.CloudFormation({ region });
      const result = await cloudformationClient.listStackResources({ StackName: stackName }).promise();
      
      return result.StackResourceSummaries.map((resource: any) => ({
        logicalId: resource.LogicalResourceId,
        physicalId: resource.PhysicalResourceId,
        resourceType: resource.ResourceType,
        resourceStatus: resource.ResourceStatus,
      }));
    } catch (error: any) {
      console.warn(`Warning: Could not get stack resources for ${stackName}: ${error.message}`);
      return [];
    }
  }

  /**
   * Check if a resource exists in the current CloudFormation stack
   */
  static async checkResourceInStack(
    resourceName: string, 
    resourceType: string, 
    stackName: string, 
    region: string
  ): Promise<ResourceExistenceCheck> {
    try {
      const stackResources = await this.getStackResources(stackName, region);
      
      // Look for resources that match the name pattern
      const matchingResource = stackResources.find(resource => {
        // Check if the resource type matches
        if (resource.resourceType !== resourceType) return false;
        
        // For DynamoDB tables, check if the physical ID contains the table name
        if (resourceType === 'AWS::DynamoDB::Table') {
          return resource.physicalId && resource.physicalId.includes(resourceName);
        }
        
        // For S3 buckets, check if the physical ID matches the bucket name
        if (resourceType === 'AWS::S3::Bucket') {
          return resource.physicalId === resourceName;
        }
        
        // For SQS queues, check if the physical ID contains the queue name
        if (resourceType === 'AWS::SQS::Queue') {
          return resource.physicalId && resource.physicalId.includes(resourceName);
        }
        
        return false;
      });

      if (matchingResource) {
        return {
          exists: true,
          needsCreation: false,
          resourceArn: this.buildResourceArn(resourceType, matchingResource.physicalId, region),
          source: 'cloudformation',
          stackResourceId: matchingResource.logicalId,
        };
      }

      return {
        exists: false,
        needsCreation: true,
        source: 'cloudformation',
      };
    } catch (error: any) {
      console.warn(`Warning: Could not check resource in stack: ${error.message}`);
      return {
        exists: false,
        needsCreation: true,
        source: 'unknown',
      };
    }
  }

  /**
   * Enhanced DynamoDB table existence check
   */
  static async checkDynamoDBTableExists(
    tableName: string, 
    region: string, 
    stackName?: string
  ): Promise<ResourceExistenceCheck> {
    // First check in CloudFormation stack if stack name is provided
    if (stackName) {
      const stackCheck = await this.checkResourceInStack(
        tableName, 
        'AWS::DynamoDB::Table', 
        stackName, 
        region
      );
      
      if (stackCheck.exists) {
        return stackCheck;
      }
    }

    // Fall back to direct AWS SDK check
    try {
      const dynamodbClient = new this.AWS_SDK.DynamoDB({ region });
      const result = await dynamodbClient.describeTable({ TableName: tableName }).promise();
      
      return {
        exists: true,
        needsCreation: false,
        resourceArn: result.Table.TableArn,
        source: 'aws',
      };
    } catch (error: any) {
      if (error.code === 'ResourceNotFoundException') {
        return {
          exists: false,
          needsCreation: true,
          source: 'aws',
        };
      }
      console.warn(`Warning: Could not check DynamoDB table ${tableName}: ${error.message}`);
      return {
        exists: false,
        needsCreation: true,
        source: 'unknown',
      };
    }
  }

  /**
   * Enhanced S3 bucket existence check
   */
  static async checkS3BucketExists(
    bucketName: string, 
    region: string, 
    stackName?: string
  ): Promise<ResourceExistenceCheck> {
    // First check in CloudFormation stack if stack name is provided
    if (stackName) {
      const stackCheck = await this.checkResourceInStack(
        bucketName, 
        'AWS::S3::Bucket', 
        stackName, 
        region
      );
      
      if (stackCheck.exists) {
        return stackCheck;
      }
    }

    // Fall back to direct AWS SDK check
    try {
      const s3Client = new this.AWS_SDK.S3({ region });
      await s3Client.headBucket({ Bucket: bucketName }).promise();
      
      return {
        exists: true,
        needsCreation: false,
        resourceArn: `arn:aws:s3:::${bucketName}`,
        source: 'aws',
      };
    } catch (error: any) {
      if (error.statusCode === 404 || error.code === 'NoSuchBucket') {
        return {
          exists: false,
          needsCreation: true,
          source: 'aws',
        };
      }
      console.warn(`Warning: Could not check S3 bucket ${bucketName}: ${error.message}`);
      return {
        exists: false,
        needsCreation: true,
        source: 'unknown',
      };
    }
  }

  /**
   * Enhanced SQS queue existence check
   */
  static async checkSQSQueueExists(
    queueName: string, 
    region: string, 
    stackName?: string
  ): Promise<ResourceExistenceCheck> {
    // First check in CloudFormation stack if stack name is provided
    if (stackName) {
      const stackCheck = await this.checkResourceInStack(
        queueName, 
        'AWS::SQS::Queue', 
        stackName, 
        region
      );
      
      if (stackCheck.exists) {
        return stackCheck;
      }
    }

    // Fall back to direct AWS SDK check
    try {
      const sqsClient = new this.AWS_SDK.SQS({ region });
      const result = await sqsClient.getQueueUrl({ QueueName: queueName }).promise();
      
      // Get queue attributes to get the ARN
      const attributes = await sqsClient.getQueueAttributes({
        QueueUrl: result.QueueUrl,
        AttributeNames: ['QueueArn']
      }).promise();
      
      return {
        exists: true,
        needsCreation: false,
        resourceArn: attributes.Attributes.QueueArn,
        source: 'aws',
      };
    } catch (error: any) {
      if (error.code === 'AWS.SimpleQueueService.NonExistentQueue') {
        return {
          exists: false,
          needsCreation: true,
          source: 'aws',
        };
      }
      console.warn(`Warning: Could not check SQS queue ${queueName}: ${error.message}`);
      return {
        exists: false,
        needsCreation: true,
        source: 'unknown',
      };
    }
  }

  /**
   * Comprehensive resource checking that combines all sources
   */
  static async checkSharedResourcesComprehensive(
    stage: string, 
    region: string, 
    account: string,
    stackName?: string
  ): Promise<{
    dynamoDBTables: { [key: string]: ResourceExistenceCheck };
    s3Buckets: { [key: string]: ResourceExistenceCheck };
    sqsQueues: { [key: string]: ResourceExistenceCheck };
  }> {
    const getResourceName = (name: string) => `${stage}-${name}`;

    // Define all shared resources
    const dynamoDBTableNames = [
      'Users',
      'Conversations', 
      'Threads',
      'Organizations',
      'RateLimiting'
    ];

    const s3BucketNames = [
      'storage',
      'email-attachments'
    ];

    const sqsQueueNames = [
      'EmailProcessQueue',
      'EmailProcessDLQ'
    ];

    console.log(`🔍 Comprehensive resource checking for ${stage} environment`);
    console.log(`   Region: ${region}`);
    console.log(`   Account: ${account}`);
    if (stackName) {
      console.log(`   Stack: ${stackName}`);
    }

    // Check DynamoDB tables
    const dynamoDBTables: { [key: string]: ResourceExistenceCheck } = {};
    for (const tableName of dynamoDBTableNames) {
      const fullTableName = getResourceName(tableName);
      console.log(`   🔍 Checking DynamoDB table: ${fullTableName}`);
      dynamoDBTables[tableName] = await this.checkDynamoDBTableExists(fullTableName, region, stackName);
    }

    // Check S3 buckets
    const s3Buckets: { [key: string]: ResourceExistenceCheck } = {};
    for (const bucketName of s3BucketNames) {
      const fullBucketName = getResourceName(bucketName).toLowerCase();
      console.log(`   🔍 Checking S3 bucket: ${fullBucketName}`);
      s3Buckets[bucketName] = await this.checkS3BucketExists(fullBucketName, region, stackName);
    }

    // Check SQS queues
    const sqsQueues: { [key: string]: ResourceExistenceCheck } = {};
    for (const queueName of sqsQueueNames) {
      const fullQueueName = getResourceName(queueName);
      console.log(`   🔍 Checking SQS queue: ${fullQueueName}`);
      sqsQueues[queueName] = await this.checkSQSQueueExists(fullQueueName, region, stackName);
    }

    // Log summary
    this.logResourceCheckSummary(dynamoDBTables, s3Buckets, sqsQueues);

    return {
      dynamoDBTables,
      s3Buckets,
      sqsQueues,
    };
  }

  /**
   * Log a summary of resource checks
   */
  private static logResourceCheckSummary(
    dynamoDBTables: { [key: string]: ResourceExistenceCheck },
    s3Buckets: { [key: string]: ResourceExistenceCheck },
    sqsQueues: { [key: string]: ResourceExistenceCheck }
  ) {
    console.log('\n📊 Resource Check Summary:');
    
    console.log('   DynamoDB Tables:');
    Object.entries(dynamoDBTables).forEach(([name, check]) => {
      const status = check.exists ? '✅ EXISTS' : '❌ MISSING';
      const source = check.source ? ` (${check.source})` : '';
      console.log(`     ${name}: ${status}${source}`);
    });

    console.log('   S3 Buckets:');
    Object.entries(s3Buckets).forEach(([name, check]) => {
      const status = check.exists ? '✅ EXISTS' : '❌ MISSING';
      const source = check.source ? ` (${check.source})` : '';
      console.log(`     ${name}: ${status}${source}`);
    });

    console.log('   SQS Queues:');
    Object.entries(sqsQueues).forEach(([name, check]) => {
      const status = check.exists ? '✅ EXISTS' : '❌ MISSING';
      const source = check.source ? ` (${check.source})` : '';
      console.log(`     ${name}: ${status}${source}`);
    });
  }

  /**
   * Build resource ARN based on resource type and physical ID
   */
  private static buildResourceArn(resourceType: string, physicalId: string, region: string): string {
    switch (resourceType) {
      case 'AWS::DynamoDB::Table':
        return `arn:aws:dynamodb:${region}:*:table/${physicalId}`;
      case 'AWS::S3::Bucket':
        return `arn:aws:s3:::${physicalId}`;
      case 'AWS::SQS::Queue':
        return `arn:aws:sqs:${region}:*:${physicalId}`;
      default:
        return '';
    }
  }

  /**
   * Import existing DynamoDB table
   */
  static importDynamoDBTable(scope: Construct, id: string, tableName: string, region: string): dynamodb.ITable {
    return dynamodb.Table.fromTableName(scope, id, tableName);
  }

  /**
   * Import existing S3 bucket
   */
  static importS3Bucket(scope: Construct, id: string, bucketName: string): s3.IBucket {
    return s3.Bucket.fromBucketName(scope, id, bucketName);
  }

  /**
   * Import existing SQS queue
   */
  static importSQSQueue(scope: Construct, id: string, queueName: string, region: string): sqs.IQueue {
    const stack = cdk.Stack.of(scope);
    const queueArn = `arn:aws:sqs:${region}:${stack.account}:${queueName}`;
    
    return sqs.Queue.fromQueueAttributes(scope, id, {
      queueName: queueName,
      queueArn: queueArn,
    });
  }
} 