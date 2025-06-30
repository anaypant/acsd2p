#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Resource discovery script that finds existing AWS resources
class ResourceDiscoverer {
  constructor() {
    this.stage = process.env.ENVIRONMENT || 'dev';
    this.region = this.getRegionForStage(this.stage);
    this.account = this.getAccountId();
  }

  getRegionForStage(stage) {
    const regions = {
      'dev': 'us-west-1',
      'prod': 'us-east-2'
    };
    return regions[stage] || 'us-west-1';
  }

  getAccountId() {
    try {
      const result = execSync('aws sts get-caller-identity --output json', { encoding: 'utf8' });
      const identity = JSON.parse(result);
      return identity.Account;
    } catch (error) {
      throw new Error('Could not get AWS account ID. Please check your credentials.');
    }
  }

  async run() {
    console.log('🔍 ACS Resource Discovery');
    console.log('==========================');
    console.log(`Environment: ${this.stage.toUpperCase()}`);
    console.log(`Region: ${this.region}`);
    console.log(`Account: ${this.account}\n`);

    try {
      const resources = await this.discoverResources();
      this.saveResourceConfig(resources);
      this.generateEnvironmentVariables(resources);
      
      console.log('\n✅ Resource discovery completed!');
      console.log('📋 Check the generated files for resource information.');
    } catch (error) {
      console.error('\n❌ Resource discovery failed:', error.message);
      process.exit(1);
    }
  }

  async discoverResources() {
    const resources = {
      dynamoDBTables: [],
      s3Buckets: [],
      sqsQueues: [],
      cloudFormationStacks: []
    };

    console.log('🔍 Discovering DynamoDB tables...');
    resources.dynamoDBTables = await this.discoverDynamoDBTables();

    console.log('🔍 Discovering S3 buckets...');
    resources.s3Buckets = await this.discoverS3Buckets();

    console.log('🔍 Discovering SQS queues...');
    resources.sqsQueues = await this.discoverSQSQueues();

    console.log('🔍 Discovering CloudFormation stacks...');
    resources.cloudFormationStacks = await this.discoverCloudFormationStacks();

    return resources;
  }

  async discoverDynamoDBTables() {
    try {
      const result = execSync(
        `aws dynamodb list-tables --region ${this.region} --output json`,
        { encoding: 'utf8' }
      );
      
      const data = JSON.parse(result);
      const relevantTables = data.TableNames.filter(tableName => 
        tableName.includes(this.stage) || 
        ['Users', 'Conversations', 'Threads', 'Organizations', 'RateLimiting'].some(name => 
          tableName.includes(name)
        )
      );

      console.log(`   Found ${relevantTables.length} relevant DynamoDB tables`);
      relevantTables.forEach(table => console.log(`     - ${table}`));

      return relevantTables;
    } catch (error) {
      console.warn(`   ⚠️  Could not discover DynamoDB tables: ${error.message}`);
      return [];
    }
  }

  async discoverS3Buckets() {
    try {
      const result = execSync(
        `aws s3api list-buckets --output json`,
        { encoding: 'utf8' }
      );
      
      const data = JSON.parse(result);
      const relevantBuckets = data.Buckets
        .map(bucket => bucket.Name)
        .filter(bucketName => 
          bucketName.includes(this.stage) || 
          bucketName.includes('storage') || 
          bucketName.includes('email-attachments')
        );

      console.log(`   Found ${relevantBuckets.length} relevant S3 buckets`);
      relevantBuckets.forEach(bucket => console.log(`     - ${bucket}`));

      return relevantBuckets;
    } catch (error) {
      console.warn(`   ⚠️  Could not discover S3 buckets: ${error.message}`);
      return [];
    }
  }

  async discoverSQSQueues() {
    try {
      const result = execSync(
        `aws sqs list-queues --region ${this.region} --output json`,
        { encoding: 'utf8' }
      );
      
      const data = JSON.parse(result);
      const relevantQueues = (data.QueueUrls || [])
        .map(url => url.split('/').pop())
        .filter(queueName => 
          queueName.includes(this.stage) || 
          queueName.includes('EmailProcess') || 
          queueName.includes('EmailProcessDLQ')
        );

      console.log(`   Found ${relevantQueues.length} relevant SQS queues`);
      relevantQueues.forEach(queue => console.log(`     - ${queue}`));

      return relevantQueues;
    } catch (error) {
      console.warn(`   ⚠️  Could not discover SQS queues: ${error.message}`);
      return [];
    }
  }

  async discoverCloudFormationStacks() {
    try {
      const result = execSync(
        `aws cloudformation list-stacks --region ${this.region} --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE --output json`,
        { encoding: 'utf8' }
      );
      
      const data = JSON.parse(result);
      const relevantStacks = data.StackSummaries
        .filter(stack => 
          stack.StackName.includes('Acsd2P') || 
          stack.StackName.includes(this.stage)
        )
        .map(stack => ({
          name: stack.StackName,
          status: stack.StackStatus,
          creationTime: stack.CreationTime
        }));

      console.log(`   Found ${relevantStacks.length} relevant CloudFormation stacks`);
      relevantStacks.forEach(stack => console.log(`     - ${stack.name} (${stack.status})`));

      return relevantStacks;
    } catch (error) {
      console.warn(`   ⚠️  Could not discover CloudFormation stacks: ${error.message}`);
      return [];
    }
  }

  saveResourceConfig(resources) {
    const configPath = path.join(__dirname, '..', 'discovered-resources.json');
    const config = {
      stage: this.stage,
      region: this.region,
      account: this.account,
      discoveredAt: new Date().toISOString(),
      resources
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`\n📄 Resource configuration saved to: ${configPath}`);
  }

  generateEnvironmentVariables(resources) {
    const envPath = path.join(__dirname, '..', '.env.discovered');
    const envContent = [
      `# Discovered Resources for ${this.stage.toUpperCase()} Environment`,
      `# Generated on: ${new Date().toISOString()}`,
      `# Region: ${this.region}`,
      `# Account: ${this.account}`,
      '',
      '# DynamoDB Tables',
      `EXISTING_DYNAMODB_TABLES=${resources.dynamoDBTables.join(',')}`,
      '',
      '# S3 Buckets',
      `EXISTING_S3_BUCKETS=${resources.s3Buckets.join(',')}`,
      '',
      '# SQS Queues',
      `EXISTING_SQS_QUEUES=${resources.sqsQueues.join(',')}`,
      '',
      '# CloudFormation Stacks',
      `EXISTING_CLOUDFORMATION_STACKS=${resources.cloudFormationStacks.map(s => s.name).join(',')}`,
      '',
      '# Usage Instructions:',
      '# 1. Review the discovered resources above',
      '# 2. Copy relevant values to your .env.local file',
      '# 3. Update the resource configuration in lib/shared/resource-config.ts',
      '# 4. Run the enhanced deployment script'
    ].join('\n');

    fs.writeFileSync(envPath, envContent);
    console.log(`📄 Environment variables saved to: ${envPath}`);
  }
}

// Run the resource discoverer
if (require.main === module) {
  const discoverer = new ResourceDiscoverer();
  discoverer.run().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { ResourceDiscoverer }; 