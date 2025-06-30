import * as cdk from 'aws-cdk-lib';
import { ResourceExistenceCheck } from './resource-config';
interface SharedResourcesProps {
    stage: string;
    existingUserPoolId?: string;
    existingUserPoolClientId?: string;
    existingUserPoolClientSecret?: string;
    importExistingResources?: boolean;
    resourceExistenceChecks?: {
        dynamoDBTables: {
            [key: string]: ResourceExistenceCheck;
        };
        s3Buckets: {
            [key: string]: ResourceExistenceCheck;
        };
    };
}
export declare function createSharedResources(scope: cdk.Stack, props: SharedResourcesProps): {
    userPool: cdk.aws_cognito.IUserPool;
    userPoolClient: cdk.aws_cognito.IUserPoolClient;
    sharedDynamoDBTables: {
        [key: string]: cdk.aws_dynamodb.ITable;
    };
    sharedS3Buckets: {
        [key: string]: cdk.aws_s3.IBucket;
    };
};
export {};
