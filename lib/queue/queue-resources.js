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
exports.createQueueResources = createQueueResources;
const cdk = __importStar(require("aws-cdk-lib"));
const sqs = __importStar(require("aws-cdk-lib/aws-sqs"));
const resource_checker_1 = require("../shared/resource-checker");
function createQueueResources(scope, props) {
    const { stage, importExistingResources = false, resourceExistenceChecks } = props;
    const getResourceName = (name) => {
        return name;
    };
    // Email Process Queue
    const emailProcessQueueName = getResourceName('EmailProcessQueue');
    const emailProcessDLQName = getResourceName('EmailProcessDLQ');
    const emailProcessQueueCheck = resourceExistenceChecks?.sqsQueues?.['EmailProcessQueue'];
    const emailProcessDLQCheck = resourceExistenceChecks?.sqsQueues?.['EmailProcessDLQ'];
    let emailProcessQueue;
    let emailProcessDLQ;
    if (emailProcessDLQCheck?.exists && !emailProcessDLQCheck.needsCreation) {
        console.log(`   🔗 Importing existing SQS DLQ: ${emailProcessDLQName}`);
        emailProcessDLQ = resource_checker_1.ResourceChecker.importSQSQueue(scope, 'EmailProcessDLQ', emailProcessDLQName, scope.region);
    }
    else {
        console.log(`   🆕 Creating new SQS DLQ: ${emailProcessDLQName}`);
        emailProcessDLQ = new sqs.Queue(scope, 'EmailProcessDLQ', {
            queueName: emailProcessDLQName,
            retentionPeriod: cdk.Duration.days(14),
        });
    }
    if (emailProcessQueueCheck?.exists && !emailProcessQueueCheck.needsCreation) {
        console.log(`   🔗 Importing existing SQS queue: ${emailProcessQueueName}`);
        emailProcessQueue = resource_checker_1.ResourceChecker.importSQSQueue(scope, 'EmailProcessQueue', emailProcessQueueName, scope.region);
    }
    else {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXVldWUtcmVzb3VyY2VzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicXVldWUtcmVzb3VyY2VzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFZQSxvREFnREM7QUE1REQsaURBQW1DO0FBQ25DLHlEQUEyQztBQUMzQyxpRUFBcUY7QUFVckYsU0FBZ0Isb0JBQW9CLENBQUMsS0FBZ0IsRUFBRSxLQUEwQjtJQUMvRSxNQUFNLEVBQUUsS0FBSyxFQUFFLHVCQUF1QixHQUFHLEtBQUssRUFBRSx1QkFBdUIsRUFBRSxHQUFHLEtBQUssQ0FBQztJQUVsRixNQUFNLGVBQWUsR0FBRyxDQUFDLElBQVksRUFBRSxFQUFFO1FBQ3ZDLE9BQU8sSUFBSSxDQUFDO0lBQ2QsQ0FBQyxDQUFDO0lBRUYsc0JBQXNCO0lBQ3RCLE1BQU0scUJBQXFCLEdBQUcsZUFBZSxDQUFDLG1CQUFtQixDQUFDLENBQUM7SUFDbkUsTUFBTSxtQkFBbUIsR0FBRyxlQUFlLENBQUMsaUJBQWlCLENBQUMsQ0FBQztJQUUvRCxNQUFNLHNCQUFzQixHQUFHLHVCQUF1QixFQUFFLFNBQVMsRUFBRSxDQUFDLG1CQUFtQixDQUFDLENBQUM7SUFDekYsTUFBTSxvQkFBb0IsR0FBRyx1QkFBdUIsRUFBRSxTQUFTLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0lBRXJGLElBQUksaUJBQTZCLENBQUM7SUFDbEMsSUFBSSxlQUEyQixDQUFDO0lBRWhDLElBQUksb0JBQW9CLEVBQUUsTUFBTSxJQUFJLENBQUMsb0JBQW9CLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDeEUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQ0FBcUMsbUJBQW1CLEVBQUUsQ0FBQyxDQUFDO1FBQ3hFLGVBQWUsR0FBRyxrQ0FBZSxDQUFDLGNBQWMsQ0FBQyxLQUFLLEVBQUUsaUJBQWlCLEVBQUUsbUJBQW1CLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ2hILENBQUM7U0FBTSxDQUFDO1FBQ04sT0FBTyxDQUFDLEdBQUcsQ0FBQywrQkFBK0IsbUJBQW1CLEVBQUUsQ0FBQyxDQUFDO1FBQ2xFLGVBQWUsR0FBRyxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLGlCQUFpQixFQUFFO1lBQ3hELFNBQVMsRUFBRSxtQkFBbUI7WUFDOUIsZUFBZSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztTQUN2QyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsSUFBSSxzQkFBc0IsRUFBRSxNQUFNLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUM1RSxPQUFPLENBQUMsR0FBRyxDQUFDLHVDQUF1QyxxQkFBcUIsRUFBRSxDQUFDLENBQUM7UUFDNUUsaUJBQWlCLEdBQUcsa0NBQWUsQ0FBQyxjQUFjLENBQUMsS0FBSyxFQUFFLG1CQUFtQixFQUFFLHFCQUFxQixFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUN0SCxDQUFDO1NBQU0sQ0FBQztRQUNOLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUNBQWlDLHFCQUFxQixFQUFFLENBQUMsQ0FBQztRQUN0RSxpQkFBaUIsR0FBRyxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLG1CQUFtQixFQUFFO1lBQzVELFNBQVMsRUFBRSxxQkFBcUI7WUFDaEMsaUJBQWlCLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQzFDLGVBQWUsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDdEMsZUFBZSxFQUFFO2dCQUNmLEtBQUssRUFBRSxlQUFlO2dCQUN0QixlQUFlLEVBQUUsQ0FBQzthQUNuQjtZQUNELGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE1BQU07U0FDeEMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELE9BQU87UUFDTCxpQkFBaUI7S0FDbEIsQ0FBQztBQUNKLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgKiBhcyBzcXMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNxcyc7XHJcbmltcG9ydCB7IFJlc291cmNlQ2hlY2tlciwgUmVzb3VyY2VFeGlzdGVuY2VDaGVjayB9IGZyb20gJy4uL3NoYXJlZC9yZXNvdXJjZS1jaGVja2VyJztcclxuXHJcbmludGVyZmFjZSBRdWV1ZVJlc291cmNlc1Byb3BzIHtcclxuICBzdGFnZTogc3RyaW5nO1xyXG4gIGltcG9ydEV4aXN0aW5nUmVzb3VyY2VzPzogYm9vbGVhbjtcclxuICByZXNvdXJjZUV4aXN0ZW5jZUNoZWNrcz86IHtcclxuICAgIHNxc1F1ZXVlczogeyBba2V5OiBzdHJpbmddOiBSZXNvdXJjZUV4aXN0ZW5jZUNoZWNrIH07XHJcbiAgfTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVF1ZXVlUmVzb3VyY2VzKHNjb3BlOiBjZGsuU3RhY2ssIHByb3BzOiBRdWV1ZVJlc291cmNlc1Byb3BzKSB7XHJcbiAgY29uc3QgeyBzdGFnZSwgaW1wb3J0RXhpc3RpbmdSZXNvdXJjZXMgPSBmYWxzZSwgcmVzb3VyY2VFeGlzdGVuY2VDaGVja3MgfSA9IHByb3BzO1xyXG5cclxuICBjb25zdCBnZXRSZXNvdXJjZU5hbWUgPSAobmFtZTogc3RyaW5nKSA9PiB7XHJcbiAgICByZXR1cm4gbmFtZTtcclxuICB9O1xyXG5cclxuICAvLyBFbWFpbCBQcm9jZXNzIFF1ZXVlXHJcbiAgY29uc3QgZW1haWxQcm9jZXNzUXVldWVOYW1lID0gZ2V0UmVzb3VyY2VOYW1lKCdFbWFpbFByb2Nlc3NRdWV1ZScpO1xyXG4gIGNvbnN0IGVtYWlsUHJvY2Vzc0RMUU5hbWUgPSBnZXRSZXNvdXJjZU5hbWUoJ0VtYWlsUHJvY2Vzc0RMUScpO1xyXG4gIFxyXG4gIGNvbnN0IGVtYWlsUHJvY2Vzc1F1ZXVlQ2hlY2sgPSByZXNvdXJjZUV4aXN0ZW5jZUNoZWNrcz8uc3FzUXVldWVzPy5bJ0VtYWlsUHJvY2Vzc1F1ZXVlJ107XHJcbiAgY29uc3QgZW1haWxQcm9jZXNzRExRQ2hlY2sgPSByZXNvdXJjZUV4aXN0ZW5jZUNoZWNrcz8uc3FzUXVldWVzPy5bJ0VtYWlsUHJvY2Vzc0RMUSddO1xyXG5cclxuICBsZXQgZW1haWxQcm9jZXNzUXVldWU6IHNxcy5JUXVldWU7XHJcbiAgbGV0IGVtYWlsUHJvY2Vzc0RMUTogc3FzLklRdWV1ZTtcclxuXHJcbiAgaWYgKGVtYWlsUHJvY2Vzc0RMUUNoZWNrPy5leGlzdHMgJiYgIWVtYWlsUHJvY2Vzc0RMUUNoZWNrLm5lZWRzQ3JlYXRpb24pIHtcclxuICAgIGNvbnNvbGUubG9nKGAgICDwn5SXIEltcG9ydGluZyBleGlzdGluZyBTUVMgRExROiAke2VtYWlsUHJvY2Vzc0RMUU5hbWV9YCk7XHJcbiAgICBlbWFpbFByb2Nlc3NETFEgPSBSZXNvdXJjZUNoZWNrZXIuaW1wb3J0U1FTUXVldWUoc2NvcGUsICdFbWFpbFByb2Nlc3NETFEnLCBlbWFpbFByb2Nlc3NETFFOYW1lLCBzY29wZS5yZWdpb24pO1xyXG4gIH0gZWxzZSB7XHJcbiAgICBjb25zb2xlLmxvZyhgICAg8J+GlSBDcmVhdGluZyBuZXcgU1FTIERMUTogJHtlbWFpbFByb2Nlc3NETFFOYW1lfWApO1xyXG4gICAgZW1haWxQcm9jZXNzRExRID0gbmV3IHNxcy5RdWV1ZShzY29wZSwgJ0VtYWlsUHJvY2Vzc0RMUScsIHtcclxuICAgICAgcXVldWVOYW1lOiBlbWFpbFByb2Nlc3NETFFOYW1lLFxyXG4gICAgICByZXRlbnRpb25QZXJpb2Q6IGNkay5EdXJhdGlvbi5kYXlzKDE0KSxcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgaWYgKGVtYWlsUHJvY2Vzc1F1ZXVlQ2hlY2s/LmV4aXN0cyAmJiAhZW1haWxQcm9jZXNzUXVldWVDaGVjay5uZWVkc0NyZWF0aW9uKSB7XHJcbiAgICBjb25zb2xlLmxvZyhgICAg8J+UlyBJbXBvcnRpbmcgZXhpc3RpbmcgU1FTIHF1ZXVlOiAke2VtYWlsUHJvY2Vzc1F1ZXVlTmFtZX1gKTtcclxuICAgIGVtYWlsUHJvY2Vzc1F1ZXVlID0gUmVzb3VyY2VDaGVja2VyLmltcG9ydFNRU1F1ZXVlKHNjb3BlLCAnRW1haWxQcm9jZXNzUXVldWUnLCBlbWFpbFByb2Nlc3NRdWV1ZU5hbWUsIHNjb3BlLnJlZ2lvbik7XHJcbiAgfSBlbHNlIHtcclxuICAgIGNvbnNvbGUubG9nKGAgICDwn4aVIENyZWF0aW5nIG5ldyBTUVMgcXVldWU6ICR7ZW1haWxQcm9jZXNzUXVldWVOYW1lfWApO1xyXG4gICAgZW1haWxQcm9jZXNzUXVldWUgPSBuZXcgc3FzLlF1ZXVlKHNjb3BlLCAnRW1haWxQcm9jZXNzUXVldWUnLCB7XHJcbiAgICAgIHF1ZXVlTmFtZTogZW1haWxQcm9jZXNzUXVldWVOYW1lLFxyXG4gICAgICB2aXNpYmlsaXR5VGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXHJcbiAgICAgIHJldGVudGlvblBlcmlvZDogY2RrLkR1cmF0aW9uLmRheXMoMTQpLFxyXG4gICAgICBkZWFkTGV0dGVyUXVldWU6IHtcclxuICAgICAgICBxdWV1ZTogZW1haWxQcm9jZXNzRExRLFxyXG4gICAgICAgIG1heFJlY2VpdmVDb3VudDogMyxcclxuICAgICAgfSxcclxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICByZXR1cm4ge1xyXG4gICAgZW1haWxQcm9jZXNzUXVldWUsXHJcbiAgfTtcclxufSAiXX0=