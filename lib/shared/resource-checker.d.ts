import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
export interface ResourceExistenceCheck {
    exists: boolean;
    needsCreation: boolean;
    resourceArn?: string;
}
export declare class ResourceChecker {
    private static readonly AWS_SDK;
    /**
     * Check if a DynamoDB table exists
     */
    static checkDynamoDBTableExists(tableName: string, region: string): Promise<ResourceExistenceCheck>;
    /**
     * Check if an S3 bucket exists
     */
    static checkS3BucketExists(bucketName: string, region: string): Promise<ResourceExistenceCheck>;
    /**
     * Check if an SQS queue exists
     */
    static checkSQSQueueExists(queueName: string, region: string): Promise<ResourceExistenceCheck>;
    /**
     * Import existing DynamoDB table
     */
    static importDynamoDBTable(scope: Construct, id: string, tableName: string, region: string): dynamodb.ITable;
    /**
     * Import existing S3 bucket
     */
    static importS3Bucket(scope: Construct, id: string, bucketName: string): s3.IBucket;
    /**
     * Import existing SQS queue
     */
    static importSQSQueue(scope: Construct, id: string, queueName: string, region: string): sqs.IQueue;
    /**
     * Check if resources exist and determine creation strategy
     */
    static checkSharedResources(stage: string, region: string): Promise<{
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
}
