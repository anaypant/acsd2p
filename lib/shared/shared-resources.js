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
exports.createSharedResources = createSharedResources;
const cdk = __importStar(require("aws-cdk-lib"));
const cognito = __importStar(require("aws-cdk-lib/aws-cognito"));
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const resource_config_1 = require("./resource-config");
function createSharedResources(scope, props) {
    const { stage, existingUserPoolId, existingUserPoolClientId, existingUserPoolClientSecret, importExistingResources = false, resourceExistenceChecks } = props;
    const getResourceName = (name) => {
        return name;
    };
    // Cognito User Pool
    let userPool;
    let userPoolClient;
    if (importExistingResources && existingUserPoolId && existingUserPoolClientId) {
        console.log(`   🔗 Importing existing Cognito User Pool: ${existingUserPoolId}`);
        userPool = cognito.UserPool.fromUserPoolId(scope, 'ImportedUserPool', existingUserPoolId);
        userPoolClient = cognito.UserPoolClient.fromUserPoolClientId(scope, 'ImportedUserPoolClient', existingUserPoolClientId);
    }
    else {
        console.log(`   🆕 Creating new Cognito User Pool for ${stage} environment`);
        userPool = new cognito.UserPool(scope, 'UserPool', {
            userPoolName: getResourceName('UserPool'),
            selfSignUpEnabled: true,
            signInAliases: {
                email: true,
            },
            standardAttributes: {
                email: {
                    required: true,
                    mutable: true,
                },
            },
            passwordPolicy: {
                minLength: 8,
                requireLowercase: true,
                requireUppercase: true,
                requireDigits: true,
                requireSymbols: true,
            },
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });
        userPoolClient = new cognito.UserPoolClient(scope, 'UserPoolClient', {
            userPool: userPool,
            userPoolClientName: getResourceName('UserPoolClient'),
            generateSecret: true,
            authFlows: {
                adminUserPassword: true,
                userPassword: true,
                userSrp: true,
            },
            oAuth: {
                flows: {
                    authorizationCodeGrant: true,
                    implicitCodeGrant: true,
                },
                scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE],
                callbackUrls: ['http://localhost:3000/callback', 'https://yourdomain.com/callback'],
            },
        });
    }
    // DynamoDB Tables - Check existence and create or import accordingly
    const sharedDynamoDBTables = {};
    const tableConfigs = [
        { key: 'Users', partitionKey: 'id', sortKey: undefined },
        { key: 'Conversations', partitionKey: 'id', sortKey: 'timestamp' },
        { key: 'Threads', partitionKey: 'id', sortKey: 'timestamp' },
        { key: 'Organizations', partitionKey: 'id', sortKey: undefined },
        { key: 'RateLimiting', partitionKey: 'key', sortKey: 'timestamp', ttl: 'ttl' },
    ];
    for (const config of tableConfigs) {
        const tableName = getResourceName(config.key);
        const existenceCheck = resourceExistenceChecks?.dynamoDBTables?.[config.key];
        if (existenceCheck?.exists && !existenceCheck.needsCreation) {
            console.log(`   🔗 Importing existing DynamoDB table: ${tableName}`);
            sharedDynamoDBTables[config.key] = resource_config_1.ResourceConfigChecker.importDynamoDBTable(scope, `${config.key}Table`, tableName);
        }
        else {
            console.log(`   🆕 Creating new DynamoDB table: ${tableName}`);
            const baseProps = {
                tableName: tableName,
                partitionKey: { name: config.partitionKey, type: dynamodb.AttributeType.STRING },
                billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
                removalPolicy: cdk.RemovalPolicy.RETAIN,
                pointInTimeRecovery: true,
            };
            const tableProps = {
                ...baseProps,
                ...(config.sortKey && { sortKey: { name: config.sortKey, type: dynamodb.AttributeType.STRING } }),
                ...(config.ttl && { timeToLiveAttribute: config.ttl }),
            };
            sharedDynamoDBTables[config.key] = new dynamodb.Table(scope, `${config.key}Table`, tableProps);
        }
    }
    // S3 Buckets - Check existence and create or import accordingly
    const sharedS3Buckets = {};
    const bucketConfigs = [
        { key: 'Storage', name: 'storage' },
        { key: 'EmailAttachments', name: 'email-attachments' },
    ];
    for (const config of bucketConfigs) {
        const bucketName = getResourceName(config.name).toLowerCase();
        const existenceCheck = resourceExistenceChecks?.s3Buckets?.[config.name];
        if (existenceCheck?.exists && !existenceCheck.needsCreation) {
            console.log(`   🔗 Importing existing S3 bucket: ${bucketName}`);
            sharedS3Buckets[config.key] = resource_config_1.ResourceConfigChecker.importS3Bucket(scope, `${config.key}Bucket`, bucketName);
        }
        else {
            console.log(`   🆕 Creating new S3 bucket: ${bucketName}`);
            sharedS3Buckets[config.key] = new s3.Bucket(scope, `${config.key}Bucket`, {
                bucketName: bucketName,
                versioned: true,
                encryption: s3.BucketEncryption.S3_MANAGED,
                blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
                removalPolicy: cdk.RemovalPolicy.RETAIN,
                autoDeleteObjects: false,
            });
        }
    }
    return {
        userPool,
        userPoolClient,
        sharedDynamoDBTables,
        sharedS3Buckets,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2hhcmVkLXJlc291cmNlcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNoYXJlZC1yZXNvdXJjZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQW1CQSxzREFvSkM7QUF2S0QsaURBQW1DO0FBQ25DLGlFQUFtRDtBQUNuRCxtRUFBcUQ7QUFDckQsdURBQXlDO0FBRXpDLHVEQUFrRjtBQWNsRixTQUFnQixxQkFBcUIsQ0FBQyxLQUFnQixFQUFFLEtBQTJCO0lBQ2pGLE1BQU0sRUFDSixLQUFLLEVBQ0wsa0JBQWtCLEVBQ2xCLHdCQUF3QixFQUN4Qiw0QkFBNEIsRUFDNUIsdUJBQXVCLEdBQUcsS0FBSyxFQUMvQix1QkFBdUIsRUFDeEIsR0FBRyxLQUFLLENBQUM7SUFFVixNQUFNLGVBQWUsR0FBRyxDQUFDLElBQVksRUFBRSxFQUFFO1FBQ3ZDLE9BQU8sSUFBSSxDQUFDO0lBQ2QsQ0FBQyxDQUFDO0lBRUYsb0JBQW9CO0lBQ3BCLElBQUksUUFBMkIsQ0FBQztJQUNoQyxJQUFJLGNBQXVDLENBQUM7SUFFNUMsSUFBSSx1QkFBdUIsSUFBSSxrQkFBa0IsSUFBSSx3QkFBd0IsRUFBRSxDQUFDO1FBQzlFLE9BQU8sQ0FBQyxHQUFHLENBQUMsK0NBQStDLGtCQUFrQixFQUFFLENBQUMsQ0FBQztRQUNqRixRQUFRLEdBQUcsT0FBTyxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsS0FBSyxFQUFFLGtCQUFrQixFQUFFLGtCQUFrQixDQUFDLENBQUM7UUFDMUYsY0FBYyxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQUMsb0JBQW9CLENBQUMsS0FBSyxFQUFFLHdCQUF3QixFQUFFLHdCQUF3QixDQUFDLENBQUM7SUFDMUgsQ0FBQztTQUFNLENBQUM7UUFDTixPQUFPLENBQUMsR0FBRyxDQUFDLDRDQUE0QyxLQUFLLGNBQWMsQ0FBQyxDQUFDO1FBQzdFLFFBQVEsR0FBRyxJQUFJLE9BQU8sQ0FBQyxRQUFRLENBQUMs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ZTtLQUNoQixDQUFDO0FBQ0osQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XHJcbmltcG9ydCAqIGFzIGNvZ25pdG8gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZ25pdG8nO1xyXG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGInO1xyXG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xyXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcclxuaW1wb3J0IHsgUmVzb3VyY2VDb25maWdDaGVja2VyLCBSZXNvdXJjZUV4aXN0ZW5jZUNoZWNrIH0gZnJvbSAnLi9yZXNvdXJjZS1jb25maWcnO1xyXG5cclxuaW50ZXJmYWNlIFNoYXJlZFJlc291cmNlc1Byb3BzIHtcclxuICBzdGFnZTogc3RyaW5nO1xyXG4gIGV4aXN0aW5nVXNlclBvb2xJZD86IHN0cmluZztcclxuICBleGlzdGluZ1VzZXJQb29sQ2xpZW50SWQ/OiBzdHJpbmc7XHJcbiAgZXhpc3RpbmdVc2VyUG9vbENsaWVudFNlY3JldD86IHN0cmluZztcclxuICBpbXBvcnRFeGlzdGluZ1Jlc291cmNlcz86IGJvb2xlYW47XHJcbiAgcmVzb3VyY2VFeGlzdGVuY2VDaGVja3M/OiB7XHJcbiAgICBkeW5hbW9EQlRhYmxlczogeyBba2V5OiBzdHJpbmddOiBSZXNvdXJjZUV4aXN0ZW5jZUNoZWNrIH07XHJcbiAgICBzM0J1Y2tldHM6IHsgW2tleTogc3RyaW5nXTogUmVzb3VyY2VFeGlzdGVuY2VDaGVjayB9O1xyXG4gIH07XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTaGFyZWRSZXNvdXJjZXMoc2NvcGU6IGNkay5TdGFjaywgcHJvcHM6IFNoYXJlZFJlc291cmNlc1Byb3BzKSB7XHJcbiAgY29uc3QgeyBcclxuICAgIHN0YWdlLCBcclxuICAgIGV4aXN0aW5nVXNlclBvb2xJZCwgXHJcbiAgICBleGlzdGluZ1VzZXJQb29sQ2xpZW50SWQsIFxyXG4gICAgZXhpc3RpbmdVc2VyUG9vbENsaWVudFNlY3JldCwgXHJcbiAgICBpbXBvcnRFeGlzdGluZ1Jlc291cmNlcyA9IGZhbHNlLFxyXG4gICAgcmVzb3VyY2VFeGlzdGVuY2VDaGVja3NcclxuICB9ID0gcHJvcHM7XHJcblxyXG4gIGNvbnN0IGdldFJlc291cmNlTmFtZSA9IChuYW1lOiBzdHJpbmcpID0+IHtcclxuICAgIHJldHVybiBuYW1lO1xyXG4gIH07XHJcblxyXG4gIC8vIENvZ25pdG8gVXNlciBQb29sXHJcbiAgbGV0IHVzZXJQb29sOiBjb2duaXRvLklVc2VyUG9vbDtcclxuICBsZXQgdXNlclBvb2xDbGllbnQ6IGNvZ25pdG8uSVVzZXJQb29sQ2xpZW50O1xyXG5cclxuICBpZiAoaW1wb3J0RXhpc3RpbmdSZXNvdXJjZXMgJiYgZXhpc3RpbmdVc2VyUG9vbElkICYmIGV4aXN0aW5nVXNlclBvb2xDbGllbnRJZCkge1xyXG4gICAgY29uc29sZS5sb2coYCAgIPCflJcgSW1wb3J0aW5nIGV4aXN0aW5nIENvZ25pdG8gVXNlciBQb29sOiAke2V4aXN0aW5nVXNlclBvb2xJZH1gKTtcclxuICAgIHVzZXJQb29sID0gY29nbml0by5Vc2VyUG9vbC5mcm9tVXNlclBvb2xJZChzY29wZSwgJ0ltcG9ydGVkVXNlclBvb2wnLCBleGlzdGluZ1VzZXJQb29sSWQpO1xyXG4gICAgdXNlclBvb2xDbGllbnQgPSBjb2duaXRvLlVzZXJQb29sQ2xpZW50LmZyb21Vc2VyUG9vbENsaWVudElkKHNjb3BlLCAnSW1wb3J0ZWRVc2VyUG9vbENsaWVudCcsIGV4aXN0aW5nVXNlclBvb2xDbGllbnRJZCk7XHJcbiAgfSBlbHNlIHtcclxuICAgIGNvbnNvbGUubG9nKGAgICDwn4aVIENyZWF0aW5nIG5ldyBDb2duaXRvIFVzZXIgUG9vbCBmb3IgJHtzdGFnZX0gZW52aXJvbm1lbnRgKTtcclxuICAgIHVzZXJQb29sID0gbmV3IGNvZ25pdG8uVXNlclBvb2woc2NvcGUsICdVc2VyUG9vbCcsIHtcclxuICAgICAgdXNlclBvb2xOYW1lOiBnZXRSZXNvdXJjZU5hbWUoJ1VzZXJQb29sJyksXHJcbiAgICAgIHNlbGZTaWduVXBFbmFibGVkOiB0cnVlLFxyXG4gICAgICBzaWduSW5BbGlhc2VzOiB7XHJcbiAgICAgICAgZW1haWw6IHRydWUsXHJcbiAgICAgIH0sXHJcbiAgICAgIHN0YW5kYXJkQXR0cmlidXRlczoge1xyXG4gICAgICAgIGVtYWlsOiB7XHJcbiAgICAgICAgICByZXF1aXJlZDogdHJ1ZSxcclxuICAgICAgICAgIG11dGFibGU6IHRydWUsXHJcbiAgICAgICAgfSxcclxuICAgICAgfSxcclxuICAgICAgcGFzc3dvcmRQb2xpY3k6IHtcclxuICAgICAgICBtaW5MZW5ndGg6IDgsXHJcbiAgICAgICAgcmVxdWlyZUxvd2VyY2FzZTogdHJ1ZSxcclxuICAgICAgICByZXF1aXJlVXBwZXJjYXNlOiB0cnVlLFxyXG4gICAgICAgIHJlcXVpcmVEaWdpdHM6IHRydWUsXHJcbiAgICAgICAgcmVxdWlyZVN5bWJvbHM6IHRydWUsXHJcbiAgICAgIH0sXHJcbiAgICAgIGFjY291bnRSZWNvdmVyeTogY29nbml0by5BY2NvdW50UmVjb3ZlcnkuRU1BSUxfT05MWSxcclxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxyXG4gICAgfSk7XHJcblxyXG4gICAgdXNlclBvb2xDbGllbnQgPSBuZXcgY29nbml0by5Vc2VyUG9vbENsaWVudChzY29wZSwgJ1VzZXJQb29sQ2xpZW50Jywge1xyXG4gICAgICB1c2VyUG9vbDogdXNlclBvb2wsXHJcbiAgICAgIHVzZXJQb29sQ2xpZW50TmFtZTogZ2V0UmVzb3VyY2VOYW1lKCdVc2VyUG9vbENsaWVudCcpLFxyXG4gICAgICBnZW5lcmF0ZVNlY3JldDogdHJ1ZSxcclxuICAgICAgYXV0aEZsb3dzOiB7XHJcbiAgICAgICAgYWRtaW5Vc2VyUGFzc3dvcmQ6IHRydWUsXHJcbiAgICAgICAgdXNlclBhc3N3b3JkOiB0cnVlLFxyXG4gICAgICAgIHVzZXJTcnA6IHRydWUsXHJcbiAgICAgIH0sXHJcbiAgICAgIG9BdXRoOiB7XHJcbiAgICAgICAgZmxvd3M6IHtcclxuICAgICAgICAgIGF1dGhvcml6YXRpb25Db2RlR3JhbnQ6IHRydWUsXHJcbiAgICAgICAgICBpbXBsaWNpdENvZGVHcmFudDogdHJ1ZSxcclxuICAgICAgICB9LFxyXG4gICAgICAgIHNjb3BlczogW2NvZ25pdG8uT0F1dGhTY29wZS5FTUFJTCwgY29nbml0by5PQXV0aFNjb3BlLk9QRU5JRCwgY29nbml0by5PQXV0aFNjb3BlLlBST0ZJTEVdLFxyXG4gICAgICAgIGNhbGxiYWNrVXJsczogWydodHRwOi8vbG9jYWxob3N0OjMwMDAvY2FsbGJhY2snLCAnaHR0cHM6Ly95b3VyZG9tYWluLmNvbS9jYWxsYmFjayddLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvLyBEeW5hbW9EQiBUYWJsZXMgLSBDaGVjayBleGlzdGVuY2UgYW5kIGNyZWF0ZSBvciBpbXBvcnQgYWNjb3JkaW5nbHlcclxuICBjb25zdCBzaGFyZWREeW5hbW9EQlRhYmxlczogeyBba2V5OiBzdHJpbmddOiBkeW5hbW9kYi5JVGFibGUgfSA9IHt9O1xyXG5cclxuICBjb25zdCB0YWJsZUNvbmZpZ3MgPSBbXHJcbiAgICB7IGtleTogJ1VzZXJzJywgcGFydGl0aW9uS2V5OiAnaWQnLCBzb3J0S2V5OiB1bmRlZmluZWQgfSxcclxuICAgIHsga2V5OiAnQ29udmVyc2F0aW9ucycsIHBhcnRpdGlvbktleTogJ2lkJywgc29ydEtleTogJ3RpbWVzdGFtcCcgfSxcclxuICAgIHsga2V5OiAnVGhyZWFkcycsIHBhcnRpdGlvbktleTogJ2lkJywgc29ydEtleTogJ3RpbWVzdGFtcCcgfSxcclxuICAgIHsga2V5OiAnT3JnYW5pemF0aW9ucycsIHBhcnRpdGlvbktleTogJ2lkJywgc29ydEtleTogdW5kZWZpbmVkIH0sXHJcbiAgICB7IGtleTogJ1JhdGVMaW1pdGluZycsIHBhcnRpdGlvbktleTogJ2tleScsIHNvcnRLZXk6ICd0aW1lc3RhbXAnLCB0dGw6ICd0dGwnIH0sXHJcbiAgXTtcclxuXHJcbiAgZm9yIChjb25zdCBjb25maWcgb2YgdGFibGVDb25maWdzKSB7XHJcbiAgICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXNvdXJjZU5hbWUoY29uZmlnLmtleSk7XHJcbiAgICBjb25zdCBleGlzdGVuY2VDaGVjayA9IHJlc291cmNlRXhpc3RlbmNlQ2hlY2tzPy5keW5hbW9EQlRhYmxlcz8uW2NvbmZpZy5rZXldO1xyXG4gICAgXHJcbiAgICBpZiAoZXhpc3RlbmNlQ2hlY2s/LmV4aXN0cyAmJiAhZXhpc3RlbmNlQ2hlY2submVlZHNDcmVhdGlvbikge1xyXG4gICAgICBjb25zb2xlLmxvZyhgICAg8J+UlyBJbXBvcnRpbmcgZXhpc3RpbmcgRHluYW1vREIgdGFibGU6ICR7dGFibGVOYW1lfWApO1xyXG4gICAgICBzaGFyZWREeW5hbW9EQlRhYmxlc1tjb25maWcua2V5XSA9IFJlc291cmNlQ29uZmlnQ2hlY2tlci5pbXBvcnREeW5hbW9EQlRhYmxlKFxyXG4gICAgICAgIHNjb3BlLCBcclxuICAgICAgICBgJHtjb25maWcua2V5fVRhYmxlYCwgXHJcbiAgICAgICAgdGFibGVOYW1lXHJcbiAgICAgICk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBjb25zb2xlLmxvZyhgICAg8J+GlSBDcmVhdGluZyBuZXcgRHluYW1vREIgdGFibGU6ICR7dGFibGVOYW1lfWApO1xyXG4gICAgICBcclxuICAgICAgY29uc3QgYmFzZVByb3BzID0ge1xyXG4gICAgICAgIHRhYmxlTmFtZTogdGFibGVOYW1lLFxyXG4gICAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiBjb25maWcucGFydGl0aW9uS2V5LCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXHJcbiAgICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxyXG4gICAgICAgIHBvaW50SW5UaW1lUmVjb3Zlcnk6IHRydWUsXHJcbiAgICAgIH07XHJcblxyXG4gICAgICBjb25zdCB0YWJsZVByb3BzOiBkeW5hbW9kYi5UYWJsZVByb3BzID0ge1xyXG4gICAgICAgIC4uLmJhc2VQcm9wcyxcclxuICAgICAgICAuLi4oY29uZmlnLnNvcnRLZXkgJiYgeyBzb3J0S2V5OiB7IG5hbWU6IGNvbmZpZy5zb3J0S2V5LCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9IH0pLFxyXG4gICAgICAgIC4uLihjb25maWcudHRsICYmIHsgdGltZVRvTGl2ZUF0dHJpYnV0ZTogY29uZmlnLnR0bCB9KSxcclxuICAgICAgfTtcclxuXHJcbiAgICAgIHNoYXJlZER5bmFtb0RCVGFibGVzW2NvbmZpZy5rZXldID0gbmV3IGR5bmFtb2RiLlRhYmxlKHNjb3BlLCBgJHtjb25maWcua2V5fVRhYmxlYCwgdGFibGVQcm9wcyk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvLyBTMyBCdWNrZXRzIC0gQ2hlY2sgZXhpc3RlbmNlIGFuZCBjcmVhdGUgb3IgaW1wb3J0IGFjY29yZGluZ2x5XHJcbiAgY29uc3Qgc2hhcmVkUzNCdWNrZXRzOiB7IFtrZXk6IHN0cmluZ106IHMzLklCdWNrZXQgfSA9IHt9O1xyXG5cclxuICBjb25zdCBidWNrZXRDb25maWdzID0gW1xyXG4gICAgeyBrZXk6ICdTdG9yYWdlJywgbmFtZTogJ3N0b3JhZ2UnIH0sXHJcbiAgICB7IGtleTogJ0VtYWlsQXR0YWNobWVudHMnLCBuYW1lOiAnZW1haWwtYXR0YWNobWVudHMnIH0sXHJcbiAgXTtcclxuXHJcbiAgZm9yIChjb25zdCBjb25maWcgb2YgYnVja2V0Q29uZmlncykge1xyXG4gICAgY29uc3QgYnVja2V0TmFtZSA9IGdldFJlc291cmNlTmFtZShjb25maWcubmFtZSkudG9Mb3dlckNhc2UoKTtcclxuICAgIGNvbnN0IGV4aXN0ZW5jZUNoZWNrID0gcmVzb3VyY2VFeGlzdGVuY2VDaGVja3M/LnMzQnVja2V0cz8uW2NvbmZpZy5uYW1lXTtcclxuICAgIFxyXG4gICAgaWYgKGV4aXN0ZW5jZUNoZWNrPy5leGlzdHMgJiYgIWV4aXN0ZW5jZUNoZWNrLm5lZWRzQ3JlYXRpb24pIHtcclxuICAgICAgY29uc29sZS5sb2coYCAgIPCflJcgSW1wb3J0aW5nIGV4aXN0aW5nIFMzIGJ1Y2tldDogJHtidWNrZXROYW1lfWApO1xyXG4gICAgICBzaGFyZWRTM0J1Y2tldHNbY29uZmlnLmtleV0gPSBSZXNvdXJjZUNvbmZpZ0NoZWNrZXIuaW1wb3J0UzNCdWNrZXQoXHJcbiAgICAgICAgc2NvcGUsIFxyXG4gICAgICAgIGAke2NvbmZpZy5rZXl9QnVja2V0YCwgXHJcbiAgICAgICAgYnVja2V0TmFtZVxyXG4gICAgICApO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY29uc29sZS5sb2coYCAgIPCfhpUgQ3JlYXRpbmcgbmV3IFMzIGJ1Y2tldDogJHtidWNrZXROYW1lfWApO1xyXG4gICAgICBzaGFyZWRTM0J1Y2tldHNbY29uZmlnLmtleV0gPSBuZXcgczMuQnVja2V0KHNjb3BlLCBgJHtjb25maWcua2V5fUJ1Y2tldGAsIHtcclxuICAgICAgICBidWNrZXROYW1lOiBidWNrZXROYW1lLFxyXG4gICAgICAgIHZlcnNpb25lZDogdHJ1ZSxcclxuICAgICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXHJcbiAgICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcclxuICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXHJcbiAgICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IGZhbHNlLFxyXG4gICAgICB9KTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHJldHVybiB7XHJcbiAgICB1c2VyUG9vbCxcclxuICAgIHVzZXJQb29sQ2xpZW50LFxyXG4gICAgc2hhcmVkRHluYW1vREJUYWJsZXMsXHJcbiAgICBzaGFyZWRTM0J1Y2tldHMsXHJcbiAgfTtcclxufSAiXX0=