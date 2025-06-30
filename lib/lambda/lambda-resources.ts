import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import * as fs from 'fs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { ChangeAwareResources } from '../shared/change-aware-resources';

interface LambdaResourcesProps {
  stage: string;
  userPool: cognito.IUserPool;
  userPoolClient: cognito.IUserPoolClient;
  existingUserPoolClientSecret?: string;
  sharedDynamoDBTables: { [key: string]: dynamodb.ITable };
  sharedS3Buckets: { [key: string]: s3.IBucket };
  emailProcessQueue: sqs.IQueue;
  importExistingResources?: boolean;
}

export function createLambdaResources(scope: cdk.Stack, props: LambdaResourcesProps) {
  const { stage, userPool, userPoolClient, existingUserPoolClientSecret, sharedDynamoDBTables, sharedS3Buckets, emailProcessQueue, importExistingResources = false } = props;

  const getResourceName = (name: string) => {
    return name;
  };

  const detectRuntime = (lambdaDir: string): lambda.Runtime => {
    const lambdaPath = path.join(__dirname, `../../lambdas/${lambdaDir}`);
    const files = fs.readdirSync(lambdaPath);
    
    const hasPythonFiles = files.some(file => 
      file.endsWith('.py') || file === 'requirements.txt' || file === 'Pipfile'
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
  };

  const getHandler = (lambdaDir: string, runtime: lambda.Runtime): string => {
    const lambdaPath = path.join(__dirname, `../../lambdas/${lambdaDir}`);
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
  };

  const lambdaDirs = fs.readdirSync(path.join(__dirname, '../../lambdas')).filter(dir =>
    fs.statSync(path.join(__dirname, '../../lambdas', dir)).isDirectory()
  );

  const lambdaFunctions: { [key: string]: lambda.Function } = {};

  lambdaDirs.forEach((dirName: string) => {
    const runtime = detectRuntime(dirName);
    const handler = getHandler(dirName, runtime);
    
    // Use change-aware lambda creation
    const fn = ChangeAwareResources.createOptimizedLambdaFunction(scope, dirName, {
      functionName: getResourceName(dirName),
      runtime: runtime,
      handler: handler,
      code: lambda.Code.fromAsset(path.join(__dirname, `../../lambdas/${dirName}`)),
      memorySize: 256,
      timeout: cdk.Duration.minutes(1),
    });

    fn.role?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess")
    );

    userPool.grant(fn, 'cognito-idp:AdminCreateUser');
    userPool.grant(fn, 'cognito-idp:AdminDeleteUser');
    userPool.grant(fn, 'cognito-idp:AdminGetUser');
    userPool.grant(fn, 'cognito-idp:AdminSetUserPassword');
    userPool.grant(fn, 'cognito-idp:ListUsers');
    userPool.grant(fn, 'cognito-idp:InitiateAuth');

    lambdaFunctions[dirName] = fn;
  });

  const sharedEnv = {
    AUTH_BP: "xkirxcJV3gCa38",
    BUCKET_NAME: "xkirxcJV3gCa38",
    DB_SELECT_LAMBDA: getResourceName("DBSelect"),
    GENERATE_EV_LAMBDA_ARN: getResourceName("GenerateEV"),
    PROCESSING_LAMBDA_ARN: getResourceName("Send-Email"),
    QUEUE_URL: emailProcessQueue.queueUrl,
    SCHEDULER_ROLE_ARN: "arn:aws:iam::872515253712:role/SQS-SES-Handler",
    TAI_KEY: "2e1a1e910693ae18c09ad0585a7645e0f4595e90ec35bb366b6f5520221b6ca7",
    BEDROCK_MODEL_ARN: "arn:aws:bedrock:us-west-2::model/amazon.nova-premier-v1:0",
    COGNITO_USER_POOL_ID: userPool.userPoolId,
    COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
    COGNITO_CLIENT_SECRET: existingUserPoolClientSecret || userPoolClient.userPoolClientSecret?.unsafeUnwrap() || '',
    RATE_LIMIT_AI: "100",
    RATE_LIMIT_AWS: "1000",
    RECAPTCHA_SECRET_KEY: "6LcdgD8rAAAAAMBJ_aCebuY5e_F-IfZjL-oAs9lo",
    STAGE: stage,
    ALLOW_CORS_FUNCTION_NAME: getResourceName("Allow-Cors"),
    API_AUTHORIZER_FUNCTION_NAME: getResourceName("API-Authorizer"),
    AUTHORIZE_FUNCTION_NAME: getResourceName("Authorize"),
    CHECK_DOMAIN_STATUS_FUNCTION_NAME: getResourceName("Check-Domain-Status"),
    CREATE_SES_DKIM_RECORDS_FUNCTION_NAME: getResourceName("Create-SES-Dkim-Records"),
    CREATE_SES_IDENTITY_FUNCTION_NAME: getResourceName("Create-SES-Identity"),
    CREATE_NEW_SESSION_FUNCTION_NAME: getResourceName("CreateNewSession"),
    DB_BATCH_SELECT_FUNCTION_NAME: getResourceName("DBBatchSelect"),
    DB_DELETE_FUNCTION_NAME: getResourceName("DBDelete"),
    DB_SELECT_FUNCTION_NAME: getResourceName("DBSelect"),
    DB_UPDATE_FUNCTION_NAME: getResourceName("DBUpdate"),
    DELETE_USER_SUPABASE_FUNCTION_NAME: getResourceName("DeleteUserSupabase"),
    GENERATE_EMAIL_FUNCTION_NAME: getResourceName("GenerateEmail"),
    GET_CORS_FUNCTION_NAME: getResourceName("Get-Cors"),
    GET_THREAD_ATTRS_FUNCTION_NAME: getResourceName("getThreadAttrs"),
    GET_USER_CONVERSATIONS_FUNCTION_NAME: getResourceName("GetUserConversations"),
    LCP_LLM_RESPONSE_FUNCTION_NAME: getResourceName("LCPLlmResponse"),
    LOGIN_USER_FUNCTION_NAME: getResourceName("LoginUser"),
    ORGANIZATIONS_CRUD_FUNCTION_NAME: getResourceName("Organizations-Crud"),
    ORGANIZATIONS_INVITES_FUNCTION_NAME: getResourceName("Organizations-Invites"),
    ORGANIZATIONS_MEMBERS_FUNCTION_NAME: getResourceName("Organizations-Members"),
    PARSE_EVENT_FUNCTION_NAME: getResourceName("ParseEvent"),
    PROCESS_SQS_QUEUED_EMAILS_FUNCTION_NAME: getResourceName("Process-SQS-Queued-Emails"),
    PROCESS_NEW_USER_SUPABASE_FUNCTION_NAME: getResourceName("ProcessNewUserSupabase"),
    RATE_LIMIT_AI_FUNCTION_NAME: getResourceName("RateLimitAI"),
    RATE_LIMIT_AWS_FUNCTION_NAME: getResourceName("RateLimitAWS"),
    RETRIEVE_THREAD_INFORMATION_FUNCTION_NAME: getResourceName("Retrieve-Thread-Information"),
    SEND_EMAIL_FUNCTION_NAME: getResourceName("Send-Email"),
    TEST_SCHEDULER_FUNCTION_NAME: getResourceName("Test-Scheduler"),
    VERIFY_NEW_DOMAIN_VALID_FUNCTION_NAME: getResourceName("verifyNewDomainValid"),
  };

  Object.values(lambdaFunctions).forEach(fn => {
    fn.addEnvironment('STAGE', stage);
    Object.entries(sharedEnv).forEach(([key, value]) => {
      fn.addEnvironment(key, value);
    });
    
    fn.addEnvironment('CDK_AWS_REGION', scope.region);
    fn.addEnvironment('AWS_ACCOUNT_ID', scope.account);
  });

  const tables = Object.values(sharedDynamoDBTables);

  Object.values(lambdaFunctions).forEach(fn => {
    tables.forEach(table => {
      table.grantReadWriteData(fn);
    });
  });

  Object.values(lambdaFunctions).forEach(fn => {
    emailProcessQueue.grantConsumeMessages(fn);
    emailProcessQueue.grantSendMessages(fn);
  });

  Object.values(lambdaFunctions).forEach(fn => {
    Object.values(sharedS3Buckets).forEach(bucket => {
      bucket.grantReadWrite(fn);
    });
  });

  return {
    lambdaFunctions,
  };
} 