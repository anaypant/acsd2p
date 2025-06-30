import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import * as fs from 'fs';
import { Construct } from 'constructs';
import { getResourceName } from './resource-namer';

export interface LambdaParams {
  runtime?: lambda.Runtime;
  handler?: string;
  codePath?: string;
  memorySize?: number;
  timeout?: cdk.Duration;
  environment?: { [key: string]: string };
  description?: string;
  layers?: lambda.ILayerVersion[];
  reservedConcurrentExecutions?: number;
}

export interface TableParams {
  partitionKey: { name: string; type: dynamodb.AttributeType };
  sortKey?: { name: string; type: dynamodb.AttributeType };
  billingMode?: dynamodb.BillingMode;
  removalPolicy?: cdk.RemovalPolicy;
  pointInTimeRecovery?: boolean;
  timeToLiveAttribute?: string;
  stream?: dynamodb.StreamViewType;
  contributorInsightsEnabled?: boolean;
  encryption?: dynamodb.TableEncryption;
}

export interface ApiRouteParams {
  method: string;
  lambdaFunction: lambda.IFunction;
  authorizationType?: apigateway.AuthorizationType;
  authorizer?: apigateway.IAuthorizer;
  requestValidator?: apigateway.IRequestValidator;
  requestModels?: { [param: string]: apigateway.IModel };
  requestParameters?: { [param: string]: boolean };
  methodResponses?: apigateway.MethodResponse[];
}

export interface S3BucketParams {
  versioned?: boolean;
  encryption?: s3.BucketEncryption;
  blockPublicAccess?: s3.BlockPublicAccess;
  removalPolicy?: cdk.RemovalPolicy;
  autoDeleteObjects?: boolean;
  lifecycleRules?: s3.LifecycleRule[];
  cors?: s3.CorsRule[];
}

export interface SQSQueueParams {
  visibilityTimeout?: cdk.Duration;
  retentionPeriod?: cdk.Duration;
  removalPolicy?: cdk.RemovalPolicy;
  deadLetterQueue?: sqs.DeadLetterQueue;
  encryption?: sqs.QueueEncryption;
  fifo?: boolean;
  contentBasedDeduplication?: boolean;
}

export interface CognitoUserPoolParams {
  selfSignUpEnabled?: boolean;
  signInAliases?: cognito.SignInAliases;
  standardAttributes?: cognito.StandardAttributes;
  passwordPolicy?: cognito.PasswordPolicy;
  accountRecovery?: cognito.AccountRecovery;
  removalPolicy?: cdk.RemovalPolicy;
  mfa?: cognito.Mfa;
  userVerification?: cognito.UserVerificationConfig;
}

export class Create {
  private scope: Construct;
  private stage: string;
  private account: string;
  private region: string;

  constructor(scope: Construct, stage: string, account: string, region: string) {
    this.scope = scope;
    this.stage = stage;
    this.account = account;
    this.region = region;
  }

  private async checkResourceExists(resourceType: string, resourceName: string): Promise<boolean> {
    try {
      // For now, we'll use a simpler approach that doesn't require AWS SDK
      // In a real implementation, you'd want to use AWS SDK to check existence
      console.log(`   🔍 Checking ${resourceType} resource: ${resourceName} (simulated check)`);
      
      // Simulate resource existence check - in practice, you'd make actual AWS API calls
      // For now, we'll assume resources don't exist to avoid conflicts
      return false;
    } catch (error: any) {
      console.warn(`⚠️  Error checking ${resourceType} resource ${resourceName}:`, error.message);
      return false;
    }
  }

  public async createLambda(name: string, params: LambdaParams = {}): Promise<lambda.IFunction> {
    const functionName = getResourceName(this.stage, name);
    const logicalId = `${name}Function`;
    
    console.log(`🔍 Checking if Lambda function ${functionName} exists...`);
    const exists = await this.checkResourceExists('lambda', functionName);
    
    if (exists) {
      console.log(`   🔗 Importing existing Lambda function: ${functionName}`);
      return lambda.Function.fromFunctionName(
        this.scope,
        logicalId,
        functionName
      );
    } else {
      console.log(`   🆕 Creating new Lambda function: ${functionName}`);
      
      // Auto-detect runtime and handler if not provided
      const runtime = params.runtime || this.detectRuntime(name);
      const handler = params.handler || this.getHandler(name, runtime);
      const codePath = params.codePath || path.join(__dirname, `../lambdas/${name}`);
      
      return new lambda.Function(this.scope, logicalId, {
        functionName,
        runtime,
        handler,
        code: lambda.Code.fromAsset(codePath),
        memorySize: params.memorySize || 256,
        timeout: params.timeout || cdk.Duration.minutes(1),
        environment: params.environment || {},
        description: params.description,
        layers: params.layers,
        reservedConcurrentExecutions: params.reservedConcurrentExecutions,
      });
    }
  }

