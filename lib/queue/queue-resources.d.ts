import * as cdk from 'aws-cdk-lib';
import { ResourceExistenceCheck } from '../shared/resource-checker';
interface QueueResourcesProps {
    stage: string;
    importExistingResources?: boolean;
    resourceExistenceChecks?: {
        sqsQueues: {
            [key: string]: ResourceExistenceCheck;
        };
    };
}
export declare function createQueueResources(scope: cdk.Stack, props: QueueResourcesProps): {
    emailProcessQueue: cdk.aws_sqs.IQueue;
};
export {};
