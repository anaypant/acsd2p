#!/usr/bin/env node

const { spawn } = require('child_process');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Enhanced deployment script that checks for existing resources before deployment
class EnhancedDeployer {
  constructor() {
    this.stage = process.env.ENVIRONMENT || 'dev';
    this.region = this.getRegionForStage(this.stage);
    this.stackName = `Acsd2PStack-${this.stage}`;
  }

  getRegionForStage(stage) {
    const regions = {
      'dev': 'us-west-1',
      'prod': 'us-east-2'
    };
    return regions[stage] || 'us-west-1';
  }

  async run() {
    console.log('🚀 Enhanced ACS CDK Deployment');
    console.log('================================');
    console.log(`Environment: ${this.stage.toUpperCase()}`);
    console.log(`Region: ${this.region}`);
    console.log(`Stack: ${this.stackName}\n`);

    try {
      // Step 1: Check AWS credentials and permissions
      await this.checkAWSCredentials();

      // Step 2: Perform comprehensive resource checking
      await this.performResourceCheck();

      // Step 3: Synthesize CDK template
      await this.synthesizeTemplate();

      // Step 4: Show deployment diff
      await this.showDeploymentDiff();

      // Step 5: Confirm deployment
      await this.confirmDeployment();

      // Step 6: Deploy
      await this.deploy();

      console.log('\n✅ Deployment completed successfully!');
    } catch (error) {
      console.error('\n❌ Deployment failed:', error.message);
      process.exit(1);
    }
  }

  async checkAWSCredentials() {
    console.log('🔐 Checking AWS credentials...');
    
    try {
      const result = execSync('aws sts get-caller-identity --output json', { encoding: 'utf8' });
      const identity = JSON.parse(result);
      
      console.log(`   Account: ${identity.Account}`);
      console.log(`   User: ${identity.Arn}`);
      console.log(`   Region: ${this.region}\n`);
    } catch (error) {
      throw new Error('AWS credentials not configured or invalid. Please run "aws configure" first.');
    }
  }

  async performResourceCheck() {
    console.log('🔍 Performing comprehensive resource check...');
    
    try {
      // Check if stack exists
      const stackExists = await this.checkStackExists();
      
      if (stackExists) {
        console.log(`   📋 Stack ${this.stackName} exists, checking resources...`);
        await this.checkExistingResources();
      } else {
        console.log(`   📋 Stack ${this.stackName} does not exist, will create new resources`);
      }
    } catch (error) {
      console.warn(`   ⚠️  Resource check failed: ${error.message}`);
      console.log('   📋 Proceeding with deployment...');
    }
  }

  async checkStackExists() {
    try {
      execSync(`aws cloudformation describe-stacks --stack-name ${this.stackName} --region ${this.region}`, { stdio: 'ignore' });
      return true;
    } catch (error) {
      return false;
    }
  }

  async checkExistingResources() {
    try {
      // Get stack resources
      const result = execSync(
        `aws cloudformation list-stack-resources --stack-name ${this.stackName} --region ${this.region} --output json`,
        { encoding: 'utf8' }
      );
      
      const resources = JSON.parse(result);
      const resourceMap = {};
      
      resources.StackResourceSummaries.forEach(resource => {
        resourceMap[resource.ResourceType] = resourceMap[resource.ResourceType] || [];
        resourceMap[resource.ResourceType].push({
          logicalId: resource.LogicalResourceId,
          physicalId: resource.PhysicalResourceId,
          status: resource.ResourceStatus
        });
      });

      console.log('   📊 Existing resources found:');
      
      if (resourceMap['AWS::DynamoDB::Table']) {
        console.log('   DynamoDB Tables:');
        resourceMap['AWS::DynamoDB::Table'].forEach(table => {
          console.log(`     - ${table.logicalId}: ${table.physicalId} (${table.status})`);
        });
      }

      if (resourceMap['AWS::S3::Bucket']) {
        console.log('   S3 Buckets:');
        resourceMap['AWS::S3::Bucket'].forEach(bucket => {
          console.log(`     - ${bucket.logicalId}: ${bucket.physicalId} (${bucket.status})`);
        });
      }

      if (resourceMap['AWS::SQS::Queue']) {
        console.log('   SQS Queues:');
        resourceMap['AWS::SQS::Queue'].forEach(queue => {
          console.log(`     - ${queue.logicalId}: ${queue.physicalId} (${queue.status})`);
        });
      }

      console.log('');
    } catch (error) {
      console.warn(`   ⚠️  Could not retrieve stack resources: ${error.message}`);
    }
  }

  async synthesizeTemplate() {
    console.log('📝 Synthesizing CDK template...');
    
    try {
      execSync(`npx cdk synth --context env=${this.stage}`, { stdio: 'inherit' });
      console.log('   ✅ Template synthesized successfully\n');
    } catch (error) {
      throw new Error(`Template synthesis failed: ${error.message}`);
    }
  }

  async showDeploymentDiff() {
    console.log('📋 Showing deployment diff...');
    
    try {
      execSync(`npx cdk diff --context env=${this.stage}`, { stdio: 'inherit' });
      console.log('');
    } catch (error) {
      console.warn(`   ⚠️  Could not show diff: ${error.message}`);
    }
  }

  async confirmDeployment() {
    if (this.stage === 'prod') {
      console.log('⚠️  PRODUCTION DEPLOYMENT WARNING ⚠️');
      console.log('This will deploy to the PRODUCTION environment.');
      console.log('Please ensure all changes have been tested in development.\n');
      
      // Add a delay for production deployments
      console.log('Waiting 10 seconds before proceeding...');
      await this.sleep(10000);
    }

    // For now, auto-confirm. In a real scenario, you might want to prompt the user
    console.log('🚀 Proceeding with deployment...\n');
  }

  async deploy() {
    console.log('🚀 Deploying CDK stack...');
    
    const deployCommand = this.stage === 'prod' 
      ? `npx cdk deploy --context env=${this.stage} --require-approval never`
      : `npx cdk deploy --context env=${this.stage}`;

    try {
      execSync(deployCommand, { stdio: 'inherit' });
    } catch (error) {
      throw new Error(`Deployment failed: ${error.message}`);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the enhanced deployer
if (require.main === module) {
  const deployer = new EnhancedDeployer();
  deployer.run().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { EnhancedDeployer }; 