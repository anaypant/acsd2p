const { execSync } = require('child_process');

console.log('🔍 Checking for existing CloudFormation stacks...\n');

try {
  // Check for existing stacks
  const stacksOutput = execSync('aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE --query "StackSummaries[?contains(StackName, `Acsd2P`) || contains(StackName, `acsd2p`)].{Name:StackName,Status:StackStatus}" --output table', { encoding: 'utf8' });
  console.log('📋 Existing CloudFormation Stacks:');
  console.log(stacksOutput);
} catch (error) {
  console.log('❌ No existing Acsd2P stacks found or error occurred');
}

console.log('\n🔍 Checking for existing DynamoDB tables...\n');

try {
  // Check for existing DynamoDB tables
  const tablesOutput = execSync('aws dynamodb list-tables --query "TableNames[?contains(@, `dev-`) || contains(@, `prod-`)].{TableName:@}" --output table', { encoding: 'utf8' });
  console.log('📋 Existing DynamoDB Tables:');
  console.log(tablesOutput);
} catch (error) {
  console.log('❌ No existing DynamoDB tables found or error occurred');
}

console.log('\n🔍 Checking current AWS region...\n');
try {
  const regionOutput = execSync('aws configure get region', { encoding: 'utf8' });
  console.log(`📍 Current AWS Region: ${regionOutput.trim()}`);
} catch (error) {
  console.log('❌ Could not determine AWS region');
} 