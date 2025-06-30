import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

export interface ResourceExistenceCheck {
  exists: boolean;
  needsCreation: boolean;
  resourceArn?: string;
}

export class ResourceChecker {
  private static readonly AWS_SDK = require('aws-sdk');

  /**
   * Check if a DynamoDB table exists
   */
  static async checkDynamoDBTableExists(tableName: string, region: string): Promise<ResourceExistenceCheck> {
    try {
      const dynamodbClient = new this.AWS_SDK.DynamoDB({ region });
      const result = await dynamodbClient.describeTable({ TableName: tableName }).promise();
      
      return {
        exists: true,
        needsCreation: false,
        resourceArn: result.Table.TableArn,
      };
    } catch (error: any) {
      if (error.code === 'ResourceNotFoundException') {
        return {
          exists: false,
          needsCreation: true,
        };
      }
      // For other errors, assume we need to create the resource
      console.warn(`Warning: Could not check DynamoDB table ${tableName}: ${error.message}`);
      return {
        exists: false,
        needsCreation: true,
      };
    }
  }

  /**
   * Check if an S3 bucket exists
   */
  static async checkS3BucketExists(bucketName: string, region: string): Promise<ResourceExistenceCheck> {
    try {
      const s3Client = new this.AWS_SDK.S3({ region });
      await s3Client.headBucket({ Bucket: bucketName }).promise();
      
      return {
        exists: true,
        needsCreation: false,
        resourceArn: `arn:aws:s3:::${bucketName}`,
      };
    } catch (error: any) {
      if (error.statusCode === 404 || error.code === 'NoSuchBucket') {
        return {
          exists: false,
          needsCreation: true,
        };
      }
      // For other errors, assume we need to create the resource
      console.warn(`Warning: Could not check S3 bucket ${bucketName}: ${error.message}`);
      return {
        exists: false,
        needsCreation: true,
      };
    }
  }

  /**
   * Check if an SQS queue exists
   */
  static async checkSQSQueueExists(queueName: string, region: string): Promise<ResourceExistenceCheck> {
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
      };
    } catch (error: any) {
      if (error.code === 'AWS.SimpleQueueService.NonExistentQueue') {
        return {
          exists: false,
          needsCreation: true,
        };
      }
      // For other errors, assume we need to create the resource
      console.warn(`Warning: Could not check SQS queue ${queueName}: ${error.message}`);
      return {
        exists: false,
        needsCreation: true,
      };
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
    // For SQS, we'll need to get the ARN from the resource checker
    // This is a simplified approach - in practice, you might want to store ARNs in a config file
    const stack = cdk.Stack.of(scope);
    const queueArn = `arn:aws:sqs:${region}:${stack.account}:${queueName}`;
    
    return sqs.Queue.fromQueueAttributes(scope, id, {
      queueName: queueName,
      queueArn: queueArn,
    });
  }

  /**
   * Check if resources exist and determine creation strategy
   */
  static async checkSharedResources(stage: string, region: string): Promise<{
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

    // Check DynamoDB tables
    const dynamoDBTables: { [key: string]: ResourceExistenceCheck } = {};
    for (const tableName of dynamoDBTableNames) {
      const fullTableName = getResourceName(tableName);
      console.log(`   🔍 Checking DynamoDB table: ${fullTableName}`);
      dynamoDBTables[tableName] = await this.checkDynamoDBTableExists(fullTableName, region);
    }

    // Check S3 buckets
    const s3Buckets: { [key: string]: ResourceExistenceCheck } = {};
    for (const bucketName of s3BucketNames) {
      const fullBucketName = getResourceName(bucketName).toLowerCase();
      console.log(`   🔍 Checking S3 bucket: ${fullBucketName}`);
      s3Buckets[bucketName] = await this.checkS3BucketExists(fullBucketName, region);
    }

    // Check SQS queues
    const sqsQueues: { [key: string]: ResourceExistenceCheck } = {};
    for (const queueName of sqsQueueNames) {
      const fullQueueName = getResourceName(queueName);
      console.log(`   🔍 Checking SQS queue: ${fullQueueName}`);
      sqsQueues[queueName] = await this.checkSQSQueueExists(fullQueueName, region);
    }

    return {
      dynamoDBTables,
      s3Buckets,
      sqsQueues,
    };
  }
} 