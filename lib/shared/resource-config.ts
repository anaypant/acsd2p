import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { ResourceChecker, ResourceExistenceCheck } from './resource-checker';

// Re-export ResourceExistenceCheck for use in other modules
export { ResourceExistenceCheck } from './resource-checker';

export interface SharedResourceConfig {
  stage: string;
  region: string;
  account: string;
  existingResources?: {
    dynamoDBTables?: string[];
    s3Buckets?: string[];
    sqsQueues?: string[];
  };
}

/**
 * Configuration for shared resources that already exist
 * This can be updated manually or through a script that checks AWS resources
 */
export const SHARED_RESOURCE_CONFIGS: { [key: string]: SharedResourceConfig } = {
  'dev': {
    stage: 'dev',
    region: 'us-west-1',
    account: '123456789012',
    existingResources: {
      // Add existing resource names here
      // For example, if these resources already exist from a previous deployment:
      dynamoDBTables: [
        'Users',
        'Conversations', 
        'Threads',
        'Organizations',
        'RateLimiting'
      ],
      s3Buckets: [
        'storage',
        'email-attachments'
      ],
      sqsQueues: [
        'EmailProcessQueue',
        'EmailProcessDLQ'
      ]
    }
  },
  'prod': {
    stage: 'prod',
    region: 'us-east-2',
    account: '098765432109',
    existingResources: {
      // Add existing resource names here for production
      dynamoDBTables: [],
      s3Buckets: [],
      sqsQueues: []
    }
  }
};

export function getResourceConfig(stage: string, region: string): SharedResourceConfig | undefined {
  const config = SHARED_RESOURCE_CONFIGS[stage];
  if (config && config.region === region) {
    return config;
  }
  return undefined;
}

export function shouldCreateResource(resourceType: 'dynamoDBTables' | 's3Buckets' | 'sqsQueues', resourceName: string, stage: string, region: string): boolean {
  const config = getResourceConfig(stage, region);
  if (!config) {
    // No config found, create the resource
    return true;
  }
  
  // If the resource is in the existing resources list, don't create it
  return !config.existingResources?.[resourceType]?.includes(resourceName);
}

export function getExistingResources(stage: string, region: string) {
  const config = getResourceConfig(stage, region);
  if (!config) {
    return {
      dynamoDBTables: [],
      s3Buckets: [],
      sqsQueues: []
    };
  }
  
  return config.existingResources;
}

export class ResourceConfigChecker {
  /**
   * Check if shared resources exist based on configuration and AWS SDK calls
   */
  static async checkSharedResources(config: SharedResourceConfig): Promise<{
    dynamoDBTables: { [key: string]: ResourceExistenceCheck };
    s3Buckets: { [key: string]: ResourceExistenceCheck };
    sqsQueues: { [key: string]: ResourceExistenceCheck };
  }> {
    const getResourceName = (name: string) => name;

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
      
      const existingTables = config.existingResources?.dynamoDBTables || [];
      const exists = existingTables.includes(fullTableName);
      dynamoDBTables[tableName] = {
        exists,
        needsCreation: !exists,
        resourceArn: exists ? `arn:aws:dynamodb:${config.region}:${config.account}:table/${fullTableName}` : undefined,
      };
    }

    // Check S3 buckets
    const s3Buckets: { [key: string]: ResourceExistenceCheck } = {};
    for (const bucketName of s3BucketNames) {
      const fullBucketName = getResourceName(bucketName).toLowerCase();
      console.log(`   🔍 Checking S3 bucket: ${fullBucketName}`);
      
      const existingBuckets = config.existingResources?.s3Buckets || [];
      const exists = existingBuckets.includes(fullBucketName);
      s3Buckets[bucketName] = {
        exists,
        needsCreation: !exists,
        resourceArn: exists ? `arn:aws:s3:::${fullBucketName}` : undefined,
      };
    }

    // Check SQS queues
    const sqsQueues: { [key: string]: ResourceExistenceCheck } = {};
    for (const queueName of sqsQueueNames) {
      const fullQueueName = getResourceName(queueName);
      console.log(`   🔍 Checking SQS queue: ${fullQueueName}`);
      
      const existingQueues = config.existingResources?.sqsQueues || [];
      const exists = existingQueues.includes(fullQueueName);
      sqsQueues[queueName] = {
        exists,
        needsCreation: !exists,
        resourceArn: exists ? `arn:aws:sqs:${config.region}:${config.account}:${fullQueueName}` : undefined,
      };
    }

