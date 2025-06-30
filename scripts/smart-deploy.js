#!/usr/bin/env node

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SmartDeployer {
  constructor() {
    this.stage = process.env.ENVIRONMENT || 'dev';
    this.region = this.getRegionForStage(this.stage);
    this.stackName = `Acsd2PStack-${this.stage}`;
    this.hashFile = path.join(__dirname, '..', '.deployment-hashes.json');
    this.projectRoot = path.join(__dirname, '..');
  }

  getRegionForStage(stage) {
    const regions = {
      'dev': 'us-west-1',
      'prod': 'us-east-2'
    };
    return regions[stage] || 'us-west-1';
  }

  async run() {
    console.log('🧠 Smart ACS CDK Deployment');
    console.log('============================');
    console.log(`Environment: ${this.stage.toUpperCase()}`);
    console.log(`Region: ${this.region}`);
    console.log(`Stack: ${this.stackName}\n`);

    try {
      // Step 1: Check AWS credentials
      await this.checkAWSCredentials();

      // Step 2: Discover existing resources
      await this.discoverExistingResources();

      // Step 3: Analyze changes
      const changes = await this.analyzeChanges();

      // Step 4: Show change summary
      this.showChangeSummary(changes);

      // Step 5: Confirm deployment
      await this.confirmDeployment(changes);

      // Step 6: Deploy with change tracking
      await this.deployWithTracking(changes);

      // Step 7: Update hashes
      await this.updateHashes();

      console.log('\n✅ Smart deployment completed successfully!');
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

  async discoverExistingResources() {
    console.log('🔍 Discovering existing AWS resources...');
    
    try {
      // Check if stack exists
      const stackExists = await this.checkStackExists();
      
      if (stackExists) {
        console.log(`   📋 Stack ${this.stackName} exists, checking resources...`);
        await this.checkExistingResources();
      } else {
        console.log(`   📋 Stack ${this.stackName} does not exist, will create new resources`);
      }

      // Discover resources outside of CloudFormation
      await this.discoverResourcesOutsideStack();
      
    } catch (error) {
      console.warn(`   ⚠️  Resource discovery failed: ${error.message}`);
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

      console.log('   📊 Existing CloudFormation resources found:');
      
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

  async discoverResourcesOutsideStack() {
    console.log('   🔍 Checking for resources outside CloudFormation...');
    
    try {
      // Check DynamoDB tables
      await this.checkDynamoDBTables();
      
      // Check S3 buckets
      await this.checkS3Buckets();
      
      // Check SQS queues
      await this.checkSQSQueues();
      
      // Check Lambda functions
      await this.checkLambdaFunctions();
      
    } catch (error) {
      console.warn(`   ⚠️  External resource discovery failed: ${error.message}`);
    }
  }

  async checkDynamoDBTables() {
    const tableNames = ['Users', 'Conversations', 'Threads', 'Organizations', 'RateLimiting'];
    
    for (const tableName of tableNames) {
      const fullTableName = `${this.stage}-${tableName}`;
      
      try {
        execSync(
          `aws dynamodb describe-table --table-name ${fullTableName} --region ${this.region}`,
          { stdio: 'ignore' }
        );
        console.log(`     📋 Found existing DynamoDB table: ${fullTableName}`);
      } catch (error) {
        // Table doesn't exist
      }
    }
  }

  async checkS3Buckets() {
    const bucketNames = ['storage', 'email-attachments'];
    
    for (const bucketName of bucketNames) {
      const fullBucketName = `${this.stage}-${bucketName}`;
      
      try {
        execSync(
          `aws s3api head-bucket --bucket ${fullBucketName} --region ${this.region}`,
          { stdio: 'ignore' }
        );
        console.log(`     📋 Found existing S3 bucket: ${fullBucketName}`);
      } catch (error) {
        // Bucket doesn't exist
      }
    }
  }

  async checkSQSQueues() {
    const queueNames = ['EmailProcessQueue', 'EmailProcessDLQ'];
    
    for (const queueName of queueNames) {
      const fullQueueName = `${this.stage}-${queueName}`;
      
      try {
        execSync(
          `aws sqs get-queue-url --queue-name ${fullQueueName} --region ${this.region}`,
          { stdio: 'ignore' }
        );
        console.log(`     📋 Found existing SQS queue: ${fullQueueName}`);
      } catch (error) {
        // Queue doesn't exist
      }
    }
  }

  async checkLambdaFunctions() {
    try {
      const result = execSync(
        `aws lambda list-functions --region ${this.region} --output json`,
        { encoding: 'utf8' }
      );
      
      const functions = JSON.parse(result).Functions;
      const ourFunctions = functions.filter(func => 
        func.FunctionName.startsWith(`${this.stage}-`)
      );
      
      if (ourFunctions.length > 0) {
        console.log(`     📋 Found ${ourFunctions.length} existing Lambda functions:`);
        ourFunctions.forEach(func => {
          console.log(`       - ${func.FunctionName}`);
        });
      }
    } catch (error) {
      // Could not list functions
    }
  }

  async analyzeChanges() {
    console.log('🔍 Analyzing codebase changes...');
    
    const changes = {
      lambdas: [],
      infrastructure: false,
      configuration: false,
      newResources: [],
      modifiedResources: [],
      unchangedResources: []
    };

    // Load previous hashes
    const previousHashes = this.loadHashes();

    // Check lambda functions
    const lambdaDirs = this.getLambdaDirectories();
    for (const lambdaDir of lambdaDirs) {
      const lambdaPath = path.join(this.projectRoot, 'lambdas', lambdaDir);
      const currentHash = this.calculateDirectoryHash(lambdaPath);
      const previousHash = previousHashes.lambdas?.[lambdaDir];

      if (!previousHash) {
        changes.newResources.push(`Lambda: ${lambdaDir}`);
        changes.lambdas.push({ name: lambdaDir, status: 'new' });
      } else if (currentHash !== previousHash) {
        changes.modifiedResources.push(`Lambda: ${lambdaDir}`);
        changes.lambdas.push({ name: lambdaDir, status: 'modified' });
      } else {
        changes.unchangedResources.push(`Lambda: ${lambdaDir}`);
        changes.lambdas.push({ name: lambdaDir, status: 'unchanged' });
      }
    }

    // Check infrastructure files
    const infraFiles = [
      'lib/acsd2p-stack.ts',
      'lib/shared/shared-resources.ts',
      'lib/lambda/lambda-resources.ts',
      'lib/api/api-resources.ts',
      'lib/queue/queue-resources.ts'
    ];

    for (const file of infraFiles) {
      const filePath = path.join(this.projectRoot, file);
      if (fs.existsSync(filePath)) {
        const currentHash = this.calculateFileHash(filePath);
        const previousHash = previousHashes.infrastructure?.[file];

        if (!previousHash || currentHash !== previousHash) {
          changes.infrastructure = true;
          changes.modifiedResources.push(`Infrastructure: ${file}`);
        }
      }
    }

    // Check configuration files
    const configFiles = ['cdk.json', 'config.env', 'package.json'];
    for (const file of configFiles) {
      const filePath = path.join(this.projectRoot, file);
      if (fs.existsSync(filePath)) {
        const currentHash = this.calculateFileHash(filePath);
        const previousHash = previousHashes.configuration?.[file];

        if (!previousHash || currentHash !== previousHash) {
          changes.configuration = true;
          changes.modifiedResources.push(`Configuration: ${file}`);
        }
      }
    }

    console.log('   ✅ Change analysis completed\n');
    return changes;
  }

  getLambdaDirectories() {
    const lambdasPath = path.join(this.projectRoot, 'lambdas');
    if (!fs.existsSync(lambdasPath)) return [];

    return fs.readdirSync(lambdasPath)
      .filter(item => {
        const itemPath = path.join(lambdasPath, item);
        return fs.statSync(itemPath).isDirectory();
      });
  }

  calculateDirectoryHash(dirPath) {
    if (!fs.existsSync(dirPath)) return '';

    const files = this.getAllFiles(dirPath);
    const hashes = files.map(file => {
      const content = fs.readFileSync(file, 'utf8');
      return crypto.createHash('md5').update(content).digest('hex');
    });

    return crypto.createHash('md5').update(hashes.sort().join('')).digest('hex');
  }

  calculateFileHash(filePath) {
    if (!fs.existsSync(filePath)) return '';
    const content = fs.readFileSync(filePath, 'utf8');
    return crypto.createHash('md5').update(content).digest('hex');
  }

  getAllFiles(dirPath) {
    const files = [];
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stat = fs.statSync(itemPath);

      if (stat.isDirectory()) {
        files.push(...this.getAllFiles(itemPath));
      } else {
        // Skip certain files that shouldn't affect deployment
        const skipPatterns = ['.DS_Store', '.git', 'node_modules', '__pycache__', '.pyc'];
        const shouldSkip = skipPatterns.some(pattern => itemPath.includes(pattern));
        if (!shouldSkip) {
          files.push(itemPath);
        }
      }
    }

    return files;
  }

  loadHashes() {
    if (fs.existsSync(this.hashFile)) {
      try {
        return JSON.parse(fs.readFileSync(this.hashFile, 'utf8'));
      } catch (error) {
        console.warn('   ⚠️  Could not load previous hashes, treating all as new');
      }
    }
    return {};
  }

  showChangeSummary(changes) {
    console.log('📊 Change Summary:');
    console.log('==================');

    if (changes.newResources.length > 0) {
      console.log('\n🆕 New Resources:');
      changes.newResources.forEach(resource => {
        console.log(`   + ${resource}`);
      });
    }

    if (changes.modifiedResources.length > 0) {
      console.log('\n🔄 Modified Resources:');
      changes.modifiedResources.forEach(resource => {
        console.log(`   ~ ${resource}`);
      });
    }

    if (changes.unchangedResources.length > 0) {
      console.log('\n✅ Unchanged Resources:');
      console.log(`   ${changes.unchangedResources.length} resources unchanged`);
    }

    console.log('\n📈 Deployment Impact:');
    if (changes.infrastructure || changes.configuration) {
      console.log('   🔧 Full stack deployment required (infrastructure/config changes)');
      console.log('   📋 Existing resources will be imported where possible');
    } else if (changes.lambdas.some(l => l.status !== 'unchanged')) {
      console.log('   ⚡ Lambda-only deployment (function changes only)');
    } else {
      console.log('   ✅ No changes detected - deployment not needed');
    }

    console.log('');
  }

  async confirmDeployment(changes) {
    const hasChanges = changes.newResources.length > 0 || 
                      changes.modifiedResources.length > 0 ||
                      changes.infrastructure ||
                      changes.configuration;

    if (!hasChanges) {
      console.log('🎉 No changes detected! Your infrastructure is up to date.');
      process.exit(0);
    }

    if (this.stage === 'prod') {
      console.log('⚠️  PRODUCTION DEPLOYMENT WARNING ⚠️');
      console.log('This will deploy to the PRODUCTION environment.');
      console.log('Please ensure all changes have been tested in development.\n');
      
      console.log('Waiting 10 seconds before proceeding...');
      await this.sleep(10000);
    }

    console.log('🚀 Proceeding with deployment...\n');
  }

  async deployWithTracking(changes) {
    console.log('🚀 Deploying with change tracking...');

    // Set environment variables for CDK to use
    process.env.DEPLOYMENT_CHANGES = JSON.stringify(changes);
    process.env.DEPLOYMENT_TIMESTAMP = new Date().toISOString();

    const deployCommand = this.stage === 'prod' 
      ? `npx cdk deploy --context env=${this.stage} --require-approval never`
      : `npx cdk deploy --context env=${this.stage}`;

    try {
      execSync(deployCommand, { stdio: 'inherit' });
    } catch (error) {
      throw new Error(`Deployment failed: ${error.message}`);
    }
  }

  async updateHashes() {
    console.log('💾 Updating deployment hashes...');

    const hashes = {
      timestamp: new Date().toISOString(),
      stage: this.stage,
      lambdas: {},
      infrastructure: {},
      configuration: {}
    };

    // Update lambda hashes
    const lambdaDirs = this.getLambdaDirectories();
    for (const lambdaDir of lambdaDirs) {
      const lambdaPath = path.join(this.projectRoot, 'lambdas', lambdaDir);
      hashes.lambdas[lambdaDir] = this.calculateDirectoryHash(lambdaPath);
    }

    // Update infrastructure hashes
    const infraFiles = [
      'lib/acsd2p-stack.ts',
      'lib/shared/shared-resources.ts',
      'lib/lambda/lambda-resources.ts',
      'lib/api/api-resources.ts',
      'lib/queue/queue-resources.ts'
    ];

    for (const file of infraFiles) {
      const filePath = path.join(this.projectRoot, file);
      if (fs.existsSync(filePath)) {
        hashes.infrastructure[file] = this.calculateFileHash(filePath);
      }
    }

    // Update configuration hashes
    const configFiles = ['cdk.json', 'config.env', 'package.json'];
    for (const file of configFiles) {
      const filePath = path.join(this.projectRoot, file);
      if (fs.existsSync(filePath)) {
        hashes.configuration[file] = this.calculateFileHash(filePath);
      }
    }

    fs.writeFileSync(this.hashFile, JSON.stringify(hashes, null, 2));
    console.log('   ✅ Deployment hashes updated\n');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the smart deployer
const deployer = new SmartDeployer();
deployer.run().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
}); 