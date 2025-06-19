import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import * as fs from 'fs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';


export class Acsd2PStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);





  /////////////////////////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////////////////////////
  //////////////////////////////// API GATEWAY SETUP //////////////////////////////////
  /////////////////////////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////////////////////////

  const api = new apigateway.RestApi(this, 'ACS-Backend', {
    restApiName: 'ACS',
    description: 'ACS Backend Gateway',
    deployOptions: {
      stageName: this.node.tryGetContext('stage') || 'dev'
    },
    defaultCorsPreflightOptions: {
      allowOrigins: apigateway.Cors.ALL_ORIGINS,
      allowMethods: apigateway.Cors.ALL_METHODS,
    }
  });
  
  const routeMap = [
    { path: ['api', 'db', 'batch-select'], method: 'POST', lambda: "DBBatchSelect" },
    { path: ['users', 'auth', 'create'], method: 'POST', lambda: createUserFn },
    { path: ['users', 'status'], method: 'GET', lambda: statusFn },
    { path: ['api', 'db', 'create'], method: 'POST', lambda: createDbFn },
  ];

  routeMap.forEach(({ path, method, lambda }) => {
    let resource = api.root;
    for (const segment of path) {
      resource = resource.getResource(segment) ?? resource.addResource(segment);
    }
  
    const fn = lambdaFunctions[lambda];
    if (!fn) {
      throw new Error(`Lambda not found: ${lambda}`);
    }
  
    resource.addMethod(method, new apigateway.LambdaIntegration(fn, { proxy: true }));
  });
  













    ///////////////////////////////////////////////////////////////////////////////////
    ///////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////// LAMBDA FUNCTIONS ////////////////////////////////
    ///////////////////////////////////////////////////////////////////////////////////
    ///////////////////////////////////////////////////////////////////////////////////


    const lambdaDirs = fs.readdirSync(path.join(__dirname, '../lambdas')).filter(dir =>
      fs.statSync(path.join(__dirname, '../lambdas', dir)).isDirectory()
    );


    const sharedEnv = {
      AUTH_BP: "xkirxcJV3gCa38",
      BUCKET_NAME: "xkirxcJV3gCa38",
      DB_SELECT_LAMBDA: "DBSelect",
      GENERATE_EV_LAMBDA_ARN: "GenerateEV",
      LCP_LLM_RESPONSE_LAMBDA_ARN: "LcpLlmResponse",
      PROCESSING_LAMBDA_ARN: "arn:aws:lambda:us-east-2:872515253712:function:Send-Email",
      QUEUE_URL: "https://sqs.us-east-2.amazonaws.com/872515253712/EmailProcess",
      SCHEDULER_ROLE_ARN: "arn:aws:iam::872515253712:role/SQS-SES-Handler",
      TAI_KEY: "2e1a1e910693ae18c09ad0585a7645e0f4595e90ec35bb366b6f5520221b6ca7",
      BEDROCK_KB_ID: "ZKDSXKMOWG",
      BEDROCK_MODEL_ARN: "arn:aws:bedrock:us-west-2::model/amazon.nova-premier-v1:0",
      COGNITO_USER_POOL_ID: "us-east-2_aEJpSmRrg",
      COGNITO_CLIENT_ID: "2hobkr6air2b246q2hf1b3lntm",
      COGNITO_CLIENT_SECRET: "1nrgqi5a6ig6tjajlcvgu6b9j27iccla4nf6eq7rr8tqpemfd3d5",
      RATE_LIMIT_AI: "100",
      RATE_LIMIT_AWS: "1000",
      RECAPTCHA_SECRET_KEY: "6LcdgD8rAAAAAMBJ_aCebuY5e_F-IfZjL-oAs9lo"
    };
    

    lambdaDirs.forEach((dirName) => {
      const fn = new lambda.Function(this, `${dirName}`, {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'index.handler',
        code: lambda.Code.fromAsset(path.join(__dirname, `../lambdas/${dirName}`)),
        environment: sharedEnv,
        memorySize: 256,
        timeout: cdk.Duration.minutes(1),
      });

      fn.role?.addManagedPolicy(
        iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess")
      );
    });
  }
}
