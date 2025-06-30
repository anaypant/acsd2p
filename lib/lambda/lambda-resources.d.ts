import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
interface LambdaResourcesProps {
    stage: string;
    userPool: cognito.IUserPool;
    userPoolClient: cognito.IUserPoolClient;
    existingUserPoolClientSecret?: string;
    sharedDynamoDBTables: {
        [key: string]: dynamodb.ITable;
    };
    sharedS3Buckets: {
        [key: string]: s3.IBucket;
    };
    emailProcessQueue: sqs.IQueue;
    importExistingResources?: boolean;
}
export declare function createLambdaResources(scope: cdk.Stack, props: LambdaResourcesProps): {
    lambdaFunctions: {
        [key: string]: cdk.aws_lambda.Function;
    };
};
export {};