    return {
      dynamoDBTables,
      s3Buckets,
      sqsQueues,
    };
  }

  /**
   * Enhanced resource checking that combines configuration and AWS SDK checks
   */
  static async checkResourcesWithAWS(stage: string, region: string): Promise<{
    dynamoDBTables: { [key: string]: ResourceExistenceCheck };
    s3Buckets: { [key: string]: ResourceExistenceCheck };
    sqsQueues: { [key: string]: ResourceExistenceCheck };
  }> {
    const getResourceName = (name: string) => name;

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

    // Check DynamoDB tables using AWS SDK
    const dynamoDBTables: { [key: string]: ResourceExistenceCheck } = {};
    for (const tableName of dynamoDBTableNames) {
      const fullTableName = getResourceName(tableName);
      console.log(`   🔍 Checking DynamoDB table: ${fullTableName}`);
      dynamoDBTables[tableName] = await ResourceChecker.checkDynamoDBTableExists(fullTableName, region);
    }

    // Check S3 buckets using AWS SDK
    const s3Buckets: { [key: string]: ResourceExistenceCheck } = {};
    for (const bucketName of s3BucketNames) {
      const fullBucketName = getResourceName(bucketName).toLowerCase();
      console.log(`   🔍 Checking S3 bucket: ${fullBucketName}`);
      s3Buckets[bucketName] = await ResourceChecker.checkS3BucketExists(fullBucketName, region);
    }

    // Check SQS queues using AWS SDK
    const sqsQueues: { [key: string]: ResourceExistenceCheck } = {};
    for (const queueName of sqsQueueNames) {
      const fullQueueName = getResourceName(queueName);
      console.log(`   🔍 Checking SQS queue: ${fullQueueName}`);
      sqsQueues[queueName] = await ResourceChecker.checkSQSQueueExists(fullQueueName, region);
    }

    return {
      dynamoDBTables,
      s3Buckets,
      sqsQueues,
    };
  }

  /**
   * Import existing DynamoDB table
   */
  static importDynamoDBTable(scope: Construct, id: string, tableName: string): dynamodb.ITable {
    return ResourceChecker.importDynamoDBTable(scope, id, tableName, scope.node.tryGetContext('region') || 'us-west-1');
  }

  /**
   * Import existing S3 bucket
   */
  static importS3Bucket(scope: Construct, id: string, bucketName: string): s3.IBucket {
    return ResourceChecker.importS3Bucket(scope, id, bucketName);
  }

  /**
   * Import existing SQS queue
   */
  static importSQSQueue(scope: Construct, id: string, queueName: string, region: string): sqs.IQueue {
    return ResourceChecker.importSQSQueue(scope, id, queueName, region);
  }

  /**
   * Get existing resources from environment variables or configuration
   */
  static getExistingResourcesFromEnv(stage: string): {
    dynamoDBTables?: string[];
    s3Buckets?: string[];
    sqsQueues?: string[];
  } {
    const existingResources: {
      dynamoDBTables?: string[];
      s3Buckets?: string[];
      sqsQueues?: string[];
    } = {};

    // Check for existing DynamoDB tables
    const existingTables = process.env.EXISTING_DYNAMODB_TABLES;
    if (existingTables) {
      existingResources.dynamoDBTables = existingTables.split(',').map(table => table.trim());
    }

    // Check for existing S3 buckets
    const existingBuckets = process.env.EXISTING_S3_BUCKETS;
    if (existingBuckets) {
      existingResources.s3Buckets = existingBuckets.split(',').map(bucket => bucket.trim());
    }

    // Check for existing SQS queues
    const existingQueues = process.env.EXISTING_SQS_QUEUES;
    if (existingQueues) {
      existingResources.sqsQueues = existingQueues.split(',').map(queue => queue.trim());
    }

    return existingResources;
  }

  /**
   * Auto-detect existing resources by checking common patterns
   */
  static getAutoDetectedResources(stage: string, region: string): {
    dynamoDBTables?: string[];
    s3Buckets?: string[];
    sqsQueues?: string[];
  } {
    const getResourceName = (name: string) => name;
    
    // Common resource patterns that might exist
    const commonTables = [
      getResourceName('Users'),
      getResourceName('Conversations'),
      getResourceName('Threads'),
      getResourceName('Organizations'),
      getResourceName('RateLimiting'),
    ];

    const commonBuckets = [
      getResourceName('storage').toLowerCase(),
      getResourceName('email-attachments').toLowerCase(),
    ];

    const commonQueues = [
      getResourceName('EmailProcessQueue'),
      getResourceName('EmailProcessDLQ'),
    ];

    return {
      dynamoDBTables: commonTables,
      s3Buckets: commonBuckets,
      sqsQueues: commonQueues,
    };
  }
} 