  public async createTable(name: string, params: TableParams): Promise<dynamodb.ITable> {
    const tableName = getResourceName(this.stage, name);
    const logicalId = `${name}Table`;
    
    console.log(`🔍 Checking if DynamoDB table ${tableName} exists...`);
    const exists = await this.checkResourceExists('dynamodb', tableName);
    
    if (exists) {
      console.log(`   🔗 Importing existing DynamoDB table: ${tableName}`);
      return dynamodb.Table.fromTableName(
        this.scope,
        logicalId,
        tableName
      );
    } else {
      console.log(`   🆕 Creating new DynamoDB table: ${tableName}`);
      
      const tableProps: dynamodb.TableProps = {
        tableName,
        partitionKey: params.partitionKey,
        sortKey: params.sortKey,
        billingMode: params.billingMode || dynamodb.BillingMode.PAY_PER_REQUEST,
        removalPolicy: params.removalPolicy || cdk.RemovalPolicy.RETAIN,
        pointInTimeRecovery: params.pointInTimeRecovery !== false,
        timeToLiveAttribute: params.timeToLiveAttribute,
        stream: params.stream,
        contributorInsightsEnabled: params.contributorInsightsEnabled,
        encryption: params.encryption || dynamodb.TableEncryption.AWS_MANAGED,
      };

      return new dynamodb.Table(this.scope, logicalId, tableProps);
    }
  }

  public async createS3Bucket(name: string, params: S3BucketParams = {}): Promise<s3.IBucket> {
    const bucketName = getResourceName(this.stage, name).toLowerCase();
    const logicalId = `${name}Bucket`;
    
    console.log(`🔍 Checking if S3 bucket ${bucketName} exists...`);
    const exists = await this.checkResourceExists('s3', bucketName);
    
    if (exists) {
      console.log(`   🔗 Importing existing S3 bucket: ${bucketName}`);
      return s3.Bucket.fromBucketName(
        this.scope,
        logicalId,
        bucketName
      );
    } else {
      console.log(`   🆕 Creating new S3 bucket: ${bucketName}`);
      
      const bucketProps: s3.BucketProps = {
        bucketName,
        versioned: params.versioned !== false,
        encryption: params.encryption || s3.BucketEncryption.S3_MANAGED,
        blockPublicAccess: params.blockPublicAccess || s3.BlockPublicAccess.BLOCK_ALL,
        removalPolicy: params.removalPolicy || cdk.RemovalPolicy.RETAIN,
        autoDeleteObjects: params.autoDeleteObjects || false,
        lifecycleRules: params.lifecycleRules,
        cors: params.cors,
      };

      return new s3.Bucket(this.scope, logicalId, bucketProps);
    }
  }

  public async createSQSQueue(name: string, params: SQSQueueParams = {}): Promise<sqs.IQueue> {
    const queueName = getResourceName(this.stage, name);
    const logicalId = `${name}Queue`;
    
    console.log(`🔍 Checking if SQS queue ${queueName} exists...`);
    const exists = await this.checkResourceExists('sqs', queueName);
    
    if (exists) {
      console.log(`   🔗 Importing existing SQS queue: ${queueName}`);
      return sqs.Queue.fromQueueArn(
        this.scope,
        logicalId,
        `arn:aws:sqs:${this.region}:${this.account}:${queueName}`
      );
    } else {
      console.log(`   🆕 Creating new SQS queue: ${queueName}`);
      
      return new sqs.Queue(this.scope, logicalId, {
        queueName,
        visibilityTimeout: params.visibilityTimeout || cdk.Duration.minutes(5),
        retentionPeriod: params.retentionPeriod || cdk.Duration.days(14),
        removalPolicy: params.removalPolicy || cdk.RemovalPolicy.RETAIN,
        deadLetterQueue: params.deadLetterQueue,
        encryption: params.encryption || sqs.QueueEncryption.SQS_MANAGED,
        fifo: params.fifo || false,
        contentBasedDeduplication: params.contentBasedDeduplication,
      });
    }
  }

