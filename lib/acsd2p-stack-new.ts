import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';
import { Create } from './create';
import { getResourceName } from './resource-namer';

interface Acsd2PStackProps extends cdk.StackProps {
  stage: string;
  existingUserPoolId?: string;
  existingUserPoolClientId?: string;
  existingUserPoolClientSecret?: string;
}

export class Acsd2PStackNew extends cdk.Stack {
  public readonly userPool: cognito.IUserPool;
  public readonly userPoolClient: cognito.IUserPoolClient;
  public readonly dynamoDBTables: { [key: string]: dynamodb.ITable } = {};
  public readonly s3Buckets: { [key: string]: s3.IBucket } = {};
  public readonly emailProcessQueue: sqs.IQueue;
  public readonly lambdaFunctions: { [key: string]: lambda.Function } = {};
  public readonly api: apigateway.RestApi;
  private create: Create;

  constructor(scope: Construct, id: string, props: Acsd2PStackProps) {
    super(scope, id, props);

    const { stage } = props;

    console.log(`🏗️  Building ACS Infrastructure for ${stage.toUpperCase()} environment`);
    console.log(`   Region: ${this.region}`);
    console.log(`   Account: ${this.account}\n`);

    // Initialize the Create utility
    this.create = new Create(this, stage, this.account, this.region);

    // Initialize resources
    const resources = this.initializeResources(props);
    
    // Assign readonly properties
    this.userPool = resources.userPool;
    this.userPoolClient = resources.userPoolClient;
    this.emailProcessQueue = resources.emailProcessQueue;
    this.api = resources.api;
  }

  private initializeResources(props: Acsd2PStackProps): {
    userPool: cognito.IUserPool;
    userPoolClient: cognito.IUserPoolClient;
    emailProcessQueue: sqs.IQueue;
    api: apigateway.RestApi;
  } {
    // 1. Create or Import Cognito Resources
    const cognitoResources = this.setupCognito(props);

    // 2. Create DynamoDB Tables
    this.setupDynamoDBTables();

    // 3. Create S3 Buckets
    this.setupS3Buckets();

    // 4. Create SQS Queues
    const emailProcessQueue = this.setupSQSQueues();

    // 5. Create Lambda Functions
    this.setupLambdaFunctions();

    // 6. Create API Gateway
    const api = this.setupAPIGateway();

    // 7. Create API Routes
    this.createApiRoutes(api);

    // 8. Create Stack Outputs
    this.createStackOutputs();

    return {
      userPool: cognitoResources.userPool,
      userPoolClient: cognitoResources.userPoolClient,
      emailProcessQueue,
      api,
    };
  }

