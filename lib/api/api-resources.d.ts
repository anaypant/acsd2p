import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
interface ApiResourcesProps {
    stage: string;
    lambdaFunctions: {
        [key: string]: lambda.Function;
    };
}
export declare function createApiResources(scope: cdk.Stack, props: ApiResourcesProps): {
    api: cdk.aws_apigateway.RestApi;
};
export {};
