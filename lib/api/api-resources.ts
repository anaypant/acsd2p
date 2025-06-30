import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';

interface ApiResourcesProps {
  stage: string;
  lambdaFunctions: { [key: string]: lambda.Function };
}

export function createApiResources(scope: cdk.Stack, props: ApiResourcesProps) {
  const { stage, lambdaFunctions } = props;

  // Create API Gateway
  const api = new apigateway.RestApi(scope, 'ApiGateway', {
    restApiName: `${stage}-ACS-API`,
    description: `ACS API Gateway for ${stage} environment`,
    defaultCorsPreflightOptions: {
      allowOrigins: apigateway.Cors.ALL_ORIGINS,
      allowMethods: apigateway.Cors.ALL_METHODS,
      allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
      allowCredentials: true,
    },
    deployOptions: {
      stageName: stage,
      loggingLevel: apigateway.MethodLoggingLevel.INFO,
      dataTraceEnabled: true,
    },
  });

  // Define routes
  const routeMap = [
    // Auth routes
    { path: ['api', 'auth', 'login'], method: 'POST', lambda: "LoginUser" },
    { path: ['api', 'auth', 'authorize'], method: 'POST', lambda: "Authorize" },
    { path: ['api', 'auth', 'create-session'], method: 'POST', lambda: "CreateNewSession" },
    
    // Database routes
    { path: ['api', 'db', 'select'], method: 'POST', lambda: "DBSelect" },
    { path: ['api', 'db', 'update'], method: 'POST', lambda: "DBUpdate" },
    { path: ['api', 'db', 'delete'], method: 'POST', lambda: "DBDelete" },
    { path: ['api', 'db', 'batch-select'], method: 'POST', lambda: "DBBatchSelect" },
    
    // Email routes
    { path: ['api', 'email', 'send'], method: 'POST', lambda: "Send-Email" },
    { path: ['api', 'email', 'generate'], method: 'POST', lambda: "GenerateEmail" },
    { path: ['api', 'email', 'process-queue'], method: 'POST', lambda: "Process-SQS-Queued-Emails" },
    
    // Thread routes
    { path: ['api', 'threads', 'get-all'], method: 'GET', lambda: "Retrieve-Thread-Information" },
    { path: ['api', 'threads', 'get-by-id'], method: 'GET', lambda: "Retrieve-Thread-Information" },
    { path: ['api', 'threads', 'get-attrs'], method: 'POST', lambda: "getThreadAttrs" },
    
    // User routes
    { path: ['api', 'users', 'conversations'], method: 'GET', lambda: "GetUserConversations" },
    { path: ['api', 'users', 'process-new'], method: 'POST', lambda: "ProcessNewUserSupabase" },
    { path: ['api', 'users', 'delete'], method: 'DELETE', lambda: "DeleteUserSupabase" },
    
    // Organization routes
    { path: ['api', 'organizations', 'crud'], method: 'POST', lambda: "Organizations-Crud" },
    { path: ['api', 'organizations', 'members'], method: 'POST', lambda: "Organizations-Members" },
    
    // AI/LLM routes
    { path: ['api', 'ai', 'llm-response'], method: 'POST', lambda: "LCPLlmResponse" },
    { path: ['api', 'ai', 'generate-ev'], method: 'POST', lambda: "GenerateEV" },
    
    // Rate limiting routes
    { path: ['api', 'rate-limit', 'ai'], method: 'POST', lambda: "RateLimitAI" },
    { path: ['api', 'rate-limit', 'aws'], method: 'POST', lambda: "RateLimitAWS" },
    
    // SES/Domain routes
    { path: ['api', 'ses', 'create-identity'], method: 'POST', lambda: "Create-SES-Identity" },
    { path: ['api', 'ses', 'create-dkim-records'], method: 'POST', lambda: "Create-SES-Dkim-Records" },
    { path: ['api', 'ses', 'check-domain-status'], method: 'POST', lambda: "Check-Domain-Status" },
    { path: ['api', 'ses', 'verify-domain'], method: 'POST', lambda: "verifyNewDomainValid" },
    
    // Utility routes
    { path: ['api', 'parse-event'], method: 'POST', lambda: "ParseEvent" },
    { path: ['api', 'cors', 'allow'], method: 'OPTIONS', lambda: "Allow-Cors" },
    { path: ['api', 'cors', 'get'], method: 'GET', lambda: "Get-Cors" },
    { path: ['api', 'test', 'scheduler'], method: 'POST', lambda: "Test-Scheduler" },
  ];

  // Create routes
  routeMap.forEach(route => {
    const lambdaFunction = lambdaFunctions[route.lambda];
    if (!lambdaFunction) {
      console.warn(`⚠️  Lambda function ${route.lambda} not found for route ${route.path.join('/')}`);
      return;
    }

    console.log(`   Creating route: ${route.method} /${route.path.join('/')} -> ${route.lambda}`);

    // Build the resource path
    let resource = api.root;
    route.path.forEach(pathPart => {
      const existingResource = resource.getResource(pathPart);
      if (existingResource) {
        resource = existingResource;
      } else {
        resource = resource.addResource(pathPart);
      }
    });

    // Check if OPTIONS method already exists (due to default CORS preflight options)
    if (route.method === 'OPTIONS') {
      // Check if OPTIONS method already exists by looking at the resource's children
      const resourceNode = resource.node;
      const existingMethods = resourceNode.children.filter(child => 
        child.node.id === 'OPTIONS'
      );
      
      if (existingMethods.length > 0) {
        console.log(`   ⚠️  OPTIONS method already exists for /${route.path.join('/')}, skipping custom OPTIONS route`);
        return;
      } else {
        console.log(`   Creating custom OPTIONS method for /${route.path.join('/')}`);
      }
    }

    // Add the method
    const integration = new apigateway.LambdaIntegration(lambdaFunction, {
      requestTemplates: {
        'application/json': JSON.stringify({
          body: '$input.body',
          headers: '$input.params().header',
          queryParams: '$input.params().querystring',
          pathParams: '$input.params().path',
        }),
      },
    });

    resource.addMethod(route.method, integration, {
      authorizationType: apigateway.AuthorizationType.NONE,
      methodResponses: [
        {
          statusCode: '200',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.Access-Control-Allow-Headers': true,
            'method.response.header.Access-Control-Allow-Methods': true,
          },
        },
        {
          statusCode: '400',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
        {
          statusCode: '500',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
      ],
    });
  });

  return {
    api,
  };
} 