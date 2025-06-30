import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { ResourceExistenceCheck } from './resource-checker';
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
export declare const SHARED_RESOURCE_CONFIGS: {
    [key: string]: SharedResourceConfig;
};
export declare function getResourceConfig(stage: string, region: string): SharedResourceConfig | undefined;
export declare function shouldCreateResource(resourceType: 'dynamoDBTables' | 's3Buckets' | 'sqsQueues', resourceName: string, stage: string, region: string): boolean;
export declare function getExistingResources(stage: string, region: string): {
    dynamoDBTables?: string[];
    s3Buckets?: string[];
    sqsQueues?: string[];
} | undefined;
export declare class ResourceConfigChecker {
    /**
     * Check if shared resources exist based on configuration and AWS SDK calls
     */
    static checkSharedResources(config: SharedResourceConfig): Promise<{
        dynamoDBTables: {
            [key: string]: ResourceExistenceCheck;
        };
        s3Buckets: {
            [key: string]: ResourceExistenceCheck;
        };
        sqsQueues: {
            [key: string]: ResourceExistenceCheck;
        };
    }>;
    /**
     * Enhanced resource checking that combines configuration and AWS SDK checks
     */
    static checkResourcesWithAWS(stage: string, region: string): Promise<{
        dynamoDBTables: {
            [key: string]: ResourceExistenceCheck;
        };
        s3Buckets: {
            [key: string]: ResourceExistenceCheck;
        };
        sqsQueues: {
            [key: string]: ResourceExistenceCheck;
        };
    }>;
    /**
     * Import existing DynamoDB table
     */
    static importDynamoDBTable(scope: Construct, id: string, tableName: string): dynamodb.ITable;
    /**
     * Import existing S3 bucket
     */
    static importS3Bucket(scope: Construct, id: string, bucketName: string): s3.IBucket;
    /**
     * Import existing SQS queue
     */
    static importSQSQueue(scope: Construct, id: string, queueName: string, region: string): sqs.IQueue;
    /**
     * Get existing resources from environment variables or configuration
     */
    static getExistingResourcesFromEnv(stage: string): {
        dynamoDBTables?: string[];
        s3Buckets?: string[];
        sqsQueues?: string[];
    };
    /**
     * Auto-detect existing resources by checking common patterns
     */
    static getAutoDetectedResources(stage: string, region: string): {
        dynamoDBTables?: string[];
        s3Buckets?: string[];
        sqsQueues?: string[];
    };
}
