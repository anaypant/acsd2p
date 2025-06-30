"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResourceChecker = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const sqs = __importStar(require("aws-cdk-lib/aws-sqs"));
class ResourceChecker {
    static AWS_SDK = require('aws-sdk');
    /**
     * Check if a DynamoDB table exists
     */
    static async checkDynamoDBTableExists(tableName, region) {
        try {
            const dynamodbClient = new this.AWS_SDK.DynamoDB({ region });
            const result = await dynamodbClient.describeTable({ TableName: tableName }).promise();
            return {
                exists: true,
                needsCreation: false,
                resourceArn: result.Table.TableArn,
            };
        }
        catch (error) {
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
    static async checkS3BucketExists(bucketName, region) {
        try {
            const s3Client = new this.AWS_SDK.S3({ region });
            await s3Client.headBucket({ Bucket: bucketName }).promise();
            return {
                exists: true,
                needsCreation: false,
                resourceArn: `arn:aws:s3:::${bucketName}`,
            };
        }
        catch (error) {
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
    static async checkSQSQueueExists(queueName, region) {
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
        }
        catch (error) {
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
    static importDynamoDBTable(scope, id, tableName, region) {
        return dynamodb.Table.fromTableName(scope, id, tableName);
    }
    /**
     * Import existing S3 bucket
     */
    static importS3Bucket(scope, id, bucketName) {
        return s3.Bucket.fromBucketName(scope, id, bucketName);
    }
    /**
     * Import existing SQS queue
     */
    static importSQSQueue(scope, id, queueName, region) {
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
    static async checkSharedResources(stage, region) {
        const getResourceName = (name) => `${stage}-${name}`;
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
        const dynamoDBTables = {};
        for (const tableName of dynamoDBTableNames) {
            const fullTableName = getResourceName(tableName);
            console.log(`   🔍 Checking DynamoDB table: ${fullTableName}`);
            dynamoDBTables[tableName] = await this.checkDynamoDBTableExists(fullTableName, region);
        }
        // Check S3 buckets
        const s3Buckets = {};
        for (const bucketName of s3BucketNames) {
            const fullBucketName = getResourceName(bucketName).toLowerCase();
            console.log(`   🔍 Checking S3 bucket: ${fullBucketName}`);
            s3Buckets[bucketName] = await this.checkS3BucketExists(fullBucketName, region);
        }
        // Check SQS queues
        const sqsQueues = {};
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
exports.ResourceChecker = ResourceChecker;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVzb3VyY2UtY2hlY2tlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInJlc291cmNlLWNoZWNrZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsbUVBQXFEO0FBQ3JELHVEQUF5QztBQUN6Qyx5REFBMkM7QUFTM0MsTUFBYSxlQUFlO0lBQ2xCLE1BQU0sQ0FBVSxPQUFPLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBRXJEOztPQUVHO0lBQ0gsTUFBTSxDQUFDLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxTQUFpQixFQUFFLE1BQWM7UUFDckUsSUFBSSxDQUFDO1lBQ0gsTUFBTSxjQUFjLEdBQUcsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7WUFDN0QsTUFBTSxNQUFNLEdBQUcsTUFBTSxjQUFjLENBQUMsYUFBYSxDQUFDLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUM7WUFFdEYsT0FBTztnQkFDTCxNQUFNLEVBQUUsSUFBSTtnQkFDWixhQUFhLEVBQUUsS0FBSztnQkFDcEIsV0FBVyxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsUUFBUTthQUNuQyxDQUFDO1FBQ0osQ0FBQztRQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7WUFDcEIsSUFBSSxLQUFLLENBQUMsSUFBSSxLQUFLLDJCQUEyQixFQUFFLENBQUM7Z0JBQy9DLE9BQU87b0JBQ0wsTUFBTSxFQUFFLEtBQUs7b0JBQ2IsYUFBYSxFQUFFLElBQUk7aUJBQ3BCLENBQUM7WUFDSixDQUFDO1lBQ0QsMERBQTBEO1lBQzFELE9BQU8sQ0FBQyxJQUFJLENBQUMsMkNBQTJDLFNBQVMsS0FBSyxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztZQUN2RixPQUFPO2dCQUNMLE1BQU0sRUFBRSxLQUFLO2dC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aW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcclxuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcclxuaW1wb3J0ICogYXMgc3FzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zcXMnO1xyXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgUmVzb3VyY2VFeGlzdGVuY2VDaGVjayB7XHJcbiAgZXhpc3RzOiBib29sZWFuO1xyXG4gIG5lZWRzQ3JlYXRpb246IGJvb2xlYW47XHJcbiAgcmVzb3VyY2VBcm4/OiBzdHJpbmc7XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBSZXNvdXJjZUNoZWNrZXIge1xyXG4gIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEFXU19TREsgPSByZXF1aXJlKCdhd3Mtc2RrJyk7XHJcblxyXG4gIC8qKlxyXG4gICAqIENoZWNrIGlmIGEgRHluYW1vREIgdGFibGUgZXhpc3RzXHJcbiAgICovXHJcbiAgc3RhdGljIGFzeW5jIGNoZWNrRHluYW1vREJUYWJsZUV4aXN0cyh0YWJsZU5hbWU6IHN0cmluZywgcmVnaW9uOiBzdHJpbmcpOiBQcm9taXNlPFJlc291cmNlRXhpc3RlbmNlQ2hlY2s+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IGR5bmFtb2RiQ2xpZW50ID0gbmV3IHRoaXMuQVdTX1NESy5EeW5hbW9EQih7IHJlZ2lvbiB9KTtcclxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZHluYW1vZGJDbGllbnQuZGVzY3JpYmVUYWJsZSh7IFRhYmxlTmFtZTogdGFibGVOYW1lIH0pLnByb21pc2UoKTtcclxuICAgICAgXHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgZXhpc3RzOiB0cnVlLFxyXG4gICAgICAgIG5lZWRzQ3JlYXRpb246IGZhbHNlLFxyXG4gICAgICAgIHJlc291cmNlQXJuOiByZXN1bHQuVGFibGUuVGFibGVBcm4sXHJcbiAgICAgIH07XHJcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XHJcbiAgICAgIGlmIChlcnJvci5jb2RlID09PSAnUmVzb3VyY2VOb3RGb3VuZEV4Y2VwdGlvbicpIHtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgZXhpc3RzOiBmYWxzZSxcclxuICAgICAgICAgIG5lZWRzQ3JlYXRpb246IHRydWUsXHJcbiAgICAgICAgfTtcclxuICAgICAgfVxyXG4gICAgICAvLyBGb3Igb3RoZXIgZXJyb3JzLCBhc3N1bWUgd2UgbmVlZCB0byBjcmVhdGUgdGhlIHJlc291cmNlXHJcbiAgICAgIGNvbnNvbGUud2FybihgV2FybmluZzogQ291bGQgbm90IGNoZWNrIER5bmFtb0RCIHRhYmxlICR7dGFibGVOYW1lfTogJHtlcnJvci5tZXNzYWdlfWApO1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIGV4aXN0czogZmFsc2UsXHJcbiAgICAgICAgbmVlZHNDcmVhdGlvbjogdHJ1ZSxcclxuICAgICAgfTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENoZWNrIGlmIGFuIFMzIGJ1Y2tldCBleGlzdHNcclxuICAgKi9cclxuICBzdGF0aWMgYXN5bmMgY2hlY2tTM0J1Y2tldEV4aXN0cyhidWNrZXROYW1lOiBzdHJpbmcsIHJlZ2lvbjogc3RyaW5nKTogUHJvbWlzZTxSZXNvdXJjZUV4aXN0ZW5jZUNoZWNrPiB7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBzM0NsaWVudCA9IG5ldyB0aGlzLkFXU19TREsuUzMoeyByZWdpb24gfSk7XHJcbiAgICAgIGF3YWl0IHMzQ2xpZW50LmhlYWRCdWNrZXQoeyBCdWNrZXQ6IGJ1Y2tldE5hbWUgfSkucHJvbWlzZSgpO1xyXG4gICAgICBcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBleGlzdHM6IHRydWUsXHJcbiAgICAgICAgbmVlZHNDcmVhdGlvbjogZmFsc2UsXHJcbiAgICAgICAgcmVzb3VyY2VBcm46IGBhcm46YXdzOnMzOjo6JHtidWNrZXROYW1lfWAsXHJcbiAgICAgIH07XHJcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XHJcbiAgICAgIGlmIChlcnJvci5zdGF0dXNDb2RlID09PSA0MDQgfHwgZXJyb3IuY29kZSA9PT0gJ05vU3VjaEJ1Y2tldCcpIHtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgZXhpc3RzOiBmYWxzZSxcclxuICAgICAgICAgIG5lZWRzQ3JlYXRpb246IHRydWUsXHJcbiAgICAgICAgfTtcclxuICAgICAgfVxyXG4gICAgICAvLyBGb3Igb3RoZXIgZXJyb3JzLCBhc3N1bWUgd2UgbmVlZCB0byBjcmVhdGUgdGhlIHJlc291cmNlXHJcbiAgICAgIGNvbnNvbGUud2FybihgV2FybmluZzogQ291bGQgbm90IGNoZWNrIFMzIGJ1Y2tldCAke2J1Y2tldE5hbWV9OiAke2Vycm9yLm1lc3NhZ2V9YCk7XHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgZXhpc3RzOiBmYWxzZSxcclxuICAgICAgICBuZWVkc0NyZWF0aW9uOiB0cnVlLFxyXG4gICAgICB9O1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ2hlY2sgaWYgYW4gU1FTIHF1ZXVlIGV4aXN0c1xyXG4gICAqL1xyXG4gIHN0YXRpYyBhc3luYyBjaGVja1NRU1F1ZXVlRXhpc3RzKHF1ZXVlTmFtZTogc3RyaW5nLCByZWdpb246IHN0cmluZyk6IFByb21pc2U8UmVzb3VyY2VFeGlzdGVuY2VDaGVjaz4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3Qgc3FzQ2xpZW50ID0gbmV3IHRoaXMuQVdTX1NESy5TUVMoeyByZWdpb24gfSk7XHJcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNxc0NsaWVudC5nZXRRdWV1ZVVybCh7IFF1ZXVlTmFtZTogcXVldWVOYW1lIH0pLnByb21pc2UoKTtcclxuICAgICAgXHJcbiAgICAgIC8vIEdldCBxdWV1ZSBhdHRyaWJ1dGVzIHRvIGdldCB0aGUgQVJOXHJcbiAgICAgIGNvbnN0IGF0dHJpYnV0ZXMgPSBhd2FpdCBzcXNDbGllbnQuZ2V0UXVldWVBdHRyaWJ1dGVzKHtcclxuICAgICAgICBRdWV1ZVVybDogcmVzdWx0LlF1ZXVlVXJsLFxyXG4gICAgICAgIEF0dHJpYnV0ZU5hbWVzOiBbJ1F1ZXVlQXJuJ11cclxuICAgICAgfSkucHJvbWlzZSgpO1xyXG4gICAgICBcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBleGlzdHM6IHRydWUsXHJcbiAgICAgICAgbmVlZHNDcmVhdGlvbjogZmFsc2UsXHJcbiAgICAgICAgcmVzb3VyY2VBcm46IGF0dHJpYnV0ZXMuQXR0cmlidXRlcy5RdWV1ZUFybixcclxuICAgICAgfTtcclxuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcclxuICAgICAgaWYgKGVycm9yLmNvZGUgPT09ICdBV1MuU2ltcGxlUXVldWVTZXJ2aWNlLk5vbkV4aXN0ZW50UXVldWUnKSB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgIGV4aXN0czogZmFsc2UsXHJcbiAgICAgICAgICBuZWVkc0NyZWF0aW9uOiB0cnVlLFxyXG4gICAgICAgIH07XHJcbiAgICAgIH1cclxuICAgICAgLy8gRm9yIG90aGVyIGVycm9ycywgYXNzdW1lIHdlIG5lZWQgdG8gY3JlYXRlIHRoZSByZXNvdXJjZVxyXG4gICAgICBjb25zb2xlLndhcm4oYFdhcm5pbmc6IENvdWxkIG5vdCBjaGVjayBTUVMgcXVldWUgJHtxdWV1ZU5hbWV9OiAke2Vycm9yLm1lc3NhZ2V9YCk7XHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgZXhpc3RzOiBmYWxzZSxcclxuICAgICAgICBuZWVkc0NyZWF0aW9uOiB0cnVlLFxyXG4gICAgICB9O1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogSW1wb3J0IGV4aXN0aW5nIER5bmFtb0RCIHRhYmxlXHJcbiAgICovXHJcbiAgc3RhdGljIGltcG9ydER5bmFtb0RCVGFibGUoc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgdGFibGVOYW1lOiBzdHJpbmcsIHJlZ2lvbjogc3RyaW5nKTogZHluYW1vZGIuSVRhYmxlIHtcclxuICAgIHJldHVybiBkeW5hbW9kYi5UYWJsZS5mcm9tVGFibGVOYW1lKHNjb3BlLCBpZCwgdGFibGVOYW1lKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEltcG9ydCBleGlzdGluZyBTMyBidWNrZXRcclxuICAgKi9cclxuICBzdGF0aWMgaW1wb3J0UzNCdWNrZXQoc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgYnVja2V0TmFtZTogc3RyaW5nKTogczMuSUJ1Y2tldCB7XHJcbiAgICByZXR1cm4gczMuQnVja2V0LmZyb21CdWNrZXROYW1lKHNjb3BlLCBpZCwgYnVja2V0TmFtZSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBJbXBvcnQgZXhpc3RpbmcgU1FTIHF1ZXVlXHJcbiAgICovXHJcbiAgc3RhdGljIGltcG9ydFNRU1F1ZXVlKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHF1ZXVlTmFtZTogc3RyaW5nLCByZWdpb246IHN0cmluZyk6IHNxcy5JUXVldWUge1xyXG4gICAgLy8gRm9yIFNRUywgd2UnbGwgbmVlZCB0byBnZXQgdGhlIEFSTiBmcm9tIHRoZSByZXNvdXJjZSBjaGVja2VyXHJcbiAgICAvLyBUaGlzIGlzIGEgc2ltcGxpZmllZCBhcHByb2FjaCAtIGluIHByYWN0aWNlLCB5b3UgbWlnaHQgd2FudCB0byBzdG9yZSBBUk5zIGluIGEgY29uZmlnIGZpbGVcclxuICAgIGNvbnN0IHN0YWNrID0gY2RrLlN0YWNrLm9mKHNjb3BlKTtcclxuICAgIGNvbnN0IHF1ZXVlQXJuID0gYGFybjphd3M6c3FzOiR7cmVnaW9ufToke3N0YWNrLmFjY291bnR9OiR7cXVldWVOYW1lfWA7XHJcbiAgICBcclxuICAgIHJldHVybiBzcXMuUXVldWUuZnJvbVF1ZXVlQXR0cmlidXRlcyhzY29wZSwgaWQsIHtcclxuICAgICAgcXVldWVOYW1lOiBxdWV1ZU5hbWUsXHJcbiAgICAgIHF1ZXVlQXJuOiBxdWV1ZUFybixcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ2hlY2sgaWYgcmVzb3VyY2VzIGV4aXN0IGFuZCBkZXRlcm1pbmUgY3JlYXRpb24gc3RyYXRlZ3lcclxuICAgKi9cclxuICBzdGF0aWMgYXN5bmMgY2hlY2tTaGFyZWRSZXNvdXJjZXMoc3RhZ2U6IHN0cmluZywgcmVnaW9uOiBzdHJpbmcpOiBQcm9taXNlPHtcclxuICAgIGR5bmFtb0RCVGFibGVzOiB7IFtrZXk6IHN0cmluZ106IFJlc291cmNlRXhpc3RlbmNlQ2hlY2sgfTtcclxuICAgIHMzQnVja2V0czogeyBba2V5OiBzdHJpbmddOiBSZXNvdXJjZUV4aXN0ZW5jZUNoZWNrIH07XHJcbiAgICBzcXNRdWV1ZXM6IHsgW2tleTogc3RyaW5nXTogUmVzb3VyY2VFeGlzdGVuY2VDaGVjayB9O1xyXG4gIH0+IHtcclxuICAgIGNvbnN0IGdldFJlc291cmNlTmFtZSA9IChuYW1lOiBzdHJpbmcpID0+IGAke3N0YWdlfS0ke25hbWV9YDtcclxuXHJcbiAgICAvLyBEZWZpbmUgYWxsIHNoYXJlZCByZXNvdXJjZXNcclxuICAgIGNvbnN0IGR5bmFtb0RCVGFibGVOYW1lcyA9IFtcclxuICAgICAgJ1VzZXJzJyxcclxuICAgICAgJ0NvbnZlcnNhdGlvbnMnLCBcclxuICAgICAgJ1RocmVhZHMnLFxyXG4gICAgICAnT3JnYW5pemF0aW9ucycsXHJcbiAgICAgICdSYXRlTGltaXRpbmcnXHJcbiAgICBdO1xyXG5cclxuICAgIGNvbnN0IHMzQnVja2V0TmFtZXMgPSBbXHJcbiAgICAgICdzdG9yYWdlJyxcclxuICAgICAgJ2VtYWlsLWF0dGFjaG1lbnRzJ1xyXG4gICAgXTtcclxuXHJcbiAgICBjb25zdCBzcXNRdWV1ZU5hbWVzID0gW1xyXG4gICAgICAnRW1haWxQcm9jZXNzUXVldWUnLFxyXG4gICAgICAnRW1haWxQcm9jZXNzRExRJ1xyXG4gICAgXTtcclxuXHJcbiAgICAvLyBDaGVjayBEeW5hbW9EQiB0YWJsZXNcclxuICAgIGNvbnN0IGR5bmFtb0RCVGFibGVzOiB7IFtrZXk6IHN0cmluZ106IFJlc291cmNlRXhpc3RlbmNlQ2hlY2sgfSA9IHt9O1xyXG4gICAgZm9yIChjb25zdCB0YWJsZU5hbWUgb2YgZHluYW1vREJUYWJsZU5hbWVzKSB7XHJcbiAgICAgIGNvbnN0IGZ1bGxUYWJsZU5hbWUgPSBnZXRSZXNvdXJjZU5hbWUodGFibGVOYW1lKTtcclxuICAgICAgY29uc29sZS5sb2coYCAgIPCflI0gQ2hlY2tpbmcgRHluYW1vREIgdGFibGU6ICR7ZnVsbFRhYmxlTmFtZX1gKTtcclxuICAgICAgZHluYW1vREJUYWJsZXNbdGFibGVOYW1lXSA9IGF3YWl0IHRoaXMuY2hlY2tEeW5hbW9EQlRhYmxlRXhpc3RzKGZ1bGxUYWJsZU5hbWUsIHJlZ2lvbik7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ2hlY2sgUzMgYnVja2V0c1xyXG4gICAgY29uc3QgczNCdWNrZXRzOiB7IFtrZXk6IHN0cmluZ106IFJlc291cmNlRXhpc3RlbmNlQ2hlY2sgfSA9IHt9O1xyXG4gICAgZm9yIChjb25zdCBidWNrZXROYW1lIG9mIHMzQnVja2V0TmFtZXMpIHtcclxuICAgICAgY29uc3QgZnVsbEJ1Y2tldE5hbWUgPSBnZXRSZXNvdXJjZU5hbWUoYnVja2V0TmFtZSkudG9Mb3dlckNhc2UoKTtcclxuICAgICAgY29uc29sZS5sb2coYCAgIPCflI0gQ2hlY2tpbmcgUzMgYnVja2V0OiAke2Z1bGxCdWNrZXROYW1lfWApO1xyXG4gICAgICBzM0J1Y2tldHNbYnVja2V0TmFtZV0gPSBhd2FpdCB0aGlzLmNoZWNrUzNCdWNrZXRFeGlzdHMoZnVsbEJ1Y2tldE5hbWUsIHJlZ2lvbik7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ2hlY2sgU1FTIHF1ZXVlc1xyXG4gICAgY29uc3Qgc3FzUXVldWVzOiB7IFtrZXk6IHN0cmluZ106IFJlc291cmNlRXhpc3RlbmNlQ2hlY2sgfSA9IHt9O1xyXG4gICAgZm9yIChjb25zdCBxdWV1ZU5hbWUgb2Ygc3FzUXVldWVOYW1lcykge1xyXG4gICAgICBjb25zdCBmdWxsUXVldWVOYW1lID0gZ2V0UmVzb3VyY2VOYW1lKHF1ZXVlTmFtZSk7XHJcbiAgICAgIGNvbnNvbGUubG9nKGAgICDwn5SNIENoZWNraW5nIFNRUyBxdWV1ZTogJHtmdWxsUXVldWVOYW1lfWApO1xyXG4gICAgICBzcXNRdWV1ZXNbcXVldWVOYW1lXSA9IGF3YWl0IHRoaXMuY2hlY2tTUVNRdWV1ZUV4aXN0cyhmdWxsUXVldWVOYW1lLCByZWdpb24pO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgIGR5bmFtb0RCVGFibGVzLFxyXG4gICAgICBzM0J1Y2tldHMsXHJcbiAgICAgIHNxc1F1ZXVlcyxcclxuICAgIH07XHJcbiAgfVxyXG59ICJdfQ==