  public async createCognitoUserPool(name: string, params: CognitoUserPoolParams = {}): Promise<cognito.IUserPool> {
    const userPoolName = getResourceName(this.stage, name);
    const logicalId = `${name}UserPool`;
    
    console.log(`🔍 Checking if Cognito User Pool ${userPoolName} exists...`);
    const exists = await this.checkResourceExists('cognito', userPoolName);
    
    if (exists) {
      console.log(`   🔗 Importing existing Cognito User Pool: ${userPoolName}`);
      // Note: You'd need the actual User Pool ID to import
      throw new Error('Importing existing Cognito User Pool requires the User Pool ID');
    } else {
      console.log(`   🆕 Creating new Cognito User Pool: ${userPoolName}`);
      
      return new cognito.UserPool(this.scope, logicalId, {
        userPoolName,
        selfSignUpEnabled: params.selfSignUpEnabled !== false,
        signInAliases: params.signInAliases || { email: true },
        standardAttributes: params.standardAttributes,
        passwordPolicy: params.passwordPolicy || {
          minLength: 8,
          requireLowercase: true,
          requireUppercase: true,
          requireDigits: true,
          requireSymbols: true,
        },
        accountRecovery: params.accountRecovery || cognito.AccountRecovery.EMAIL_ONLY,
        removalPolicy: params.removalPolicy || cdk.RemovalPolicy.RETAIN,
        mfa: params.mfa,
        userVerification: params.userVerification,
      });
    }
  }

  public createApiRoute(
    api: apigateway.RestApi,
    pathParts: string[],
    params: ApiRouteParams
  ): apigateway.Method {
    const routePath = pathParts.join('/');
    const logicalId = `${pathParts.join('')}Route`;
    
    console.log(`   🌐 Creating API route: ${routePath} (${params.method})`);
    
    let resource = api.root;
    pathParts.forEach(pathPart => {
      const existingResource = resource.getResource(pathPart);
      if (existingResource) {
        resource = existingResource;
      } else {
        resource = resource.addResource(pathPart);
      }
    });

    const integration = new apigateway.LambdaIntegration(params.lambdaFunction);
    
    return resource.addMethod(params.method, integration, {
      authorizationType: params.authorizationType,
      authorizer: params.authorizer,
      requestValidator: params.requestValidator,
      requestModels: params.requestModels,
      requestParameters: params.requestParameters,
      methodResponses: params.methodResponses,
    });
  }

  public createIAMRole(name: string, params: {
    assumedBy: iam.IPrincipal;
    managedPolicies?: iam.IManagedPolicy[];
    inlinePolicies?: { [name: string]: iam.PolicyDocument };
    description?: string;
  }): iam.IRole {
    const roleName = getResourceName(this.stage, name);
    const logicalId = `${name}Role`;
    
    console.log(`   🔐 Creating IAM role: ${roleName}`);
    
    return new iam.Role(this.scope, logicalId, {
      roleName,
      assumedBy: params.assumedBy,
      managedPolicies: params.managedPolicies,
      inlinePolicies: params.inlinePolicies,
      description: params.description,
    });
  }

  // Helper methods for auto-detection
  private detectRuntime(lambdaDir: string): lambda.Runtime {
    const lambdaPath = path.join(__dirname, `../lambdas/${lambdaDir}`);
    
    if (!fs.existsSync(lambdaPath)) {
      console.warn(`⚠️  Lambda directory ${lambdaPath} does not exist, defaulting to Node.js`);
      return lambda.Runtime.NODEJS_18_X;
    }
    
    const files = fs.readdirSync(lambdaPath);
    
    const hasPythonFiles = files.some(file => 
      file.endsWith('.py') || file === 'requirements.txt'
    );
    
    const hasNodeFiles = files.some(file => 
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

  private getHandler(lambdaDir: string, runtime: lambda.Runtime): string {
    const lambdaPath = path.join(__dirname, `../lambdas/${lambdaDir}`);
    
    if (!fs.existsSync(lambdaPath)) {
      return runtime === lambda.Runtime.PYTHON_3_11 ? 'lambda_function.handler' : 'index.handler';
    }
    
    const files = fs.readdirSync(lambdaPath);
    
    if (runtime === lambda.Runtime.PYTHON_3_11) {
      if (files.includes('lambda_function.py')) {
        return 'lambda_function.handler';
      } else if (files.includes('index.py')) {
        return 'index.handler';
      } else {
        const pyFile = files.find(file => file.endsWith('.py'));
        if (pyFile) {
          return `${pyFile.replace('.py', '')}.handler`;
        }
      }
    } else {
      if (files.includes('index.js')) {
        return 'index.handler';
      } else if (files.includes('index.mjs')) {
        return 'index.handler';
      } else {
        const jsFile = files.find(file => file.endsWith('.js') || file.endsWith('.mjs'));
        if (jsFile) {
          return `${jsFile.replace('.js', '').replace('.mjs', '')}.handler`;
        }
      }
    }
    
    return runtime === lambda.Runtime.PYTHON_3_11 ? 'lambda_function.handler' : 'index.handler';
  }
} 