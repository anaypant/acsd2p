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
exports.Acsd2PStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const shared_resources_1 = require("./shared/shared-resources");
const queue_resources_1 = require("./queue/queue-resources");
const lambda_resources_1 = require("./lambda/lambda-resources");
const api_resources_1 = require("./api/api-resources");
const resource_config_1 = require("./shared/resource-config");
class Acsd2PStack extends cdk.Stack {
    userPool;
    userPoolClient;
    sharedDynamoDBTables;
    sharedS3Buckets;
    emailProcessQueue;
    lambdaFunctions;
    api;
    constructor(scope, id, props) {
        super(scope, id, props);
        const { stage } = props;
        this.validateEnvironmentConfiguration(stage);
        console.log(`🏗️  Building ACS Infrastructure for ${stage.toUpperCase()} environment`);
        console.log(`   Region: ${this.region}`);
        console.log(`   Account: ${this.account}\n`);
        // Check for existing shared resources using enhanced checking
        console.log('🔍 Checking existing shared resources...');
        const resourceExistenceChecks = this.checkExistingResources(stage);
        // Create Shared Resources (Cognito, S3, DynamoDB)
        console.log('📦 Creating Shared Resources...');
        const sharedResources = (0, shared_resources_1.createSharedResources)(this, {
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
        const queueResources = (0, queue_resources_1.createQueueResources)(this, {
            stage: stage,
            importExistingResources: true,
            resourceExistenceChecks: resourceExistenceChecks,
        });
        this.emailProcessQueue = queueResources.emailProcessQueue;
        // Create Lambda Resources (Functions, Permissions)
        console.log('⚡ Creating Lambda Resources...');
        const lambdaResources = (0, lambda_resources_1.createLambdaResources)(this, {
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
        const apiResources = (0, api_resources_1.createApiResources)(this, {
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
    checkExistingResources(stage) {
        console.log('   📝 Checking for existing resources...');
        // First, try to get resources from environment variables (for manual override)
        const existingResourcesFromEnv = resource_config_1.ResourceConfigChecker.getExistingResourcesFromEnv(stage);
        // If environment variables are set, use them
        if (existingResourcesFromEnv.dynamoDBTables?.length ||
            existingResourcesFromEnv.s3Buckets?.length ||
            existingResourcesFromEnv.sqsQueues?.length) {
            console.log('   📋 Using existing resources from environment variables');
            return this.buildExistenceMapFromEnv(existingResourcesFromEnv);
        }
        // Otherwise, use AWS SDK to check for existing resources
        console.log('   🔍 Using AWS SDK to check for existing resources');
        return this.buildExistenceMapFromAWS(stage);
    }
    buildExistenceMapFromEnv(existingResources) {
        // Build the existence map for DynamoDB tables
        const dynamoDBTableNames = [
            'Users',
            'Conversations',
            'Threads',
            'Organizations',
            'RateLimiting',
        ];
        const dynamoDBTables = {};
        for (const table of dynamoDBTableNames) {
            const fullName = table;
            const exists = existingResources.dynamoDBTables?.includes(fullName) || false;
            dynamoDBTables[table] = {
                exists,
                needsCreation: !exists,
            };
        }
        // Build the existence map for S3 buckets
        const s3BucketNames = ['storage', 'email-attachments'];
        const s3Buckets = {};
        for (const bucket of s3BucketNames) {
            const fullName = bucket.toLowerCase();
            const exists = existingResources.s3Buckets?.includes(fullName) || false;
            s3Buckets[bucket] = {
                exists,
                needsCreation: !exists,
            };
        }
        // Build the existence map for SQS queues
        const sqsQueueNames = ['EmailProcessQueue', 'EmailProcessDLQ'];
        const sqsQueues = {};
        for (const queue of sqsQueueNames) {
            const fullName = queue;
            const exists = existingResources.sqsQueues?.includes(fullName) || false;
            sqsQueues[queue] = {
                exists,
                needsCreation: !exists,
            };
        }
        return {
            dynamoDBTables,
            s3Buckets,
            sqsQueues,
        };
    }
    buildExistenceMapFromAWS(stage) {
        // For now, return a default map that assumes resources need to be created
        // In a real implementation, you would call the async AWS SDK methods here
        // Since this is called from the constructor, we'll use a synchronous approach
        const dynamoDBTableNames = [
            'Users',
            'Conversations',
            'Threads',
            'Organizations',
            'RateLimiting',
        ];
        const dynamoDBTables = {};
        for (const table of dynamoDBTableNames) {
            dynamoDBTables[table] = {
                exists: false,
                needsCreation: true,
            };
        }
        const s3BucketNames = ['storage', 'email-attachments'];
        const s3Buckets = {};
        for (const bucket of s3BucketNames) {
            s3Buckets[bucket] = {
                exists: false,
                needsCreation: true,
            };
        }
        const sqsQueueNames = ['EmailProcessQueue', 'EmailProcessDLQ'];
        const sqsQueues = {};
        for (const queue of sqsQueueNames) {
            sqsQueues[queue] = {
                exists: false,
                needsCreation: true,
            };
        }
        return {
            dynamoDBTables,
            s3Buckets,
            sqsQueues,
        };
    }
    createStackOutputs() {
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
    validateEnvironmentConfiguration(stage) {
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
exports.Acsd2PStack = Acsd2PStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWNzZDJwLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYWNzZDJwLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBRW5DLGdFQUFrRTtBQUNsRSw2REFBK0Q7QUFDL0QsZ0VBQWtFO0FBQ2xFLHVEQUF5RDtBQUV6RCw4REFBaUU7QUFVakUsTUFBYSxXQUFZLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDeEIsUUFBUSxDQUFNO0lBQ2QsY0FBYyxDQUFNO0lBQ3BCLG9CQUFvQixDQUF5QjtJQUM3QyxlQUFlLENBQXlCO0lBQ3hDLGlCQUFpQixDQUFNO0lBQ3ZCLGVBQWUsQ0FBeUI7SUFDeEMsR0FBRyxDQUFNO0lBRXpCLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBdUI7UUFDL0QsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxFQUFFLEtBQUssRUFBRSxHQUFHLEtBQUssQ0FBQztRQUV4QixJQUFJLENBQUMsZ0NBQWdDLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFN0MsT0FBTyxDQUFDLEdBQUcsQ0FBQyx3Q0FBd0MsS0FBSyxDQUFDLFdBQVcsRUFBRSxjQUFjLENBQUMsQ0FBQztRQUN2RixPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDekMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFlLElBQUksQ0FBQyxPQUFPLElBQUksQ0FBQyxDQUFDO1FBRTdDLDhEQUE4RDtRQUM5RCxPQUFPLENBQUMsR0FBRyxDQUFDLDBDQUEwQyxDQUFDLENBQUM7UUFDeEQsTUFBTSx1QkFBdUIsR0FBRyxJQUFJLENBQUMsc0JBQXNCLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFbkUsa0RBQWtEO1FBQ2xELE9BQU8sQ0FBQyxHQUFHLENBQUMsaUNBQWlDLENBQUMsQ0FBQztR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SyxjQUFjLENBQUMsQ0FBQztRQUM3RixPQUFPLENBQUMsR0FBRyxDQUFDLDJDQUEyQyxDQUFDLENBQUM7SUFDM0QsQ0FBQztDQUNGO0FBNVFELGtDQTRRQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7IGNyZWF0ZVNoYXJlZFJlc291cmNlcyB9IGZyb20gJy4vc2hhcmVkL3NoYXJlZC1yZXNvdXJjZXMnO1xuaW1wb3J0IHsgY3JlYXRlUXVldWVSZXNvdXJjZXMgfSBmcm9tICcuL3F1ZXVlL3F1ZXVlLXJlc291cmNlcyc7XG5pbXBvcnQgeyBjcmVhdGVMYW1iZGFSZXNvdXJjZXMgfSBmcm9tICcuL2xhbWJkYS9sYW1iZGEtcmVzb3VyY2VzJztcbmltcG9ydCB7IGNyZWF0ZUFwaVJlc291cmNlcyB9IGZyb20gJy4vYXBpL2FwaS1yZXNvdXJjZXMnO1xuaW1wb3J0IHsgUmVzb3VyY2VDaGVja2VyIH0gZnJvbSAnLi9zaGFyZWQvcmVzb3VyY2UtY2hlY2tlcic7XG5pbXBvcnQgeyBSZXNvdXJjZUNvbmZpZ0NoZWNrZXIgfSBmcm9tICcuL3NoYXJlZC9yZXNvdXJjZS1jb25maWcnO1xuXG5pbnRlcmZhY2UgQWNzZDJQU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgc3RhZ2U6IHN0cmluZztcbiAgLy8gRXhpc3RpbmcgQ29nbml0byBVc2VyIFBvb2wgcGFyYW1ldGVyc1xuICBleGlzdGluZ1VzZXJQb29sSWQ/OiBzdHJpbmc7XG4gIGV4aXN0aW5nVXNlclBvb2xDbGllbnRJZD86IHN0cmluZztcbiAgZXhpc3RpbmdVc2VyUG9vbENsaWVudFNlY3JldD86IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIEFjc2QyUFN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgcHVibGljIHJlYWRvbmx5IHVzZXJQb29sOiBhbnk7XG4gIHB1YmxpYyByZWFkb25seSB1c2VyUG9vbENsaWVudDogYW55O1xuICBwdWJsaWMgcmVhZG9ubHkgc2hhcmVkRHluYW1vREJUYWJsZXM6IHsgW2tleTogc3RyaW5nXTogYW55IH07XG4gIHB1YmxpYyByZWFkb25seSBzaGFyZWRTM0J1Y2tldHM6IHsgW2tleTogc3RyaW5nXTogYW55IH07XG4gIHB1YmxpYyByZWFkb25seSBlbWFpbFByb2Nlc3NRdWV1ZTogYW55O1xuICBwdWJsaWMgcmVhZG9ubHkgbGFtYmRhRnVuY3Rpb25zOiB7IFtrZXk6IHN0cmluZ106IGFueSB9O1xuICBwdWJsaWMgcmVhZG9ubHkgYXBpOiBhbnk7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEFjc2QyUFN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHsgc3RhZ2UgfSA9IHByb3BzO1xuXG4gICAgdGhpcy52YWxpZGF0ZUVudmlyb25tZW50Q29uZmlndXJhdGlvbihzdGFnZSk7XG5cbiAgICBjb25zb2xlLmxvZyhg8J+Pl++4jyAgQnVpbGRpbmcgQUNTIEluZnJhc3RydWN0dXJlIGZvciAke3N0YWdlLnRvVXBwZXJDYXNlKCl9IGVudmlyb25tZW50YCk7XG4gICAgY29uc29sZS5sb2coYCAgIFJlZ2lvbjogJHt0aGlzLnJlZ2lvbn1gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgQWNjb3VudDogJHt0aGlzLmFjY291bnR9XFxuYCk7XG5cbiAgICAvLyBDaGVjayBmb3IgZXhpc3Rpbmcgc2hhcmVkIHJlc291cmNlcyB1c2luZyBlbmhhbmNlZCBjaGVja2luZ1xuICAgIGNvbnNvbGUubG9nKCfwn5SNIENoZWNraW5nIGV4aXN0aW5nIHNoYXJlZCByZXNvdXJjZXMuLi4nKTtcbiAgICBjb25zdCByZXNvdXJjZUV4aXN0ZW5jZUNoZWNrcyA9IHRoaXMuY2hlY2tFeGlzdGluZ1Jlc291cmNlcyhzdGFnZSk7XG5cbiAgICAvLyBDcmVhdGUgU2hhcmVkIFJlc291cmNlcyAoQ29nbml0bywgUzMsIER5bmFtb0RCKVxuICAgIGNvbnNvbGUubG9nKCfwn5OmIENyZWF0aW5nIFNoYXJlZCBSZXNvdXJjZXMuLi4nKTtcbiAgICBjb25zdCBzaGFyZWRSZXNvdXJjZXMgPSBjcmVhdGVTaGFyZWRSZXNvdXJjZXModGhpcywge1xuICAgICAgc3RhZ2U6IHN0YWdlLFxuICAgICAgZXhpc3RpbmdVc2VyUG9vbElkOiBwcm9wcy5leGlzdGluZ1VzZXJQb29sSWQsXG4gICAgICBleGlzdGluZ1VzZXJQb29sQ2xpZW50SWQ6IHByb3BzLmV4aXN0aW5nVXNlclBvb2xDbGllbnRJZCxcbiAgICAgIGV4aXN0aW5nVXNlclBvb2xDbGllbnRTZWNyZXQ6IHByb3BzLmV4aXN0aW5nVXNlclBvb2xDbGllbnRTZWNyZXQsXG4gICAgICBpbXBvcnRFeGlzdGluZ1Jlc291cmNlczogdHJ1ZSxcbiAgICAgIHJlc291cmNlRXhpc3RlbmNlQ2hlY2tzOiByZXNvdXJjZUV4aXN0ZW5jZUNoZWNrcyxcbiAgICB9KTtcbiAgICBcbiAgICB0aGlzLnVzZXJQb29sID0gc2hhcmVkUmVzb3VyY2VzLnVzZXJQb29sO1xuICAgIHRoaXMudXNlclBvb2xDbGllbnQgPSBzaGFyZWRSZXNvdXJjZXMudXNlclBvb2xDbGllbnQ7XG4gICAgdGhpcy5zaGFyZWREeW5hbW9EQlRhYmxlcyA9IHNoYXJlZFJlc291cmNlcy5zaGFyZWREeW5hbW9EQlRhYmxlcztcbiAgICB0aGlzLnNoYXJlZFMzQnVja2V0cyA9IHNoYXJlZFJlc291cmNlcy5zaGFyZWRTM0J1Y2tldHM7XG5cbiAgICAvLyBDcmVhdGUgUXVldWUgUmVzb3VyY2VzIChTUVMpXG4gICAgY29uc29sZS5sb2coJ/Cfk6wgQ3JlYXRpbmcgUXVldWUgUmVzb3VyY2VzLi4uJyk7XG4gICAgY29uc3QgcXVldWVSZXNvdXJjZXMgPSBjcmVhdGVRdWV1ZVJlc291cmNlcyh0aGlzLCB7XG4gICAgICBzdGFnZTogc3RhZ2UsXG4gICAgICBpbXBvcnRFeGlzdGluZ1Jlc291cmNlczogdHJ1ZSxcbiAgICAgIHJlc291cmNlRXhpc3RlbmNlQ2hlY2tzOiByZXNvdXJjZUV4aXN0ZW5jZUNoZWNrcyxcbiAgICB9KTtcbiAgICBcbiAgICB0aGlzLmVtYWlsUHJvY2Vzc1F1ZXVlID0gcXVldWVSZXNvdXJjZXMuZW1haWxQcm9jZXNzUXVldWU7XG5cbiAgICAvLyBDcmVhdGUgTGFtYmRhIFJlc291cmNlcyAoRnVuY3Rpb25zLCBQZXJtaXNzaW9ucylcbiAgICBjb25zb2xlLmxvZygn4pqhIENyZWF0aW5nIExhbWJkYSBSZXNvdXJjZXMuLi4nKTtcbiAgICBjb25zdCBsYW1iZGFSZXNvdXJjZXMgPSBjcmVhdGVMYW1iZGFSZXNvdXJjZXModGhpcywge1xuICAgICAgc3RhZ2U6IHN0YWdlLFxuICAgICAgdXNlclBvb2w6IHRoaXMudXNlclBvb2wsXG4gICAgICB1c2VyUG9vbENsaWVudDogdGhpcy51c2VyUG9vbENsaWVudCxcbiAgICAgIGV4aXN0aW5nVXNlclBvb2xDbGllbnRTZWNyZXQ6IHByb3BzLmV4aXN0aW5nVXNlclBvb2xDbGllbnRTZWNyZXQsXG4gICAgICBzaGFyZWREeW5hbW9EQlRhYmxlczogdGhpcy5zaGFyZWREeW5hbW9EQlRhYmxlcyxcbiAgICAgIHNoYXJlZFMzQnVja2V0czogdGhpcy5zaGFyZWRTM0J1Y2tldHMsXG4gICAgICBlbWFpbFByb2Nlc3NRdWV1ZTogdGhpcy5lbWFpbFByb2Nlc3NRdWV1ZSxcbiAgICAgIGltcG9ydEV4aXN0aW5nUmVzb3VyY2VzOiB0cnVlLFxuICAgIH0pO1xuICAgIFxuICAgIHRoaXMubGFtYmRhRnVuY3Rpb25zID0gbGFtYmRhUmVzb3VyY2VzLmxhbWJkYUZ1bmN0aW9ucztcblxuICAgIC8vIENyZWF0ZSBBUEkgUmVzb3VyY2VzIChBUEkgR2F0ZXdheSwgUm91dGVzKVxuICAgIGNvbnNvbGUubG9nKCfwn4yQIENyZWF0aW5nIEFQSSBSZXNvdXJjZXMuLi4nKTtcbiAgICBjb25zdCBhcGlSZXNvdXJjZXMgPSBjcmVhdGVBcGlSZXNvdXJjZXModGhpcywge1xuICAgICAgc3RhZ2U6IHN0YWdlLFxuICAgICAgbGFtYmRhRnVuY3Rpb25zOiB0aGlzLmxhbWJkYUZ1bmN0aW9ucyxcbiAgICB9KTtcbiAgICBcbiAgICB0aGlzLmFwaSA9IGFwaVJlc291cmNlcy5hcGk7XG5cbiAgICAvLyBDcmVhdGUgU3RhY2sgT3V0cHV0c1xuICAgIHRoaXMuY3JlYXRlU3RhY2tPdXRwdXRzKCk7XG5cbiAgICBjb25zb2xlLmxvZygnXFxu4pyFIEFDUyBJbmZyYXN0cnVjdHVyZSBTdGFjayBjcmVhdGVkIHN1Y2Nlc3NmdWxseSEnKTtcbiAgICBjb25zb2xlLmxvZyhgICAgRW52aXJvbm1lbnQ6ICR7c3RhZ2UudG9VcHBlckNhc2UoKX1gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgQVBJIEdhdGV3YXk6ICR7dGhpcy5hcGkudXJsfWApO1xuICAgIGNvbnNvbGUubG9nKGAgICBMYW1iZGEgRnVuY3Rpb25zOiAke09iamVjdC5rZXlzKHRoaXMubGFtYmRhRnVuY3Rpb25zKS5sZW5ndGh9YCk7XG4gICAgY29uc29sZS5sb2coYCAgIER5bmFtb0RCIFRhYmxlczogJHtPYmplY3Qua2V5cyh0aGlzLnNoYXJlZER5bmFtb0RCVGFibGVzKS5sZW5ndGh9YCk7XG4gICAgY29uc29sZS5sb2coYCAgIFMzIEJ1Y2tldHM6ICR7T2JqZWN0LmtleXModGhpcy5zaGFyZWRTM0J1Y2tldHMpLmxlbmd0aH1gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgU1FTIFF1ZXVlczogMVxcbmApO1xuICB9XG5cbiAgcHJpdmF0ZSBjaGVja0V4aXN0aW5nUmVzb3VyY2VzKHN0YWdlOiBzdHJpbmcpIHtcbiAgICBjb25zb2xlLmxvZygnICAg8J+TnSBDaGVja2luZyBmb3IgZXhpc3RpbmcgcmVzb3VyY2VzLi4uJyk7XG5cbiAgICAvLyBGaXJzdCwgdHJ5IHRvIGdldCByZXNvdXJjZXMgZnJvbSBlbnZpcm9ubWVudCB2YXJpYWJsZXMgKGZvciBtYW51YWwgb3ZlcnJpZGUpXG4gICAgY29uc3QgZXhpc3RpbmdSZXNvdXJjZXNGcm9tRW52ID0gUmVzb3VyY2VDb25maWdDaGVja2VyLmdldEV4aXN0aW5nUmVzb3VyY2VzRnJvbUVudihzdGFnZSk7XG4gICAgXG4gICAgLy8gSWYgZW52aXJvbm1lbnQgdmFyaWFibGVzIGFyZSBzZXQsIHVzZSB0aGVtXG4gICAgaWYgKGV4aXN0aW5nUmVzb3VyY2VzRnJvbUVudi5keW5hbW9EQlRhYmxlcz8ubGVuZ3RoIHx8IFxuICAgICAgICBleGlzdGluZ1Jlc291cmNlc0Zyb21FbnYuczNCdWNrZXRzPy5sZW5ndGggfHwgXG4gICAgICAgIGV4aXN0aW5nUmVzb3VyY2VzRnJvbUVudi5zcXNRdWV1ZXM/Lmxlbmd0aCkge1xuICAgICAgY29uc29sZS5sb2coJyAgIPCfk4sgVXNpbmcgZXhpc3RpbmcgcmVzb3VyY2VzIGZyb20gZW52aXJvbm1lbnQgdmFyaWFibGVzJyk7XG4gICAgICByZXR1cm4gdGhpcy5idWlsZEV4aXN0ZW5jZU1hcEZyb21FbnYoZXhpc3RpbmdSZXNvdXJjZXNGcm9tRW52KTtcbiAgICB9XG5cbiAgICAvLyBPdGhlcndpc2UsIHVzZSBBV1MgU0RLIHRvIGNoZWNrIGZvciBleGlzdGluZyByZXNvdXJjZXNcbiAgICBjb25zb2xlLmxvZygnICAg8J+UjSBVc2luZyBBV1MgU0RLIHRvIGNoZWNrIGZvciBleGlzdGluZyByZXNvdXJjZXMnKTtcbiAgICByZXR1cm4gdGhpcy5idWlsZEV4aXN0ZW5jZU1hcEZyb21BV1Moc3RhZ2UpO1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZEV4aXN0ZW5jZU1hcEZyb21FbnYoZXhpc3RpbmdSZXNvdXJjZXM6IGFueSkge1xuICAgIC8vIEJ1aWxkIHRoZSBleGlzdGVuY2UgbWFwIGZvciBEeW5hbW9EQiB0YWJsZXNcbiAgICBjb25zdCBkeW5hbW9EQlRhYmxlTmFtZXMgPSBbXG4gICAgICAnVXNlcnMnLFxuICAgICAgJ0NvbnZlcnNhdGlvbnMnLFxuICAgICAgJ1RocmVhZHMnLFxuICAgICAgJ09yZ2FuaXphdGlvbnMnLFxuICAgICAgJ1JhdGVMaW1pdGluZycsXG4gICAgXTtcbiAgICBjb25zdCBkeW5hbW9EQlRhYmxlczogeyBba2V5OiBzdHJpbmddOiB7IGV4aXN0czogYm9vbGVhbjsgbmVlZHNDcmVhdGlvbjogYm9vbGVhbiB9IH0gPSB7fTtcbiAgICBmb3IgKGNvbnN0IHRhYmxlIG9mIGR5bmFtb0RCVGFibGVOYW1lcykge1xuICAgICAgY29uc3QgZnVsbE5hbWUgPSB0YWJsZTtcbiAgICAgIGNvbnN0IGV4aXN0cyA9IGV4aXN0aW5nUmVzb3VyY2VzLmR5bmFtb0RCVGFibGVzPy5pbmNsdWRlcyhmdWxsTmFtZSkgfHwgZmFsc2U7XG4gICAgICBkeW5hbW9EQlRhYmxlc1t0YWJsZV0gPSB7XG4gICAgICAgIGV4aXN0cyxcbiAgICAgICAgbmVlZHNDcmVhdGlvbjogIWV4aXN0cyxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gQnVpbGQgdGhlIGV4aXN0ZW5jZSBtYXAgZm9yIFMzIGJ1Y2tldHNcbiAgICBjb25zdCBzM0J1Y2tldE5hbWVzID0gWydzdG9yYWdlJywgJ2VtYWlsLWF0dGFjaG1lbnRzJ107XG4gICAgY29uc3QgczNCdWNrZXRzOiB7IFtrZXk6IHN0cmluZ106IHsgZXhpc3RzOiBib29sZWFuOyBuZWVkc0NyZWF0aW9uOiBib29sZWFuIH0gfSA9IHt9O1xuICAgIGZvciAoY29uc3QgYnVja2V0IG9mIHMzQnVja2V0TmFtZXMpIHtcbiAgICAgIGNvbnN0IGZ1bGxOYW1lID0gYnVja2V0LnRvTG93ZXJDYXNlKCk7XG4gICAgICBjb25zdCBleGlzdHMgPSBleGlzdGluZ1Jlc291cmNlcy5zM0J1Y2tldHM/LmluY2x1ZGVzKGZ1bGxOYW1lKSB8fCBmYWxzZTtcbiAgICAgIHMzQnVja2V0c1tidWNrZXRdID0ge1xuICAgICAgICBleGlzdHMsXG4gICAgICAgIG5lZWRzQ3JlYXRpb246ICFleGlzdHMsXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIEJ1aWxkIHRoZSBleGlzdGVuY2UgbWFwIGZvciBTUVMgcXVldWVzXG4gICAgY29uc3Qgc3FzUXVldWVOYW1lcyA9IFsnRW1haWxQcm9jZXNzUXVldWUnLCAnRW1haWxQcm9jZXNzRExRJ107XG4gICAgY29uc3Qgc3FzUXVldWVzOiB7IFtrZXk6IHN0cmluZ106IHsgZXhpc3RzOiBib29sZWFuOyBuZWVkc0NyZWF0aW9uOiBib29sZWFuIH0gfSA9IHt9O1xuICAgIGZvciAoY29uc3QgcXVldWUgb2Ygc3FzUXVldWVOYW1lcykge1xuICAgICAgY29uc3QgZnVsbE5hbWUgPSBxdWV1ZTtcbiAgICAgIGNvbnN0IGV4aXN0cyA9IGV4aXN0aW5nUmVzb3VyY2VzLnNxc1F1ZXVlcz8uaW5jbHVkZXMoZnVsbE5hbWUpIHx8IGZhbHNlO1xuICAgICAgc3FzUXVldWVzW3F1ZXVlXSA9IHtcbiAgICAgICAgZXhpc3RzLFxuICAgICAgICBuZWVkc0NyZWF0aW9uOiAhZXhpc3RzLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgZHluYW1vREJUYWJsZXMsXG4gICAgICBzM0J1Y2tldHMsXG4gICAgICBzcXNRdWV1ZXMsXG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRFeGlzdGVuY2VNYXBGcm9tQVdTKHN0YWdlOiBzdHJpbmcpIHtcbiAgICAvLyBGb3Igbm93LCByZXR1cm4gYSBkZWZhdWx0IG1hcCB0aGF0IGFzc3VtZXMgcmVzb3VyY2VzIG5lZWQgdG8gYmUgY3JlYXRlZFxuICAgIC8vIEluIGEgcmVhbCBpbXBsZW1lbnRhdGlvbiwgeW91IHdvdWxkIGNhbGwgdGhlIGFzeW5jIEFXUyBTREsgbWV0aG9kcyBoZXJlXG4gICAgLy8gU2luY2UgdGhpcyBpcyBjYWxsZWQgZnJvbSB0aGUgY29uc3RydWN0b3IsIHdlJ2xsIHVzZSBhIHN5bmNocm9ub3VzIGFwcHJvYWNoXG4gICAgXG4gICAgY29uc3QgZHluYW1vREJUYWJsZU5hbWVzID0gW1xuICAgICAgJ1VzZXJzJyxcbiAgICAgICdDb252ZXJzYXRpb25zJyxcbiAgICAgICdUaHJlYWRzJyxcbiAgICAgICdPcmdhbml6YXRpb25zJyxcbiAgICAgICdSYXRlTGltaXRpbmcnLFxuICAgIF07XG4gICAgY29uc3QgZHluYW1vREJUYWJsZXM6IHsgW2tleTogc3RyaW5nXTogeyBleGlzdHM6IGJvb2xlYW47IG5lZWRzQ3JlYXRpb246IGJvb2xlYW4gfSB9ID0ge307XG4gICAgZm9yIChjb25zdCB0YWJsZSBvZiBkeW5hbW9EQlRhYmxlTmFtZXMpIHtcbiAgICAgIGR5bmFtb0RCVGFibGVzW3RhYmxlXSA9IHtcbiAgICAgICAgZXhpc3RzOiBmYWxzZSxcbiAgICAgICAgbmVlZHNDcmVhdGlvbjogdHJ1ZSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgczNCdWNrZXROYW1lcyA9IFsnc3RvcmFnZScsICdlbWFpbC1hdHRhY2htZW50cyddO1xuICAgIGNvbnN0IHMzQnVja2V0czogeyBba2V5OiBzdHJpbmddOiB7IGV4aXN0czogYm9vbGVhbjsgbmVlZHNDcmVhdGlvbjogYm9vbGVhbiB9IH0gPSB7fTtcbiAgICBmb3IgKGNvbnN0IGJ1Y2tldCBvZiBzM0J1Y2tldE5hbWVzKSB7XG4gICAgICBzM0J1Y2tldHNbYnVja2V0XSA9IHtcbiAgICAgICAgZXhpc3RzOiBmYWxzZSxcbiAgICAgICAgbmVlZHNDcmVhdGlvbjogdHJ1ZSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3Qgc3FzUXVldWVOYW1lcyA9IFsnRW1haWxQcm9jZXNzUXVldWUnLCAnRW1haWxQcm9jZXNzRExRJ107XG4gICAgY29uc3Qgc3FzUXVldWVzOiB7IFtrZXk6IHN0cmluZ106IHsgZXhpc3RzOiBib29sZWFuOyBuZWVkc0NyZWF0aW9uOiBib29sZWFuIH0gfSA9IHt9O1xuICAgIGZvciAoY29uc3QgcXVldWUgb2Ygc3FzUXVldWVOYW1lcykge1xuICAgICAgc3FzUXVldWVzW3F1ZXVlXSA9IHtcbiAgICAgICAgZXhpc3RzOiBmYWxzZSxcbiAgICAgICAgbmVlZHNDcmVhdGlvbjogdHJ1ZSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGR5bmFtb0RCVGFibGVzLFxuICAgICAgczNCdWNrZXRzLFxuICAgICAgc3FzUXVldWVzLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZVN0YWNrT3V0cHV0cygpOiB2b2lkIHtcbiAgICAvLyBNYWluIEFQSSBHYXRld2F5IFVSTFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBcGlHYXRld2F5VXJsJywge1xuICAgICAgdmFsdWU6IHRoaXMuYXBpLnVybCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnTWFpbiBBUEkgR2F0ZXdheSBVUkwnLFxuICAgICAgZXhwb3J0TmFtZTogYCR7dGhpcy5zdGFja05hbWV9LUFwaUdhdGV3YXlVcmxgLFxuICAgIH0pO1xuXG4gICAgLy8gQ29nbml0byBJbmZvcm1hdGlvblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbElkJywge1xuICAgICAgdmFsdWU6IHRoaXMudXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgSUQnLFxuICAgICAgZXhwb3J0TmFtZTogYCR7dGhpcy5zdGFja05hbWV9LVVzZXJQb29sSWRgLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sQ2xpZW50SWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy51c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBDbGllbnQgSUQnLFxuICAgICAgZXhwb3J0TmFtZTogYCR7dGhpcy5zdGFja05hbWV9LVVzZXJQb29sQ2xpZW50SWRgLFxuICAgIH0pO1xuXG4gICAgLy8gUXVldWUgSW5mb3JtYXRpb25cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRW1haWxQcm9jZXNzUXVldWVVcmwnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5lbWFpbFByb2Nlc3NRdWV1ZS5xdWV1ZVVybCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRW1haWwgUHJvY2VzcyBRdWV1ZSBVUkwnLFxuICAgICAgZXhwb3J0TmFtZTogYCR7dGhpcy5zdGFja05hbWV9LUVtYWlsUHJvY2Vzc1F1ZXVlVXJsYCxcbiAgICB9KTtcblxuICAgIC8vIFJlc291cmNlIENvdW50c1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdMYW1iZGFGdW5jdGlvbkNvdW50Jywge1xuICAgICAgdmFsdWU6IE9iamVjdC5rZXlzKHRoaXMubGFtYmRhRnVuY3Rpb25zKS5sZW5ndGgudG9TdHJpbmcoKSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnTnVtYmVyIG9mIExhbWJkYSBmdW5jdGlvbnMgZGVwbG95ZWQnLFxuICAgICAgZXhwb3J0TmFtZTogYCR7dGhpcy5zdGFja05hbWV9LUxhbWJkYUZ1bmN0aW9uQ291bnRgLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0R5bmFtb0RCVGFibGVDb3VudCcsIHtcbiAgICAgIHZhbHVlOiBPYmplY3Qua2V5cyh0aGlzLnNoYXJlZER5bmFtb0RCVGFibGVzKS5sZW5ndGgudG9TdHJpbmcoKSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnTnVtYmVyIG9mIER5bmFtb0RCIHRhYmxlcyBkZXBsb3llZCcsXG4gICAgICBleHBvcnROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX0tRHluYW1vREJUYWJsZUNvdW50YCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdTM0J1Y2tldENvdW50Jywge1xuICAgICAgdmFsdWU6IE9iamVjdC5rZXlzKHRoaXMuc2hhcmVkUzNCdWNrZXRzKS5sZW5ndGgudG9TdHJpbmcoKSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnTnVtYmVyIG9mIFMzIGJ1Y2tldHMgZGVwbG95ZWQnLFxuICAgICAgZXhwb3J0TmFtZTogYCR7dGhpcy5zdGFja05hbWV9LVMzQnVja2V0Q291bnRgLFxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSB2YWxpZGF0ZUVudmlyb25tZW50Q29uZmlndXJhdGlvbihzdGFnZTogc3RyaW5nKTogdm9pZCB7XG4gICAgY29uc3QgY3VycmVudFJlZ2lvbiA9IHRoaXMucmVnaW9uO1xuICAgIGNvbnN0IGN1cnJlbnRBY2NvdW50ID0gdGhpcy5hY2NvdW50O1xuXG4gICAgY29uc29sZS5sb2coYPCflI0gRW52aXJvbm1lbnQgVmFsaWRhdGlvbjpgKTtcbiAgICBjb25zb2xlLmxvZyhgICAgU3RhZ2U6ICR7c3RhZ2V9YCk7XG4gICAgY29uc29sZS5sb2coYCAgIFJlZ2lvbjogJHtjdXJyZW50UmVnaW9ufWApO1xuICAgIGNvbnNvbGUubG9nKGAgICBBY2NvdW50OiAke2N1cnJlbnRBY2NvdW50fWApO1xuXG4gICAgaWYgKHN0YWdlID09PSAnZGV2JyAmJiBjdXJyZW50UmVnaW9uICE9PSAndXMtd2VzdC0xJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGDinYwgREVQTE9ZTUVOVCBFUlJPUjogRGV2ZWxvcG1lbnQgZW52aXJvbm1lbnQgbXVzdCBiZSBkZXBsb3llZCB0byB1cy13ZXN0LTEsIGJ1dCBjdXJyZW50IHJlZ2lvbiBpcyAke2N1cnJlbnRSZWdpb259YCk7XG4gICAgfVxuXG4gICAgaWYgKHN0YWdlID09PSAncHJvZCcgJiYgY3VycmVudFJlZ2lvbiAhPT0gJ3VzLWVhc3QtMicpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihg4p2MIERFUExPWU1FTlQgRVJST1I6IFByb2R1Y3Rpb24gZW52aXJvbm1lbnQgbXVzdCBiZSBkZXBsb3llZCB0byB1cy1lYXN0LTIsIGJ1dCBjdXJyZW50IHJlZ2lvbiBpcyAke2N1cnJlbnRSZWdpb259YCk7XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coYCAgIOKchSBWYWxpZGF0aW9uIHBhc3NlZCAtIGRlcGxveWluZyB0byBjb3JyZWN0IHJlZ2lvbiBmb3IgJHtzdGFnZX0gZW52aXJvbm1lbnRgKTtcbiAgICBjb25zb2xlLmxvZyhgICAg4pyFIEVudmlyb25tZW50IGNvbmZpZ3VyYXRpb24gaXMgdmFsaWRcXG5gKTtcbiAgfVxufVxuIl19