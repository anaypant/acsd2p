"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResourceConfigChecker = exports.SHARED_RESOURCE_CONFIGS = void 0;
exports.getResourceConfig = getResourceConfig;
exports.shouldCreateResource = shouldCreateResource;
exports.getExistingResources = getExistingResources;
const resource_checker_1 = require("./resource-checker");
/**
 * Configuration for shared resources that already exist
 * This can be updated manually or through a script that checks AWS resources
 */
exports.SHARED_RESOURCE_CONFIGS = {
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
function getResourceConfig(stage, region) {
    const config = exports.SHARED_RESOURCE_CONFIGS[stage];
    if (config && config.region === region) {
        return config;
    }
    return undefined;
}
function shouldCreateResource(resourceType, resourceName, stage, region) {
    const config = getResourceConfig(stage, region);
    if (!config) {
        // No config found, create the resource
        return true;
    }
    // If the resource is in the existing resources list, don't create it
    return !config.existingResources?.[resourceType]?.includes(resourceName);
}
function getExistingResources(stage, region) {
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
class ResourceConfigChecker {
    /**
     * Check if shared resources exist based on configuration and AWS SDK calls
     */
    static async checkSharedResources(config) {
        const getResourceName = (name) => name;
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
            const existingTables = config.existingResources?.dynamoDBTables || [];
            const exists = existingTables.includes(fullTableName);
            dynamoDBTables[tableName] = {
                exists,
                needsCreation: !exists,
                resourceArn: exists ? `arn:aws:dynamodb:${config.region}:${config.account}:table/${fullTableName}` : undefined,
            };
        }
        // Check S3 buckets
        const s3Buckets = {};
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
        const sqsQueues = {};
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
    static async checkResourcesWithAWS(stage, region) {
        const getResourceName = (name) => name;
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
        const dynamoDBTables = {};
        for (const tableName of dynamoDBTableNames) {
            const fullTableName = getResourceName(tableName);
            console.log(`   🔍 Checking DynamoDB table: ${fullTableName}`);
            dynamoDBTables[tableName] = await resource_checker_1.ResourceChecker.checkDynamoDBTableExists(fullTableName, region);
        }
        // Check S3 buckets using AWS SDK
        const s3Buckets = {};
        for (const bucketName of s3BucketNames) {
            const fullBucketName = getResourceName(bucketName).toLowerCase();
            console.log(`   🔍 Checking S3 bucket: ${fullBucketName}`);
            s3Buckets[bucketName] = await resource_checker_1.ResourceChecker.checkS3BucketExists(fullBucketName, region);
        }
        // Check SQS queues using AWS SDK
        const sqsQueues = {};
        for (const queueName of sqsQueueNames) {
            const fullQueueName = getResourceName(queueName);
            console.log(`   🔍 Checking SQS queue: ${fullQueueName}`);
            sqsQueues[queueName] = await resource_checker_1.ResourceChecker.checkSQSQueueExists(fullQueueName, region);
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
    static importDynamoDBTable(scope, id, tableName) {
        return resource_checker_1.ResourceChecker.importDynamoDBTable(scope, id, tableName, scope.node.tryGetContext('region') || 'us-west-1');
    }
    /**
     * Import existing S3 bucket
     */
    static importS3Bucket(scope, id, bucketName) {
        return resource_checker_1.ResourceChecker.importS3Bucket(scope, id, bucketName);
    }
    /**
     * Import existing SQS queue
     */
    static importSQSQueue(scope, id, queueName, region) {
        return resource_checker_1.ResourceChecker.importSQSQueue(scope, id, queueName, region);
    }
    /**
     * Get existing resources from environment variables or configuration
     */
    static getExistingResourcesFromEnv(stage) {
        const existingResources = {};
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
    static getAutoDetectedResources(stage, region) {
        const getResourceName = (name) => name;
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
exports.ResourceConfigChecker = ResourceConfigChecker;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVzb3VyY2UtY29uZmlnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicmVzb3VyY2UtY29uZmlnLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQStEQSw4Q0FNQztBQUVELG9EQVNDO0FBRUQsb0RBV0M7QUF4RkQseURBQTZFO0FBZ0I3RTs7O0dBR0c7QUFDVSxRQUFBLHVCQUF1QixHQUE0QztJQUM5RSxLQUFLLEVBQUU7UUFDTCxLQUFLLEVBQUUsS0FBSztRQUNaLE1BQU0sRUFBRSxXQUFXO1FBQ25CLE9BQU8sRUFBRSxjQUFjO1FBQ3ZCLGlCQUFpQixFQUFFO1lBQ2pCLG1DQUFtQztZQUNuQyw0RUFBNEU7WUFDNUUsY0FBYyxFQUFFO2dCQUNkLE9BQU87Z0JBQ1AsZUFBZTtnQkFDZixTQUFTO2dCQUNULGVBQWU7Z0JBQ2YsY0FBYzthQUNmO1lBQ0QsU0FBUyxFQUFFO2dCQUNULFNBQVM7Z0JBQ1QsbUJBQW1CO2FBQ3BCO1lBQ0QsU0FBUyxFQUFFO2dCQUNULG1CQUFtQjtnQkFDbkIsaUJBQWlCO2FBQ2xCO1NBQ0Y7S0FDRjtJQUNELE1BQU0sRUFBRTtRQUNOLEtBQUssRUFBRSxNQUFNO1FBQ2IsTUFBTSxFQUFFLFdBQVc7UUFDbkIsT0FBTyxFQUFFLGNBQWM7UUFDdkIsaUJBQWlCLEVBQUU7WUFDakIsa0RBQWtEO1lBQ2xELGNBQWMsRUFBRSxFQUFFO1lBQ2xCLFNBQVMsRUFBRSxFQUFFO1lBQ2IsU0FBUyxFQUFFLEVBQUU7U0FDZDtLQUNGO0NBQ0YsQ0FBQztBQUVGLFNBQWdCLGlCQUFpQixDQUFDLEtBQWEsRUFBRSxNQUFjO0lBQzdELE1BQU0sTUFBTSxHQUFHLCtCQUF1QixDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzlDLElBQUksTUFBTSxJQUFJLE1BQU0sQ0FBQyxNQUFNLEtBQUssTUFBTSxFQUFFLENBQUM7UUFDdkMsT0FBTyxNQUFNLENBQUM7SUFDaEIsQ0FBQztJQUNELE9BQU8sU0FBUyxDQUFDO0FBQ25CLENBQUM7QUFFRCxT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QWUsQ0FBQyxtQkFBbUIsQ0FBQztZQUNwQyxlQUFlLENBQUMsaUJBQWlCLENBQUM7U0FDbkMsQ0FBQztRQUVGLE9BQU87WUFDTCxjQUFjLEVBQUUsWUFBWTtZQUM1QixTQUFTLEVBQUUsYUFBYTtZQUN4QixTQUFTLEVBQUUsWUFBWTtTQUN4QixDQUFDO0lBQ0osQ0FBQztDQUNGO0FBek9ELHNEQXlPQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XHJcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XHJcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XHJcbmltcG9ydCAqIGFzIHNxcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3FzJztcclxuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XHJcbmltcG9ydCB7IFJlc291cmNlQ2hlY2tlciwgUmVzb3VyY2VFeGlzdGVuY2VDaGVjayB9IGZyb20gJy4vcmVzb3VyY2UtY2hlY2tlcic7XHJcblxyXG4vLyBSZS1leHBvcnQgUmVzb3VyY2VFeGlzdGVuY2VDaGVjayBmb3IgdXNlIGluIG90aGVyIG1vZHVsZXNcclxuZXhwb3J0IHsgUmVzb3VyY2VFeGlzdGVuY2VDaGVjayB9IGZyb20gJy4vcmVzb3VyY2UtY2hlY2tlcic7XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFNoYXJlZFJlc291cmNlQ29uZmlnIHtcclxuICBzdGFnZTogc3RyaW5nO1xyXG4gIHJlZ2lvbjogc3RyaW5nO1xyXG4gIGFjY291bnQ6IHN0cmluZztcclxuICBleGlzdGluZ1Jlc291cmNlcz86IHtcclxuICAgIGR5bmFtb0RCVGFibGVzPzogc3RyaW5nW107XHJcbiAgICBzM0J1Y2tldHM/OiBzdHJpbmdbXTtcclxuICAgIHNxc1F1ZXVlcz86IHN0cmluZ1tdO1xyXG4gIH07XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb25maWd1cmF0aW9uIGZvciBzaGFyZWQgcmVzb3VyY2VzIHRoYXQgYWxyZWFkeSBleGlzdFxyXG4gKiBUaGlzIGNhbiBiZSB1cGRhdGVkIG1hbnVhbGx5IG9yIHRocm91Z2ggYSBzY3JpcHQgdGhhdCBjaGVja3MgQVdTIHJlc291cmNlc1xyXG4gKi9cclxuZXhwb3J0IGNvbnN0IFNIQVJFRF9SRVNPVVJDRV9DT05GSUdTOiB7IFtrZXk6IHN0cmluZ106IFNoYXJlZFJlc291cmNlQ29uZmlnIH0gPSB7XHJcbiAgJ2Rldic6IHtcclxuICAgIHN0YWdlOiAnZGV2JyxcclxuICAgIHJlZ2lvbjogJ3VzLXdlc3QtMScsXHJcbiAgICBhY2NvdW50OiAnMTIzNDU2Nzg5MDEyJyxcclxuICAgIGV4aXN0aW5nUmVzb3VyY2VzOiB7XHJcbiAgICAgIC8vIEFkZCBleGlzdGluZyByZXNvdXJjZSBuYW1lcyBoZXJlXHJcbiAgICAgIC8vIEZvciBleGFtcGxlLCBpZiB0aGVzZSByZXNvdXJjZXMgYWxyZWFkeSBleGlzdCBmcm9tIGEgcHJldmlvdXMgZGVwbG95bWVudDpcclxuICAgICAgZHluYW1vREJUYWJsZXM6IFtcclxuICAgICAgICAnVXNlcnMnLFxyXG4gICAgICAgICdDb252ZXJzYXRpb25zJywgXHJcbiAgICAgICAgJ1RocmVhZHMnLFxyXG4gICAgICAgICdPcmdhbml6YXRpb25zJyxcclxuICAgICAgICAnUmF0ZUxpbWl0aW5nJ1xyXG4gICAgICBdLFxyXG4gICAgICBzM0J1Y2tldHM6IFtcclxuICAgICAgICAnc3RvcmFnZScsXHJcbiAgICAgICAgJ2VtYWlsLWF0dGFjaG1lbnRzJ1xyXG4gICAgICBdLFxyXG4gICAgICBzcXNRdWV1ZXM6IFtcclxuICAgICAgICAnRW1haWxQcm9jZXNzUXVldWUnLFxyXG4gICAgICAgICdFbWFpbFByb2Nlc3NETFEnXHJcbiAgICAgIF1cclxuICAgIH1cclxuICB9LFxyXG4gICdwcm9kJzoge1xyXG4gICAgc3RhZ2U6ICdwcm9kJyxcclxuICAgIHJlZ2lvbjogJ3VzLWVhc3QtMicsXHJcbiAgICBhY2NvdW50OiAnMDk4NzY1NDMyMTA5JyxcclxuICAgIGV4aXN0aW5nUmVzb3VyY2VzOiB7XHJcbiAgICAgIC8vIEFkZCBleGlzdGluZyByZXNvdXJjZSBuYW1lcyBoZXJlIGZvciBwcm9kdWN0aW9uXHJcbiAgICAgIGR5bmFtb0RCVGFibGVzOiBbXSxcclxuICAgICAgczNCdWNrZXRzOiBbXSxcclxuICAgICAgc3FzUXVldWVzOiBbXVxyXG4gICAgfVxyXG4gIH1cclxufTtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXNvdXJjZUNvbmZpZyhzdGFnZTogc3RyaW5nLCByZWdpb246IHN0cmluZyk6IFNoYXJlZFJlc291cmNlQ29uZmlnIHwgdW5kZWZpbmVkIHtcclxuICBjb25zdCBjb25maWcgPSBTSEFSRURfUkVTT1VSQ0VfQ09ORklHU1tzdGFnZV07XHJcbiAgaWYgKGNvbmZpZyAmJiBjb25maWcucmVnaW9uID09PSByZWdpb24pIHtcclxuICAgIHJldHVybiBjb25maWc7XHJcbiAgfVxyXG4gIHJldHVybiB1bmRlZmluZWQ7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBzaG91bGRDcmVhdGVSZXNvdXJjZShyZXNvdXJjZVR5cGU6ICdkeW5hbW9EQlRhYmxlcycgfCAnczNCdWNrZXRzJyB8ICdzcXNRdWV1ZXMnLCByZXNvdXJjZU5hbWU6IHN0cmluZywgc3RhZ2U6IHN0cmluZywgcmVnaW9uOiBzdHJpbmcpOiBib29sZWFuIHtcclxuICBjb25zdCBjb25maWcgPSBnZXRSZXNvdXJjZUNvbmZpZyhzdGFnZSwgcmVnaW9uKTtcclxuICBpZiAoIWNvbmZpZykge1xyXG4gICAgLy8gTm8gY29uZmlnIGZvdW5kLCBjcmVhdGUgdGhlIHJlc291cmNlXHJcbiAgICByZXR1cm4gdHJ1ZTtcclxuICB9XHJcbiAgXHJcbiAgLy8gSWYgdGhlIHJlc291cmNlIGlzIGluIHRoZSBleGlzdGluZyByZXNvdXJjZXMgbGlzdCwgZG9uJ3QgY3JlYXRlIGl0XHJcbiAgcmV0dXJuICFjb25maWcuZXhpc3RpbmdSZXNvdXJjZXM/LltyZXNvdXJjZVR5cGVdPy5pbmNsdWRlcyhyZXNvdXJjZU5hbWUpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZ2V0RXhpc3RpbmdSZXNvdXJjZXMoc3RhZ2U6IHN0cmluZywgcmVnaW9uOiBzdHJpbmcpIHtcclxuICBjb25zdCBjb25maWcgPSBnZXRSZXNvdXJjZUNvbmZpZyhzdGFnZSwgcmVnaW9uKTtcclxuICBpZiAoIWNvbmZpZykge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgZHluYW1vREJUYWJsZXM6IFtdLFxyXG4gICAgICBzM0J1Y2tldHM6IFtdLFxyXG4gICAgICBzcXNRdWV1ZXM6IFtdXHJcbiAgICB9O1xyXG4gIH1cclxuICBcclxuICByZXR1cm4gY29uZmlnLmV4aXN0aW5nUmVzb3VyY2VzO1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgUmVzb3VyY2VDb25maWdDaGVja2VyIHtcclxuICAvKipcclxuICAgKiBDaGVjayBpZiBzaGFyZWQgcmVzb3VyY2VzIGV4aXN0IGJhc2VkIG9uIGNvbmZpZ3VyYXRpb24gYW5kIEFXUyBTREsgY2FsbHNcclxuICAgKi9cclxuICBzdGF0aWMgYXN5bmMgY2hlY2tTaGFyZWRSZXNvdXJjZXMoY29uZmlnOiBTaGFyZWRSZXNvdXJjZUNvbmZpZyk6IFByb21pc2U8e1xyXG4gICAgZHluYW1vREJUYWJsZXM6IHsgW2tleTogc3RyaW5nXTogUmVzb3VyY2VFeGlzdGVuY2VDaGVjayB9O1xyXG4gICAgczNCdWNrZXRzOiB7IFtrZXk6IHN0cmluZ106IFJlc291cmNlRXhpc3RlbmNlQ2hlY2sgfTtcclxuICAgIHNxc1F1ZXVlczogeyBba2V5OiBzdHJpbmddOiBSZXNvdXJjZUV4aXN0ZW5jZUNoZWNrIH07XHJcbiAgfT4ge1xyXG4gICAgY29uc3QgZ2V0UmVzb3VyY2VOYW1lID0gKG5hbWU6IHN0cmluZykgPT4gbmFtZTtcclxuXHJcbiAgICAvLyBEZWZpbmUgYWxsIHNoYXJlZCByZXNvdXJjZXNcclxuICAgIGNvbnN0IGR5bmFtb0RCVGFibGVOYW1lcyA9IFtcclxuICAgICAgJ1VzZXJzJyxcclxuICAgICAgJ0NvbnZlcnNhdGlvbnMnLCBcclxuICAgICAgJ1RocmVhZHMnLFxyXG4gICAgICAnT3JnYW5pemF0aW9ucycsXHJcbiAgICAgICdSYXRlTGltaXRpbmcnXHJcbiAgICBdO1xyXG5cclxuICAgIGNvbnN0IHMzQnVja2V0TmFtZXMgPSBbXHJcbiAgICAgICdzdG9yYWdlJyxcclxuICAgICAgJ2VtYWlsLWF0dGFjaG1lbnRzJ1xyXG4gICAgXTtcclxuXHJcbiAgICBjb25zdCBzcXNRdWV1ZU5hbWVzID0gW1xyXG4gICAgICAnRW1haWxQcm9jZXNzUXVldWUnLFxyXG4gICAgICAnRW1haWxQcm9jZXNzRExRJ1xyXG4gICAgXTtcclxuXHJcbiAgICAvLyBDaGVjayBEeW5hbW9EQiB0YWJsZXNcclxuICAgIGNvbnN0IGR5bmFtb0RCVGFibGVzOiB7IFtrZXk6IHN0cmluZ106IFJlc291cmNlRXhpc3RlbmNlQ2hlY2sgfSA9IHt9O1xyXG4gICAgZm9yIChjb25zdCB0YWJsZU5hbWUgb2YgZHluYW1vREJUYWJsZU5hbWVzKSB7XHJcbiAgICAgIGNvbnN0IGZ1bGxUYWJsZU5hbWUgPSBnZXRSZXNvdXJjZU5hbWUodGFibGVOYW1lKTtcclxuICAgICAgY29uc29sZS5sb2coYCAgIPCflI0gQ2hlY2tpbmcgRHluYW1vREIgdGFibGU6ICR7ZnVsbFRhYmxlTmFtZX1gKTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IGV4aXN0aW5nVGFibGVzID0gY29uZmlnLmV4aXN0aW5nUmVzb3VyY2VzPy5keW5hbW9EQlRhYmxlcyB8fCBbXTtcclxuICAgICAgY29uc3QgZXhpc3RzID0gZXhpc3RpbmdUYWJsZXMuaW5jbHVkZXMoZnVsbFRhYmxlTmFtZSk7XHJcbiAgICAgIGR5bmFtb0RCVGFibGVzW3RhYmxlTmFtZV0gPSB7XHJcbiAgICAgICAgZXhpc3RzLFxyXG4gICAgICAgIG5lZWRzQ3JlYXRpb246ICFleGlzdHMsXHJcbiAgICAgICAgcmVzb3VyY2VBcm46IGV4aXN0cyA/IGBhcm46YXdzOmR5bmFtb2RiOiR7Y29uZmlnLnJlZ2lvbn06JHtjb25maWcuYWNjb3VudH06dGFibGUvJHtmdWxsVGFibGVOYW1lfWAgOiB1bmRlZmluZWQsXHJcbiAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ2hlY2sgUzMgYnVja2V0c1xyXG4gICAgY29uc3QgczNCdWNrZXRzOiB7IFtrZXk6IHN0cmluZ106IFJlc291cmNlRXhpc3RlbmNlQ2hlY2sgfSA9IHt9O1xyXG4gICAgZm9yIChjb25zdCBidWNrZXROYW1lIG9mIHMzQnVja2V0TmFtZXMpIHtcclxuICAgICAgY29uc3QgZnVsbEJ1Y2tldE5hbWUgPSBnZXRSZXNvdXJjZU5hbWUoYnVja2V0TmFtZSkudG9Mb3dlckNhc2UoKTtcclxuICAgICAgY29uc29sZS5sb2coYCAgIPCflI0gQ2hlY2tpbmcgUzMgYnVja2V0OiAke2Z1bGxCdWNrZXROYW1lfWApO1xyXG4gICAgICBcclxuICAgICAgY29uc3QgZXhpc3RpbmdCdWNrZXRzID0gY29uZmlnLmV4aXN0aW5nUmVzb3VyY2VzPy5zM0J1Y2tldHMgfHwgW107XHJcbiAgICAgIGNvbnN0IGV4aXN0cyA9IGV4aXN0aW5nQnVja2V0cy5pbmNsdWRlcyhmdWxsQnVja2V0TmFtZSk7XHJcbiAgICAgIHMzQnVja2V0c1tidWNrZXROYW1lXSA9IHtcclxuICAgICAgICBleGlzdHMsXHJcbiAgICAgICAgbmVlZHNDcmVhdGlvbjogIWV4aXN0cyxcclxuICAgICAgICByZXNvdXJjZUFybjogZXhpc3RzID8gYGFybjphd3M6czM6Ojoke2Z1bGxCdWNrZXROYW1lfWAgOiB1bmRlZmluZWQsXHJcbiAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ2hlY2sgU1FTIHF1ZXVlc1xyXG4gICAgY29uc3Qgc3FzUXVldWVzOiB7IFtrZXk6IHN0cmluZ106IFJlc291cmNlRXhpc3RlbmNlQ2hlY2sgfSA9IHt9O1xyXG4gICAgZm9yIChjb25zdCBxdWV1ZU5hbWUgb2Ygc3FzUXVldWVOYW1lcykge1xyXG4gICAgICBjb25zdCBmdWxsUXVldWVOYW1lID0gZ2V0UmVzb3VyY2VOYW1lKHF1ZXVlTmFtZSk7XHJcbiAgICAgIGNvbnNvbGUubG9nKGAgICDwn5SNIENoZWNraW5nIFNRUyBxdWV1ZTogJHtmdWxsUXVldWVOYW1lfWApO1xyXG4gICAgICBcclxuICAgICAgY29uc3QgZXhpc3RpbmdRdWV1ZXMgPSBjb25maWcuZXhpc3RpbmdSZXNvdXJjZXM/LnNxc1F1ZXVlcyB8fCBbXTtcclxuICAgICAgY29uc3QgZXhpc3RzID0gZXhpc3RpbmdRdWV1ZXMuaW5jbHVkZXMoZnVsbFF1ZXVlTmFtZSk7XHJcbiAgICAgIHNxc1F1ZXVlc1txdWV1ZU5hbWVdID0ge1xyXG4gICAgICAgIGV4aXN0cyxcclxuICAgICAgICBuZWVkc0NyZWF0aW9uOiAhZXhpc3RzLFxyXG4gICAgICAgIHJlc291cmNlQXJuOiBleGlzdHMgPyBgYXJuOmF3czpzcXM6JHtjb25maWcucmVnaW9ufToke2NvbmZpZy5hY2NvdW50fToke2Z1bGxRdWV1ZU5hbWV9YCA6IHVuZGVmaW5lZCxcclxuICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBkeW5hbW9EQlRhYmxlcyxcclxuICAgICAgczNCdWNrZXRzLFxyXG4gICAgICBzcXNRdWV1ZXMsXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRW5oYW5jZWQgcmVzb3VyY2UgY2hlY2tpbmcgdGhhdCBjb21iaW5lcyBjb25maWd1cmF0aW9uIGFuZCBBV1MgU0RLIGNoZWNrc1xyXG4gICAqL1xyXG4gIHN0YXRpYyBhc3luYyBjaGVja1Jlc291cmNlc1dpdGhBV1Moc3RhZ2U6IHN0cmluZywgcmVnaW9uOiBzdHJpbmcpOiBQcm9taXNlPHtcclxuICAgIGR5bmFtb0RCVGFibGVzOiB7IFtrZXk6IHN0cmluZ106IFJlc291cmNlRXhpc3RlbmNlQ2hlY2sgfTtcclxuICAgIHMzQnVja2V0czogeyBba2V5OiBzdHJpbmddOiBSZXNvdXJjZUV4aXN0ZW5jZUNoZWNrIH07XHJcbiAgICBzcXNRdWV1ZXM6IHsgW2tleTogc3RyaW5nXTogUmVzb3VyY2VFeGlzdGVuY2VDaGVjayB9O1xyXG4gIH0+IHtcclxuICAgIGNvbnN0IGdldFJlc291cmNlTmFtZSA9IChuYW1lOiBzdHJpbmcpID0+IG5hbWU7XHJcblxyXG4gICAgLy8gRGVmaW5lIGFsbCBzaGFyZWQgcmVzb3VyY2VzXHJcbiAgICBjb25zdCBkeW5hbW9EQlRhYmxlTmFtZXMgPSBbXHJcbiAgICAgICdVc2VycycsXHJcbiAgICAgICdDb252ZXJzYXRpb25zJywgXHJcbiAgICAgICdUaHJlYWRzJyxcclxuICAgICAgJ09yZ2FuaXphdGlvbnMnLFxyXG4gICAgICAnUmF0ZUxpbWl0aW5nJ1xyXG4gICAgXTtcclxuXHJcbiAgICBjb25zdCBzM0J1Y2tldE5hbWVzID0gW1xyXG4gICAgICAnc3RvcmFnZScsXHJcbiAgICAgICdlbWFpbC1hdHRhY2htZW50cydcclxuICAgIF07XHJcblxyXG4gICAgY29uc3Qgc3FzUXVldWVOYW1lcyA9IFtcclxuICAgICAgJ0VtYWlsUHJvY2Vzc1F1ZXVlJyxcclxuICAgICAgJ0VtYWlsUHJvY2Vzc0RMUSdcclxuICAgIF07XHJcblxyXG4gICAgLy8gQ2hlY2sgRHluYW1vREIgdGFibGVzIHVzaW5nIEFXUyBTREtcclxuICAgIGNvbnN0IGR5bmFtb0RCVGFibGVzOiB7IFtrZXk6IHN0cmluZ106IFJlc291cmNlRXhpc3RlbmNlQ2hlY2sgfSA9IHt9O1xyXG4gICAgZm9yIChjb25zdCB0YWJsZU5hbWUgb2YgZHluYW1vREJUYWJsZU5hbWVzKSB7XHJcbiAgICAgIGNvbnN0IGZ1bGxUYWJsZU5hbWUgPSBnZXRSZXNvdXJjZU5hbWUodGFibGVOYW1lKTtcclxuICAgICAgY29uc29sZS5sb2coYCAgIPCflI0gQ2hlY2tpbmcgRHluYW1vREIgdGFibGU6ICR7ZnVsbFRhYmxlTmFtZX1gKTtcclxuICAgICAgZHluYW1vREJUYWJsZXNbdGFibGVOYW1lXSA9IGF3YWl0IFJlc291cmNlQ2hlY2tlci5jaGVja0R5bmFtb0RCVGFibGVFeGlzdHMoZnVsbFRhYmxlTmFtZSwgcmVnaW9uKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBDaGVjayBTMyBidWNrZXRzIHVzaW5nIEFXUyBTREtcclxuICAgIGNvbnN0IHMzQnVja2V0czogeyBba2V5OiBzdHJpbmddOiBSZXNvdXJjZUV4aXN0ZW5jZUNoZWNrIH0gPSB7fTtcclxuICAgIGZvciAoY29uc3QgYnVja2V0TmFtZSBvZiBzM0J1Y2tldE5hbWVzKSB7XHJcbiAgICAgIGNvbnN0IGZ1bGxCdWNrZXROYW1lID0gZ2V0UmVzb3VyY2VOYW1lKGJ1Y2tldE5hbWUpLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgIGNvbnNvbGUubG9nKGAgICDwn5SNIENoZWNraW5nIFMzIGJ1Y2tldDogJHtmdWxsQnVja2V0TmFtZX1gKTtcclxuICAgICAgczNCdWNrZXRzW2J1Y2tldE5hbWVdID0gYXdhaXQgUmVzb3VyY2VDaGVja2VyLmNoZWNrUzNCdWNrZXRFeGlzdHMoZnVsbEJ1Y2tldE5hbWUsIHJlZ2lvbik7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ2hlY2sgU1FTIHF1ZXVlcyB1c2luZyBBV1MgU0RLXHJcbiAgICBjb25zdCBzcXNRdWV1ZXM6IHsgW2tleTogc3RyaW5nXTogUmVzb3VyY2VFeGlzdGVuY2VDaGVjayB9ID0ge307XHJcbiAgICBmb3IgKGNvbnN0IHF1ZXVlTmFtZSBvZiBzcXNRdWV1ZU5hbWVzKSB7XHJcbiAgICAgIGNvbnN0IGZ1bGxRdWV1ZU5hbWUgPSBnZXRSZXNvdXJjZU5hbWUocXVldWVOYW1lKTtcclxuICAgICAgY29uc29sZS5sb2coYCAgIPCflI0gQ2hlY2tpbmcgU1FTIHF1ZXVlOiAke2Z1bGxRdWV1ZU5hbWV9YCk7XHJcbiAgICAgIHNxc1F1ZXVlc1txdWV1ZU5hbWVdID0gYXdhaXQgUmVzb3VyY2VDaGVja2VyLmNoZWNrU1FTUXVldWVFeGlzdHMoZnVsbFF1ZXVlTmFtZSwgcmVnaW9uKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBkeW5hbW9EQlRhYmxlcyxcclxuICAgICAgczNCdWNrZXRzLFxyXG4gICAgICBzcXNRdWV1ZXMsXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogSW1wb3J0IGV4aXN0aW5nIER5bmFtb0RCIHRhYmxlXHJcbiAgICovXHJcbiAgc3RhdGljIGltcG9ydER5bmFtb0RCVGFibGUoc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgdGFibGVOYW1lOiBzdHJpbmcpOiBkeW5hbW9kYi5JVGFibGUge1xyXG4gICAgcmV0dXJuIFJlc291cmNlQ2hlY2tlci5pbXBvcnREeW5hbW9EQlRhYmxlKHNjb3BlLCBpZCwgdGFibGVOYW1lLCBzY29wZS5ub2RlLnRyeUdldENvbnRleHQoJ3JlZ2lvbicpIHx8ICd1cy13ZXN0LTEnKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEltcG9ydCBleGlzdGluZyBTMyBidWNrZXRcclxuICAgKi9cclxuICBzdGF0aWMgaW1wb3J0UzNCdWNrZXQoc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgYnVja2V0TmFtZTogc3RyaW5nKTogczMuSUJ1Y2tldCB7XHJcbiAgICByZXR1cm4gUmVzb3VyY2VDaGVja2VyLmltcG9ydFMzQnVja2V0KHNjb3BlLCBpZCwgYnVja2V0TmFtZSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBJbXBvcnQgZXhpc3RpbmcgU1FTIHF1ZXVlXHJcbiAgICovXHJcbiAgc3RhdGljIGltcG9ydFNRU1F1ZXVlKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHF1ZXVlTmFtZTogc3RyaW5nLCByZWdpb246IHN0cmluZyk6IHNxcy5JUXVldWUge1xyXG4gICAgcmV0dXJuIFJlc291cmNlQ2hlY2tlci5pbXBvcnRTUVNRdWV1ZShzY29wZSwgaWQsIHF1ZXVlTmFtZSwgcmVnaW9uKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldCBleGlzdGluZyByZXNvdXJjZXMgZnJvbSBlbnZpcm9ubWVudCB2YXJpYWJsZXMgb3IgY29uZmlndXJhdGlvblxyXG4gICAqL1xyXG4gIHN0YXRpYyBnZXRFeGlzdGluZ1Jlc291cmNlc0Zyb21FbnYoc3RhZ2U6IHN0cmluZyk6IHtcclxuICAgIGR5bmFtb0RCVGFibGVzPzogc3RyaW5nW107XHJcbiAgICBzM0J1Y2tldHM/OiBzdHJpbmdbXTtcclxuICAgIHNxc1F1ZXVlcz86IHN0cmluZ1tdO1xyXG4gIH0ge1xyXG4gICAgY29uc3QgZXhpc3RpbmdSZXNvdXJjZXM6IHtcclxuICAgICAgZHluYW1vREJUYWJsZXM/OiBzdHJpbmdbXTtcclxuICAgICAgczNCdWNrZXRzPzogc3RyaW5nW107XHJcbiAgICAgIHNxc1F1ZXVlcz86IHN0cmluZ1tdO1xyXG4gICAgfSA9IHt9O1xyXG5cclxuICAgIC8vIENoZWNrIGZvciBleGlzdGluZyBEeW5hbW9EQiB0YWJsZXNcclxuICAgIGNvbnN0IGV4aXN0aW5nVGFibGVzID0gcHJvY2Vzcy5lbnYuRVhJU1RJTkdfRFlOQU1PREJfVEFCTEVTO1xyXG4gICAgaWYgKGV4aXN0aW5nVGFibGVzKSB7XHJcbiAgICAgIGV4aXN0aW5nUmVzb3VyY2VzLmR5bmFtb0RCVGFibGVzID0gZXhpc3RpbmdUYWJsZXMuc3BsaXQoJywnKS5tYXAodGFibGUgPT4gdGFibGUudHJpbSgpKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBDaGVjayBmb3IgZXhpc3RpbmcgUzMgYnVja2V0c1xyXG4gICAgY29uc3QgZXhpc3RpbmdCdWNrZXRzID0gcHJvY2Vzcy5lbnYuRVhJU1RJTkdfUzNfQlVDS0VUUztcclxuICAgIGlmIChleGlzdGluZ0J1Y2tldHMpIHtcclxuICAgICAgZXhpc3RpbmdSZXNvdXJjZXMuczNCdWNrZXRzID0gZXhpc3RpbmdCdWNrZXRzLnNwbGl0KCcsJykubWFwKGJ1Y2tldCA9PiBidWNrZXQudHJpbSgpKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBDaGVjayBmb3IgZXhpc3RpbmcgU1FTIHF1ZXVlc1xyXG4gICAgY29uc3QgZXhpc3RpbmdRdWV1ZXMgPSBwcm9jZXNzLmVudi5FWElTVElOR19TUVNfUVVFVUVTO1xyXG4gICAgaWYgKGV4aXN0aW5nUXVldWVzKSB7XHJcbiAgICAgIGV4aXN0aW5nUmVzb3VyY2VzLnNxc1F1ZXVlcyA9IGV4aXN0aW5nUXVldWVzLnNwbGl0KCcsJykubWFwKHF1ZXVlID0+IHF1ZXVlLnRyaW0oKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGV4aXN0aW5nUmVzb3VyY2VzO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQXV0by1kZXRlY3QgZXhpc3RpbmcgcmVzb3VyY2VzIGJ5IGNoZWNraW5nIGNvbW1vbiBwYXR0ZXJuc1xyXG4gICAqL1xyXG4gIHN0YXRpYyBnZXRBdXRvRGV0ZWN0ZWRSZXNvdXJjZXMoc3RhZ2U6IHN0cmluZywgcmVnaW9uOiBzdHJpbmcpOiB7XHJcbiAgICBkeW5hbW9EQlRhYmxlcz86IHN0cmluZ1tdO1xyXG4gICAgczNCdWNrZXRzPzogc3RyaW5nW107XHJcbiAgICBzcXNRdWV1ZXM/OiBzdHJpbmdbXTtcclxuICB9IHtcclxuICAgIGNvbnN0IGdldFJlc291cmNlTmFtZSA9IChuYW1lOiBzdHJpbmcpID0+IG5hbWU7XHJcbiAgICBcclxuICAgIC8vIENvbW1vbiByZXNvdXJjZSBwYXR0ZXJucyB0aGF0IG1pZ2h0IGV4aXN0XHJcbiAgICBjb25zdCBjb21tb25UYWJsZXMgPSBbXHJcbiAgICAgIGdldFJlc291cmNlTmFtZSgnVXNlcnMnKSxcclxuICAgICAgZ2V0UmVzb3VyY2VOYW1lKCdDb252ZXJzYXRpb25zJyksXHJcbiAgICAgIGdldFJlc291cmNlTmFtZSgnVGhyZWFkcycpLFxyXG4gICAgICBnZXRSZXNvdXJjZU5hbWUoJ09yZ2FuaXphdGlvbnMnKSxcclxuICAgICAgZ2V0UmVzb3VyY2VOYW1lKCdSYXRlTGltaXRpbmcnKSxcclxuICAgIF07XHJcblxyXG4gICAgY29uc3QgY29tbW9uQnVja2V0cyA9IFtcclxuICAgICAgZ2V0UmVzb3VyY2VOYW1lKCdzdG9yYWdlJykudG9Mb3dlckNhc2UoKSxcclxuICAgICAgZ2V0UmVzb3VyY2VOYW1lKCdlbWFpbC1hdHRhY2htZW50cycpLnRvTG93ZXJDYXNlKCksXHJcbiAgICBdO1xyXG5cclxuICAgIGNvbnN0IGNvbW1vblF1ZXVlcyA9IFtcclxuICAgICAgZ2V0UmVzb3VyY2VOYW1lKCdFbWFpbFByb2Nlc3NRdWV1ZScpLFxyXG4gICAgICBnZXRSZXNvdXJjZU5hbWUoJ0VtYWlsUHJvY2Vzc0RMUScpLFxyXG4gICAgXTtcclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBkeW5hbW9EQlRhYmxlczogY29tbW9uVGFibGVzLFxyXG4gICAgICBzM0J1Y2tldHM6IGNvbW1vbkJ1Y2tldHMsXHJcbiAgICAgIHNxc1F1ZXVlczogY29tbW9uUXVldWVzLFxyXG4gICAgfTtcclxuICB9XHJcbn0gIl19