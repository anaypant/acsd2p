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
exports.createApiResources = createApiResources;
const apigateway = __importStar(require("aws-cdk-lib/aws-apigateway"));
function createApiResources(scope, props) {
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
            }
            else {
                resource = resource.addResource(pathPart);
            }
        });
        // Check if OPTIONS method already exists (due to default CORS preflight options)
        if (route.method === 'OPTIONS') {
            // Check if OPTIONS method already exists by looking at the resource's children
            const resourceNode = resource.node;
            const existingMethods = resourceNode.children.filter(child => child.node.id === 'OPTIONS');
            if (existingMethods.length > 0) {
                console.log(`   ⚠️  OPTIONS method already exists for /${route.path.join('/')}, skipping custom OPTIONS route`);
                return;
            }
            else {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBpLXJlc291cmNlcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImFwaS1yZXNvdXJjZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQVNBLGdEQXdKQztBQWhLRCx1RUFBeUQ7QUFRekQsU0FBZ0Isa0JBQWtCLENBQUMsS0FBZ0IsRUFBRSxLQUF3QjtJQUMzRSxNQUFNLEVBQUUsS0FBSyxFQUFFLGVBQWUsRUFBRSxHQUFHLEtBQUssQ0FBQztJQUV6QyxxQkFBcUI7SUFDckIsTUFBTSxHQUFHLEdBQUcsSUFBSSxVQUFVLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxZQUFZLEVBQUU7UUFDdEQsV0FBVyxFQUFFLEdBQUcsS0FBSyxVQUFVO1FBQy9CLFdBQVcsRUFBRSx1QkFBdUIsS0FBSyxjQUFjO1FBQ3ZELDJCQUEyQixFQUFFO1lBQzNCLFlBQVksRUFBRSxVQUFVLENBQUMsSUFBSSxDQUFDLFdBQVc7WUFDekMsWUFBWSxFQUFFLFVBQVUsQ0FBQyxJQUFJLENBQUMsV0FBVztZQUN6QyxZQUFZLEVBQUUsVUFBVSxDQUFDLElBQUksQ0FBQyxlQUFlO1lBQzdDLGdCQUFnQixFQUFFLElBQUk7U0FDdkI7UUFDRCxhQUFhLEVBQUU7WUFDYixTQUFTLEVBQUUsS0FBSztZQUNoQixZQUFZLEVBQUUsVUFBVSxDQUFDLGtCQUFrQixDQUFDLElBQUk7WUFDaEQsZ0JBQWdCLEVBQUUsSUFBSTtTQUN2QjtLQUNGLENBQUMsQ0FBQztJQUVILGdCQUFnQjtJQUNoQixNQUFNLFFBQVEsR0FBRztRQUNmLGNBQWM7UUFDZCxFQUFFLElBQUksRUFBRSxDQUFDLEtBQUssRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFO1FBQ3ZFLEVBQUUsSUFBSSxFQUFFLENBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxXQUFXLENBQUMsRUFBRSxNQUFNLEVBQUUs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QVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxXQUFXLEVBQUU7WUFDNUMsaUJBQWlCLEVBQUUsVUFBVSxDQUFDLGlCQUFpQixDQUFDLElBQUk7WUFDcEQsZUFBZSxFQUFFO2dCQUNmO29CQUNFLFVBQVUsRUFBRSxLQUFLO29CQUNqQixrQkFBa0IsRUFBRTt3QkFDbEIsb0RBQW9ELEVBQUUsSUFBSTt3QkFDMUQscURBQXFELEVBQUUsSUFBSTt3QkFDM0QscURBQXFELEVBQUUsSUFBSTtxQkFDNUQ7aUJBQ0Y7Z0JBQ0Q7b0JBQ0UsVUFBVSxFQUFFLEtBQUs7b0JBQ2pCLGtCQUFrQixFQUFFO3dCQUNsQixvREFBb0QsRUFBRSxJQUFJO3FCQUMzRDtpQkFDRjtnQkFDRDtvQkFDRSxVQUFVLEVBQUUsS0FBSztvQkFDakIsa0JBQWtCLEVBQUU7d0JBQ2xCLG9EQUFvRCxFQUFFLElBQUk7cUJBQzNEO2lCQUNGO2FBQ0Y7U0FDRixDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILE9BQU87UUFDTCxHQUFHO0tBQ0osQ0FBQztBQUNKLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5JztcclxuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xyXG5cclxuaW50ZXJmYWNlIEFwaVJlc291cmNlc1Byb3BzIHtcclxuICBzdGFnZTogc3RyaW5nO1xyXG4gIGxhbWJkYUZ1bmN0aW9uczogeyBba2V5OiBzdHJpbmddOiBsYW1iZGEuRnVuY3Rpb24gfTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUFwaVJlc291cmNlcyhzY29wZTogY2RrLlN0YWNrLCBwcm9wczogQXBpUmVzb3VyY2VzUHJvcHMpIHtcclxuICBjb25zdCB7IHN0YWdlLCBsYW1iZGFGdW5jdGlvbnMgfSA9IHByb3BzO1xyXG5cclxuICAvLyBDcmVhdGUgQVBJIEdhdGV3YXlcclxuICBjb25zdCBhcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHNjb3BlLCAnQXBpR2F0ZXdheScsIHtcclxuICAgIHJlc3RBcGlOYW1lOiBgJHtzdGFnZX0tQUNTLUFQSWAsXHJcbiAgICBkZXNjcmlwdGlvbjogYEFDUyBBUEkgR2F0ZXdheSBmb3IgJHtzdGFnZX0gZW52aXJvbm1lbnRgLFxyXG4gICAgZGVmYXVsdENvcnNQcmVmbGlnaHRPcHRpb25zOiB7XHJcbiAgICAgIGFsbG93T3JpZ2luczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9PUklHSU5TLFxyXG4gICAgICBhbGxvd01ldGhvZHM6IGFwaWdhdGV3YXkuQ29ycy5BTExfTUVUSE9EUyxcclxuICAgICAgYWxsb3dIZWFkZXJzOiBhcGlnYXRld2F5LkNvcnMuREVGQVVMVF9IRUFERVJTLFxyXG4gICAgICBhbGxvd0NyZWRlbnRpYWxzOiB0cnVlLFxyXG4gICAgfSxcclxuICAgIGRlcGxveU9wdGlvbnM6IHtcclxuICAgICAgc3RhZ2VOYW1lOiBzdGFnZSxcclxuICAgICAgbG9nZ2luZ0xldmVsOiBhcGlnYXRld2F5Lk1ldGhvZExvZ2dpbmdMZXZlbC5JTkZPLFxyXG4gICAgICBkYXRhVHJhY2VFbmFibGVkOiB0cnVlLFxyXG4gICAgfSxcclxuICB9KTtcclxuXHJcbiAgLy8gRGVmaW5lIHJvdXRlc1xyXG4gIGNvbnN0IHJvdXRlTWFwID0gW1xyXG4gICAgLy8gQXV0aCByb3V0ZXNcclxuICAgIHsgcGF0aDogWydhcGknLCAnYXV0aCcsICdsb2dpbiddLCBtZXRob2Q6ICdQT1NUJywgbGFtYmRhOiBcIkxvZ2luVXNlclwiIH0sXHJcbiAgICB7IHBhdGg6IFsnYXBpJywgJ2F1dGgnLCAnYXV0aG9yaXplJ10sIG1ldGhvZDogJ1BPU1QnLCBsYW1iZGE6IFwiQXV0aG9yaXplXCIgfSxcclxuICAgIHsgcGF0aDogWydhcGknLCAnYXV0aCcsICdjcmVhdGUtc2Vzc2lvbiddLCBtZXRob2Q6ICdQT1NUJywgbGFtYmRhOiBcIkNyZWF0ZU5ld1Nlc3Npb25cIiB9LFxyXG4gICAgXHJcbiAgICAvLyBEYXRhYmFzZSByb3V0ZXNcclxuICAgIHsgcGF0aDogWydhcGknLCAnZGInLCAnc2VsZWN0J10sIG1ldGhvZDogJ1BPU1QnLCBsYW1iZGE6IFwiREJTZWxlY3RcIiB9LFxyXG4gICAgeyBwYXRoOiBbJ2FwaScsICdkYicsICd1cGRhdGUnXSwgbWV0aG9kOiAnUE9TVCcsIGxhbWJkYTogXCJEQlVwZGF0ZVwiIH0sXHJcbiAgICB7IHBhdGg6IFsnYXBpJywgJ2RiJywgJ2RlbGV0ZSddLCBtZXRob2Q6ICdQT1NUJywgbGFtYmRhOiBcIkRCRGVsZXRlXCIgfSxcclxuICAgIHsgcGF0aDogWydhcGknLCAnZGInLCAnYmF0Y2gtc2VsZWN0J10sIG1ldGhvZDogJ1BPU1QnLCBsYW1iZGE6IFwiREJCYXRjaFNlbGVjdFwiIH0sXHJcbiAgICBcclxuICAgIC8vIEVtYWlsIHJvdXRlc1xyXG4gICAgeyBwYXRoOiBbJ2FwaScsICdlbWFpbCcsICdzZW5kJ10sIG1ldGhvZDogJ1BPU1QnLCBsYW1iZGE6IFwiU2VuZC1FbWFpbFwiIH0sXHJcbiAgICB7IHBhdGg6IFsnYXBpJywgJ2VtYWlsJywgJ2dlbmVyYXRlJ10sIG1ldGhvZDogJ1BPU1QnLCBsYW1iZGE6IFwiR2VuZXJhdGVFbWFpbFwiIH0sXHJcbiAgICB7IHBhdGg6IFsnYXBpJywgJ2VtYWlsJywgJ3Byb2Nlc3MtcXVldWUnXSwgbWV0aG9kOiAnUE9TVCcsIGxhbWJkYTogXCJQcm9jZXNzLVNRUy1RdWV1ZWQtRW1haWxzXCIgfSxcclxuICAgIFxyXG4gICAgLy8gVGhyZWFkIHJvdXRlc1xyXG4gICAgeyBwYXRoOiBbJ2FwaScsICd0aHJlYWRzJywgJ2dldC1hbGwnXSwgbWV0aG9kOiAnR0VUJywgbGFtYmRhOiBcIlJldHJpZXZlLVRocmVhZC1JbmZvcm1hdGlvblwiIH0sXHJcbiAgICB7IHBhdGg6IFsnYXBpJywgJ3RocmVhZHMnLCAnZ2V0LWJ5LWlkJ10sIG1ldGhvZDogJ0dFVCcsIGxhbWJkYTogXCJSZXRyaWV2ZS1UaHJlYWQtSW5mb3JtYXRpb25cIiB9LFxyXG4gICAgeyBwYXRoOiBbJ2FwaScsICd0aHJlYWRzJywgJ2dldC1hdHRycyddLCBtZXRob2Q6ICdQT1NUJywgbGFtYmRhOiBcImdldFRocmVhZEF0dHJzXCIgfSxcclxuICAgIFxyXG4gICAgLy8gVXNlciByb3V0ZXNcclxuICAgIHsgcGF0aDogWydhcGknLCAndXNlcnMnLCAnY29udmVyc2F0aW9ucyddLCBtZXRob2Q6ICdHRVQnLCBsYW1iZGE6IFwiR2V0VXNlckNvbnZlcnNhdGlvbnNcIiB9LFxyXG4gICAgeyBwYXRoOiBbJ2FwaScsICd1c2VycycsICdwcm9jZXNzLW5ldyddLCBtZXRob2Q6ICdQT1NUJywgbGFtYmRhOiBcIlByb2Nlc3NOZXdVc2VyU3VwYWJhc2VcIiB9LFxyXG4gICAgeyBwYXRoOiBbJ2FwaScsICd1c2VycycsICdkZWxldGUnXSwgbWV0aG9kOiAnREVMRVRFJywgbGFtYmRhOiBcIkRlbGV0ZVVzZXJTdXBhYmFzZVwiIH0sXHJcbiAgICBcclxuICAgIC8vIE9yZ2FuaXphdGlvbiByb3V0ZXNcclxuICAgIHsgcGF0aDogWydhcGknLCAnb3JnYW5pemF0aW9ucycsICdjcnVkJ10sIG1ldGhvZDogJ1BPU1QnLCBsYW1iZGE6IFwiT3JnYW5pemF0aW9ucy1DcnVkXCIgfSxcclxuICAgIHsgcGF0aDogWydhcGknLCAnb3JnYW5pemF0aW9ucycsICdtZW1iZXJzJ10sIG1ldGhvZDogJ1BPU1QnLCBsYW1iZGE6IFwiT3JnYW5pemF0aW9ucy1NZW1iZXJzXCIgfSxcclxuICAgIFxyXG4gICAgLy8gQUkvTExNIHJvdXRlc1xyXG4gICAgeyBwYXRoOiBbJ2FwaScsICdhaScsICdsbG0tcmVzcG9uc2UnXSwgbWV0aG9kOiAnUE9TVCcsIGxhbWJkYTogXCJMQ1BMbG1SZXNwb25zZVwiIH0sXHJcbiAgICB7IHBhdGg6IFsnYXBpJywgJ2FpJywgJ2dlbmVyYXRlLWV2J10sIG1ldGhvZDogJ1BPU1QnLCBsYW1iZGE6IFwiR2VuZXJhdGVFVlwiIH0sXHJcbiAgICBcclxuICAgIC8vIFJhdGUgbGltaXRpbmcgcm91dGVzXHJcbiAgICB7IHBhdGg6IFsnYXBpJywgJ3JhdGUtbGltaXQnLCAnYWknXSwgbWV0aG9kOiAnUE9TVCcsIGxhbWJkYTogXCJSYXRlTGltaXRBSVwiIH0sXHJcbiAgICB7IHBhdGg6IFsnYXBpJywgJ3JhdGUtbGltaXQnLCAnYXdzJ10sIG1ldGhvZDogJ1BPU1QnLCBsYW1iZGE6IFwiUmF0ZUxpbWl0QVdTXCIgfSxcclxuICAgIFxyXG4gICAgLy8gU0VTL0RvbWFpbiByb3V0ZXNcclxuICAgIHsgcGF0aDogWydhcGknLCAnc2VzJywgJ2NyZWF0ZS1pZGVudGl0eSddLCBtZXRob2Q6ICdQT1NUJywgbGFtYmRhOiBcIkNyZWF0ZS1TRVMtSWRlbnRpdHlcIiB9LFxyXG4gICAgeyBwYXRoOiBbJ2FwaScsICdzZXMnLCAnY3JlYXRlLWRraW0tcmVjb3JkcyddLCBtZXRob2Q6ICdQT1NUJywgbGFtYmRhOiBcIkNyZWF0ZS1TRVMtRGtpbS1SZWNvcmRzXCIgfSxcclxuICAgIHsgcGF0aDogWydhcGknLCAnc2VzJywgJ2NoZWNrLWRvbWFpbi1zdGF0dXMnXSwgbWV0aG9kOiAnUE9TVCcsIGxhbWJkYTogXCJDaGVjay1Eb21haW4tU3RhdHVzXCIgfSxcclxuICAgIHsgcGF0aDogWydhcGknLCAnc2VzJywgJ3ZlcmlmeS1kb21haW4nXSwgbWV0aG9kOiAnUE9TVCcsIGxhbWJkYTogXCJ2ZXJpZnlOZXdEb21haW5WYWxpZFwiIH0sXHJcbiAgICBcclxuICAgIC8vIFV0aWxpdHkgcm91dGVzXHJcbiAgICB7IHBhdGg6IFsnYXBpJywgJ3BhcnNlLWV2ZW50J10sIG1ldGhvZDogJ1BPU1QnLCBsYW1iZGE6IFwiUGFyc2VFdmVudFwiIH0sXHJcbiAgICB7IHBhdGg6IFsnYXBpJywgJ2NvcnMnLCAnYWxsb3cnXSwgbWV0aG9kOiAnT1BUSU9OUycsIGxhbWJkYTogXCJBbGxvdy1Db3JzXCIgfSxcclxuICAgIHsgcGF0aDogWydhcGknLCAnY29ycycsICdnZXQnXSwgbWV0aG9kOiAnR0VUJywgbGFtYmRhOiBcIkdldC1Db3JzXCIgfSxcclxuICAgIHsgcGF0aDogWydhcGknLCAndGVzdCcsICdzY2hlZHVsZXInXSwgbWV0aG9kOiAnUE9TVCcsIGxhbWJkYTogXCJUZXN0LVNjaGVkdWxlclwiIH0sXHJcbiAgXTtcclxuXHJcbiAgLy8gQ3JlYXRlIHJvdXRlc1xyXG4gIHJvdXRlTWFwLmZvckVhY2gocm91dGUgPT4ge1xyXG4gICAgY29uc3QgbGFtYmRhRnVuY3Rpb24gPSBsYW1iZGFGdW5jdGlvbnNbcm91dGUubGFtYmRhXTtcclxuICAgIGlmICghbGFtYmRhRnVuY3Rpb24pIHtcclxuICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gIExhbWJkYSBmdW5jdGlvbiAke3JvdXRlLmxhbWJkYX0gbm90IGZvdW5kIGZvciByb3V0ZSAke3JvdXRlLnBhdGguam9pbignLycpfWApO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgY29uc29sZS5sb2coYCAgIENyZWF0aW5nIHJvdXRlOiAke3JvdXRlLm1ldGhvZH0gLyR7cm91dGUucGF0aC5qb2luKCcvJyl9IC0+ICR7cm91dGUubGFtYmRhfWApO1xyXG5cclxuICAgIC8vIEJ1aWxkIHRoZSByZXNvdXJjZSBwYXRoXHJcbiAgICBsZXQgcmVzb3VyY2UgPSBhcGkucm9vdDtcclxuICAgIHJvdXRlLnBhdGguZm9yRWFjaChwYXRoUGFydCA9PiB7XHJcbiAgICAgIGNvbnN0IGV4aXN0aW5nUmVzb3VyY2UgPSByZXNvdXJjZS5nZXRSZXNvdXJjZShwYXRoUGFydCk7XHJcbiAgICAgIGlmIChleGlzdGluZ1Jlc291cmNlKSB7XHJcbiAgICAgICAgcmVzb3VyY2UgPSBleGlzdGluZ1Jlc291cmNlO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHJlc291cmNlID0gcmVzb3VyY2UuYWRkUmVzb3VyY2UocGF0aFBhcnQpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDaGVjayBpZiBPUFRJT05TIG1ldGhvZCBhbHJlYWR5IGV4aXN0cyAoZHVlIHRvIGRlZmF1bHQgQ09SUyBwcmVmbGlnaHQgb3B0aW9ucylcclxuICAgIGlmIChyb3V0ZS5tZXRob2QgPT09ICdPUFRJT05TJykge1xyXG4gICAgICAvLyBDaGVjayBpZiBPUFRJT05TIG1ldGhvZCBhbHJlYWR5IGV4aXN0cyBieSBsb29raW5nIGF0IHRoZSByZXNvdXJjZSdzIGNoaWxkcmVuXHJcbiAgICAgIGNvbnN0IHJlc291cmNlTm9kZSA9IHJlc291cmNlLm5vZGU7XHJcbiAgICAgIGNvbnN0IGV4aXN0aW5nTWV0aG9kcyA9IHJlc291cmNlTm9kZS5jaGlsZHJlbi5maWx0ZXIoY2hpbGQgPT4gXHJcbiAgICAgICAgY2hpbGQubm9kZS5pZCA9PT0gJ09QVElPTlMnXHJcbiAgICAgICk7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoZXhpc3RpbmdNZXRob2RzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhgICAg4pqg77iPICBPUFRJT05TIG1ldGhvZCBhbHJlYWR5IGV4aXN0cyBmb3IgLyR7cm91dGUucGF0aC5qb2luKCcvJyl9LCBza2lwcGluZyBjdXN0b20gT1BUSU9OUyByb3V0ZWApO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhgICAgQ3JlYXRpbmcgY3VzdG9tIE9QVElPTlMgbWV0aG9kIGZvciAvJHtyb3V0ZS5wYXRoLmpvaW4oJy8nKX1gKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIEFkZCB0aGUgbWV0aG9kXHJcbiAgICBjb25zdCBpbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGxhbWJkYUZ1bmN0aW9uLCB7XHJcbiAgICAgIHJlcXVlc3RUZW1wbGF0ZXM6IHtcclxuICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5KHtcclxuICAgICAgICAgIGJvZHk6ICckaW5wdXQuYm9keScsXHJcbiAgICAgICAgICBoZWFkZXJzOiAnJGlucHV0LnBhcmFtcygpLmhlYWRlcicsXHJcbiAgICAgICAgICBxdWVyeVBhcmFtczogJyRpbnB1dC5wYXJhbXMoKS5xdWVyeXN0cmluZycsXHJcbiAgICAgICAgICBwYXRoUGFyYW1zOiAnJGlucHV0LnBhcmFtcygpLnBhdGgnLFxyXG4gICAgICAgIH0pLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgcmVzb3VyY2UuYWRkTWV0aG9kKHJvdXRlLm1ldGhvZCwgaW50ZWdyYXRpb24sIHtcclxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuTk9ORSxcclxuICAgICAgbWV0aG9kUmVzcG9uc2VzOiBbXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgc3RhdHVzQ29kZTogJzIwMCcsXHJcbiAgICAgICAgICByZXNwb25zZVBhcmFtZXRlcnM6IHtcclxuICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogdHJ1ZSxcclxuICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6IHRydWUsXHJcbiAgICAgICAgICAgICdtZXRob2QucmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHMnOiB0cnVlLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICB9LFxyXG4gICAgICAgIHtcclxuICAgICAgICAgIHN0YXR1c0NvZGU6ICc0MDAnLFxyXG4gICAgICAgICAgcmVzcG9uc2VQYXJhbWV0ZXJzOiB7XHJcbiAgICAgICAgICAgICdtZXRob2QucmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6IHRydWUsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgc3RhdHVzQ29kZTogJzUwMCcsXHJcbiAgICAgICAgICByZXNwb25zZVBhcmFtZXRlcnM6IHtcclxuICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogdHJ1ZSxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgfSxcclxuICAgICAgXSxcclxuICAgIH0pO1xyXG4gIH0pO1xyXG5cclxuICByZXR1cm4ge1xyXG4gICAgYXBpLFxyXG4gIH07XHJcbn0gIl19