  private setupCognito(props: Acsd2PStackProps): {
    userPool: cognito.IUserPool;
    userPoolClient: cognito.IUserPoolClient;
  } {
    console.log('🔐 Setting up Cognito Resources...');
    
    let userPool: cognito.IUserPool;
    let userPoolClient: cognito.IUserPoolClient;
    
    if (props.existingUserPoolId && props.existingUserPoolClientId) {
      console.log(`   🔗 Importing existing Cognito User Pool: ${props.existingUserPoolId}`);
      userPool = cognito.UserPool.fromUserPoolId(this, 'ImportedUserPool', props.existingUserPoolId);
      userPoolClient = cognito.UserPoolClient.fromUserPoolClientId(this, 'ImportedUserPoolClient', props.existingUserPoolClientId);
    } else {
      console.log(`   🆕 Creating new Cognito User Pool for ${props.stage} environment`);
      userPool = new cognito.UserPool(this, 'UserPool', {
        userPoolName: getResourceName(props.stage, 'UserPool'),
        selfSignUpEnabled: true,
        signInAliases: { email: true },
        standardAttributes: {
          email: { required: true, mutable: true },
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

      userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
        userPool: userPool,
        userPoolClientName: getResourceName(props.stage, 'UserPoolClient'),
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

    return { userPool, userPoolClient };
  }

  private setupDynamoDBTables(): void {
    console.log('🗄️  Creating DynamoDB Tables...');
    
    const tableConfigs = [
      { key: 'Users', partitionKey: 'id' },
      { key: 'Conversations', partitionKey: 'id', sortKey: 'timestamp' },
      { key: 'Threads', partitionKey: 'id', sortKey: 'timestamp' },
      { key: 'Organizations', partitionKey: 'id' },
      { key: 'RateLimiting', partitionKey: 'key', sortKey: 'timestamp', ttl: 'ttl' },
    ];

    const stage = this.node.tryGetContext('env')?.stage || 'dev';
    tableConfigs.forEach(config => {
      const tableProps: dynamodb.TableProps = {
        tableName: getResourceName(stage, config.key),
        partitionKey: { name: config.partitionKey, type: dynamodb.AttributeType.STRING },
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
        pointInTimeRecovery: true,
        ...(config.sortKey && { sortKey: { name: config.sortKey, type: dynamodb.AttributeType.STRING } }),
        ...(config.ttl && { timeToLiveAttribute: config.ttl }),
      };

      this.dynamoDBTables[config.key] = new dynamodb.Table(this, `${config.key}Table`, tableProps);
    });
  }

  private setupS3Buckets(): void {
    console.log('🪣  Creating S3 Buckets...');
    
    const bucketConfigs = [
      { key: 'Storage', name: 'storage' },
      { key: 'EmailAttachments', name: 'email-attachments' },
    ];

    const stage = this.node.tryGetContext('env')?.stage || 'dev';
    bucketConfigs.forEach(config => {
      this.s3Buckets[config.key] = new s3.Bucket(this, `${config.key}Bucket`, {
        bucketName: getResourceName(stage, config.name).toLowerCase(),
        versioned: true,
        encryption: s3.BucketEncryption.S3_MANAGED,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
        autoDeleteObjects: false,
      });
    });
  }

  private setupSQSQueues(): sqs.IQueue {
    console.log('📬 Creating SQS Queues...');
    const stage = this.node.tryGetContext('env')?.stage || 'dev';
    
    return new sqs.Queue(this, 'EmailProcessQueue', {
      queueName: getResourceName(stage, 'EmailProcessQueue'),
      visibilityTimeout: cdk.Duration.minutes(5),
      retentionPeriod: cdk.Duration.days(14),
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
  }

  private setupLambdaFunctions(): void {
    console.log('⚡ Creating Lambda Functions...');
    
    // Example lambda functions - you can add more as needed
    const lambdaConfigs = [
      'LoginUser',
      'Authorize',
      'CreateNewSession',
      'DBSelect',
      'DBUpdate',
      'Send-Email',
      'GenerateEV',
    ];

    const stage = this.node.tryGetContext('env')?.stage || 'dev';
    lambdaConfigs.forEach(lambdaName => {
      this.lambdaFunctions[lambdaName] = new lambda.Function(this, `${lambdaName}Function`, {
        functionName: getResourceName(stage, lambdaName),
        runtime: this.detectRuntime(lambdaName),
        handler: this.getHandler(lambdaName),
        code: lambda.Code.fromAsset(`./lambdas/${lambdaName}`),
        memorySize: 256,
        timeout: cdk.Duration.minutes(1),
        environment: this.getSharedEnvironment(lambdaName),
      });

      // Grant permissions
      this.grantPermissions(this.lambdaFunctions[lambdaName]);
    });
  }

  private setupAPIGateway(): apigateway.RestApi {
    console.log('🌐 Creating API Gateway...');
    const stage = this.node.tryGetContext('env')?.stage || 'dev';
    
    return new apigateway.RestApi(this, 'ApiGateway', {
      restApiName: getResourceName(stage, 'ApiGateway'),
      description: `ACS API Gateway for ${stage} environment`,
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization', 'X-Amz-Date', 'X-Api-Key', 'X-Amz-Security-Token'],
      },
    });
  }

  private createApiRoutes(api: apigateway.RestApi): void {
    console.log('🛣️  Creating API Routes...');
    
    const routeMap = [
      { path: ['api', 'auth', 'login'], method: 'POST', lambda: 'LoginUser' },
      { path: ['api', 'auth', 'authorize'], method: 'POST', lambda: 'Authorize' },
      { path: ['api', 'auth', 'create-session'], method: 'POST', lambda: 'CreateNewSession' },
      { path: ['api', 'db', 'select'], method: 'POST', lambda: 'DBSelect' },
      { path: ['api', 'db', 'update'], method: 'POST', lambda: 'DBUpdate' },
      { path: ['api', 'email', 'send'], method: 'POST', lambda: 'Send-Email' },
      { path: ['api', 'ev', 'generate'], method: 'POST', lambda: 'GenerateEV' },
    ];

    routeMap.forEach(route => {
      const lambdaFunction = this.lambdaFunctions[route.lambda];
      if (!lambdaFunction) {
        console.warn(`⚠️  Lambda function ${route.lambda} not found for route ${route.path.join('/')}`);
        return;
      }

      this.create.createApiRoute(api, route.path, {
        method: route.method,
        lambdaFunction,
      });
    });
  }

  private grantPermissions(lambdaFunction: lambda.Function): void {
    // Grant Cognito permissions
    this.userPool.grant(lambdaFunction, 'cognito-idp:AdminCreateUser');
    this.userPool.grant(lambdaFunction, 'cognito-idp:AdminDeleteUser');
    this.userPool.grant(lambdaFunction, 'cognito-idp:AdminGetUser');
    this.userPool.grant(lambdaFunction, 'cognito-idp:AdminSetUserPassword');
    this.userPool.grant(lambdaFunction, 'cognito-idp:ListUsers');
    this.userPool.grant(lambdaFunction, 'cognito-idp:InitiateAuth');

    // Grant DynamoDB permissions
    Object.values(this.dynamoDBTables).forEach(table => {
      table.grantReadWriteData(lambdaFunction);
    });

    // Grant SQS permissions
    this.emailProcessQueue.grantConsumeMessages(lambdaFunction);
    this.emailProcessQueue.grantSendMessages(lambdaFunction);

    // Grant S3 permissions
    Object.values(this.s3Buckets).forEach(bucket => {
      bucket.grantReadWrite(lambdaFunction);
    });
  }

  private getSharedEnvironment(functionName: string): { [key: string]: string } {
    const stage = this.node.tryGetContext('env')?.stage || 'dev';
    
    return {
      STAGE: stage,
      AWS_ACCOUNT_ID: this.account,
      CDK_AWS_REGION: this.region,
      AUTH_BP: "xkirxcJV3gCa38",
      BUCKET_NAME: "xkirxcJV3gCa38",
      DB_SELECT_LAMBDA: getResourceName(stage, "DBSelect"),
      GENERATE_EV_LAMBDA_ARN: getResourceName(stage, "GenerateEV"),
      PROCESSING_LAMBDA_ARN: getResourceName(stage, "Send-Email"),
      QUEUE_URL: this.emailProcessQueue.queueUrl,
      SCHEDULER_ROLE_ARN: "arn:aws:iam::872515253712:role/SQS-SES-Handler",
      TAI_KEY: "2e1a1e910693ae18c09ad0585a7645e0f4595e90ec35bb366b6f5520221b6ca7",
      BEDROCK_MODEL_ARN: "arn:aws:bedrock:us-west-2::model/amazon.nova-premier-v1:0",
      COGNITO_USER_POOL_ID: this.userPool.userPoolId,
      COGNITO_CLIENT_ID: this.userPoolClient.userPoolClientId,
      COGNITO_CLIENT_SECRET: this.userPoolClient.userPoolClientSecret?.unsafeUnwrap() || '',
      RATE_LIMIT_AI: "100",
      RATE_LIMIT_AWS: "1000",
      RECAPTCHA_SECRET_KEY: "6LcdgD8rAAAAAMBJ_aCebuY5e_F-IfZjL-oAs9lo",
      // DynamoDB table names
      USERS_TABLE: this.dynamoDBTables['Users'].tableName,
      CONVERSATIONS_TABLE: this.dynamoDBTables['Conversations'].tableName,
      THREADS_TABLE: this.dynamoDBTables['Threads'].tableName,
      ORGANIZATIONS_TABLE: this.dynamoDBTables['Organizations'].tableName,
      RATE_LIMITING_TABLE: this.dynamoDBTables['RateLimiting'].tableName,
      // S3 bucket names
      STORAGE_BUCKET: this.s3Buckets['Storage'].bucketName,
      EMAIL_ATTACHMENTS_BUCKET: this.s3Buckets['EmailAttachments'].bucketName,
      // Lambda function names for cross-function communication
      ...Object.keys(this.lambdaFunctions).reduce((acc, name) => {
        acc[`${name.toUpperCase().replace(/-/g, '_')}_FUNCTION_NAME`] = getResourceName(stage, name);
        return acc;
      }, {} as { [key: string]: string }),
    };
  }

  private createStackOutputs(): void {
    const stage = this.node.tryGetContext('env')?.stage || 'dev';
    
    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: this.api.url,
      description: 'API Gateway URL',
      exportName: getResourceName(stage, 'ApiGatewayUrl'),
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: getResourceName(stage, 'UserPoolId'),
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: getResourceName(stage, 'UserPoolClientId'),
    });

    new cdk.CfnOutput(this, 'EmailProcessQueueUrl', {
      value: this.emailProcessQueue.queueUrl,
      description: 'Email Process Queue URL',
      exportName: getResourceName(stage, 'EmailProcessQueueUrl'),
    });

    Object.entries(this.dynamoDBTables).forEach(([name, table]) => {
      new cdk.CfnOutput(this, `${name}TableName`, {
        value: table.tableName,
        description: `${name} DynamoDB Table Name`,
        exportName: getResourceName(stage, `${name}TableName`),
      });
    });

    Object.entries(this.s3Buckets).forEach(([name, bucket]) => {
      new cdk.CfnOutput(this, `${name}BucketName`, {
        value: bucket.bucketName,
        description: `${name} S3 Bucket Name`,
        exportName: getResourceName(stage, `${name}BucketName`),
      });
    });
  }

  // Helper methods for auto-detection
  private detectRuntime(lambdaDir: string): lambda.Runtime {
    const fs = require('fs');
    const path = require('path');
    const lambdaPath = path.join(__dirname, `../lambdas/${lambdaDir}`);
    
    if (!fs.existsSync(lambdaPath)) {
      console.warn(`⚠️  Lambda directory ${lambdaPath} does not exist, defaulting to Node.js`);
      return lambda.Runtime.NODEJS_18_X;
    }
    
    const files = fs.readdirSync(lambdaPath);
    
    const hasPythonFiles = files.some((file: string) => 
      file.endsWith('.py') || file === 'requirements.txt'
    );
    
    const hasNodeFiles = files.some((file: string) => 
      file.endsWith('.js') || file.endsWith('.mjs') || file === 'package.json'
    );
    
    if (hasPythonFiles) {
      return lambda.Runtime.PYTHON_3_11;
    } else if (hasNodeFiles) {
      return lambda.Runtime.NODEJS_18_X;
    } else {
      return lambda.Runtime.NODEJS_18_X;
    }
  }

  private getHandler(lambdaDir: string): string {
    const fs = require('fs');
    const path = require('path');
    const lambdaPath = path.join(__dirname, `../lambdas/${lambdaDir}`);
    
    if (!fs.existsSync(lambdaPath)) {
      return 'index.handler';
    }
    
    const files = fs.readdirSync(lambdaPath);
    
    if (files.includes('lambda_function.py')) {
      return 'lambda_function.handler';
    } else if (files.includes('index.py')) {
      return 'index.handler';
    } else if (files.includes('index.js')) {
      return 'index.handler';
    } else if (files.includes('index.mjs')) {
      return 'index.handler';
    } else {
      const pyFile = files.find((file: string) => file.endsWith('.py'));
      if (pyFile) {
        return `${pyFile.replace('.py', '')}.handler`;
      }
      const jsFile = files.find((file: string) => file.endsWith('.js') || file.endsWith('.mjs'));
      if (jsFile) {
        return `${jsFile.replace('.js', '').replace('.mjs', '')}.handler`;
      }
    }
    
    return 'index.handler';
  }
} 