import * as cdk from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { EnhancedResourceChecker, ResourceExistenceCheck } from '../shared/enhanced-resource-checker';

interface QueueResourcesProps {
  stage: string;
  importExistingResources?: boolean;
  resourceExistenceChecks?: {
    sqsQueues: { [key: string]: ResourceExistenceCheck };
  };
}

export function createQueueResources(scope: cdk.Stack, props: QueueResourcesProps) {
  const { stage, importExistingResources = false, resourceExistenceChecks } = props;

  const getResourceName = (name: string) => {
    return `${stage}-${name}`;
  };

  // Email Process Queue
  const emailProcessQueueName = getResourceName('EmailProcessQueue');
  const emailProcessDLQName = getResourceName('EmailProcessDLQ');
  
  const emailProcessQueueCheck = resourceExistenceChecks?.sqsQueues?.['EmailProcessQueue'];
  const emailProcessDLQCheck = resourceExistenceChecks?.sqsQueues?.['EmailProcessDLQ'];

  let emailProcessQueue: sqs.IQueue;
  let emailProcessDLQ: sqs.IQueue;

  if (emailProcessDLQCheck?.exists && !emailProcessDLQCheck.needsCreation) {
    console.log(`   🔗 Importing existing SQS DLQ: ${emailProcessDLQName}`);
    console.log(`      Source: ${emailProcessDLQCheck.source}`);
    if (emailProcessDLQCheck.stackResourceId) {
      console.log(`      Stack Resource ID: ${emailProcessDLQCheck.stackResourceId}`);
    }
    emailProcessDLQ = EnhancedResourceChecker.importSQSQueue(scope, 'EmailProcessDLQ', emailProcessDLQName, scope.region);
  } else {
    console.log(`   🆕 Creating new SQS DLQ: ${emailProcessDLQName}`);
    emailProcessDLQ = new sqs.Queue(scope, 'EmailProcessDLQ', {
      queueName: emailProcessDLQName,
      retentionPeriod: cdk.Duration.days(14),
    });
  }

  if (emailProcessQueueCheck?.exists && !emailProcessQueueCheck.needsCreation) {
    console.log(`   🔗 Importing existing SQS queue: ${emailProcessQueueName}`);
    console.log(`      Source: ${emailProcessQueueCheck.source}`);
    if (emailProcessQueueCheck.stackResourceId) {
      console.log(`      Stack Resource ID: ${emailProcessQueueCheck.stackResourceId}`);
    }
    emailProcessQueue = EnhancedResourceChecker.importSQSQueue(scope, 'EmailProcessQueue', emailProcessQueueName, scope.region);
  } else {
    console.log(`   🆕 Creating new SQS queue: ${emailProcessQueueName}`);
    emailProcessQueue = new sqs.Queue(scope, 'EmailProcessQueue', {
      queueName: emailProcessQueueName,
      visibilityTimeout: cdk.Duration.minutes(5),
      retentionPeriod: cdk.Duration.days(14),
      deadLetterQueue: {
        queue: emailProcessDLQ,
        maxReceiveCount: 3,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
  }

  return {
    emailProcessQueue,
  };
} 