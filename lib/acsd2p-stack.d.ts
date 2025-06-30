import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
interface Acsd2PStackProps extends cdk.StackProps {
    stage: string;
    existingUserPoolId?: string;
    existingUserPoolClientId?: string;
    existingUserPoolClientSecret?: string;
}
export declare class Acsd2PStack extends cdk.Stack {
    readonly userPool: any;
    readonly userPoolClient: any;
    readonly sharedDynamoDBTables: {
        [key: string]: any;
    };
    readonly sharedS3Buckets: {
        [key: string]: any;
    };
    readonly emailProcessQueue: any;
    readonly lambdaFunctions: {
        [key: string]: any;
    };
    readonly api: any;
    constructor(scope: Construct, id: string, props: Acsd2PStackProps);
    private checkExistingResources;
    private buildExistenceMapFromEnv;
    private buildExistenceMapFromAWS;
    private createStackOutputs;
    private validateEnvironmentConfiguration;
}
export {};
