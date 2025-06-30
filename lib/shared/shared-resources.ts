import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { ResourceConfigChecker } from './resource-config';
import { EnhancedResourceChecker, ResourceExistenceCheck } from './enhanced-resource-checker';
import { ResourceImporter } from './resource-importer';

interface SharedResourcesProps {
  stage: string;
  existingUserPoolId?: string;
  existingUserPoolClientId?: string;
  existingUserPoolClientSecret?: string;
  importExistingResources?: boolean;
  resourceExistenceChecks?: {
    dynamoDBTables: { [key: string]: ResourceExistenceCheck };
    s3Buckets: { [key: string]: ResourceExistenceCheck };
  };
}

export function createSharedResources(scope: cdk.Stack, props: SharedResourcesProps) {
  const { 
    stage, 
    existingUserPoolId, 
    existingUserPoolClientId, 
    existingUserPoolClientSecret, 
    importExistingResources = false,
    resourceExistenceChecks
  } = props;

  const getResourceName = (name: string) => {
    return `${stage}-${name}`;
  };

  // Cognito User Pool
  let userPool: cognito.IUserPool;
  let userPoolClient: cognito.IUserPoolClient;

  if (importExistingResources && existingUserPoolId && existingUserPoolClientId) {
    console.log(`   🔗 Importing existing Cognito User Pool: ${existingUserPoolId}`);
    userPool = cognito.UserPool.fromUserPoolId(scope, 'ImportedUserPool', existingUserPoolId);
    userPoolClient = cognito.UserPoolClient.fromUserPoolClientId(scope, 'ImportedUserPoolClient', existingUserPoolClientId);
  } else {
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

  // DynamoDB Tables - Use ResourceImporter for better handling
  const sharedDynamoDBTables: { [key: string]: dynamodb.ITable } = {};

  const tableConfigs = [
    { key: 'Users', partitionKey: 'id', sortKey: undefined },
    { key: 'Conversations', partitionKey: 'id', sortKey: 'timestamp' },
    { key: 'Threads', partitionKey: 'id', sortKey: 'timestamp' },
    { key: 'Organizations', partitionKey: 'id', sortKey: undefined },
    { key: 'RateLimiting', partitionKey: 'key', sortKey: 'timestamp', ttl: 'ttl' },
  ];

  for (const config of tableConfigs) {
    const tableName = getResourceName(config.key);
    
    const baseProps = {
      tableName: tableName,
      partitionKey: { name: config.partitionKey, type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecovery: true,
    };

    const tableProps: dynamodb.TableProps = {
      ...baseProps,
      ...(config.sortKey && { sortKey: { name: config.sortKey, type: dynamodb.AttributeType.STRING } }),
      ...(config.ttl && { timeToLiveAttribute: config.ttl }),
    };

    // Use ResourceImporter to handle existing resources
    sharedDynamoDBTables[config.key] = ResourceImporter.importDynamoDBTable(
      scope,
      config.key,
      tableProps
    );
  }

  // S3 Buckets - Use ResourceImporter for better handling
  const sharedS3Buckets: { [key: string]: s3.IBucket } = {};

  const bucketConfigs = [
    { key: 'Storage', name: 'storage' },
    { key: 'EmailAttachments', name: 'email-attachments' },
  ];

  for (const config of bucketConfigs) {
    const bucketName = getResourceName(config.name).toLowerCase();
    
    const bucketProps: s3.BucketProps = {
      bucketName: bucketName,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    };

    // Use ResourceImporter to handle existing resources
    sharedS3Buckets[config.key] = ResourceImporter.importS3Bucket(
      scope,
      config.name,
      bucketProps
    );
  }

  return {
    userPool,
    userPoolClient,
    sharedDynamoDBTables,
    sharedS3Buckets,
  };
} 