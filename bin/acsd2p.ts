#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { Acsd2PStack } from '../lib/acsd2p-stack';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables from .env.local file
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('📁 Loaded configuration from .env.local');
} else {
  console.log('⚠️  .env.local file not found, using default configuration');
}

const app = new cdk.App();

// Get the target environment from command line arguments or default to dev
const targetEnv = app.node.tryGetContext('env') || process.env.ENVIRONMENT || 'dev';
const envConfig = app.node.tryGetContext(targetEnv);

if (!envConfig) {
  throw new Error(`Environment configuration not found for: ${targetEnv}`);
}

// Get existing Cognito parameters from .env.local file
const existingUserPoolId = process.env.EXISTING_USER_POOL_ID;
const existingUserPoolClientId = process.env.EXISTING_USER_POOL_CLIENT_ID;
const existingUserPoolClientSecret = process.env.EXISTING_USER_POOL_CLIENT_SECRET;

// Function to handle production deployment warnings
async function handleProductionWarning() {
  if (targetEnv === 'prod') {
    console.log('\n🚨 PRODUCTION DEPLOYMENT WARNING 🚨');
    console.log('⚠️  You are about to deploy to the PRODUCTION environment!');
    console.log('⚠️  Environment: PROD | Region: us-east-2 | Account: 872515253712');
    console.log('');
    console.log('This deployment will affect live users and production data.');
    console.log('To proceed, run: npx cdk deploy --context env=prod --require-approval never');
    console.log('To cancel, press Ctrl+C now');
    console.log('');
    console.log('Deployment will proceed in 10 seconds...');
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}

// Display environment information
console.log(`📋 Deployment Configuration:`);
console.log(`   Environment: ${targetEnv.toUpperCase()}`);
console.log(`   Region: ${envConfig.env.region}`);
console.log(`   Account: ${envConfig.env.account}`);
console.log(`   Stack Name: ${envConfig.stackName}`);

if (existingUserPoolId && existingUserPoolClientId) {
  console.log(`   Using existing Cognito User Pool: ${existingUserPoolId}`);
} else {
  console.log(`   Creating new Cognito User Pool and Client`);
}

// Handle production warning if needed
handleProductionWarning().then(() => {
  // Create the stack with environment-specific configuration
  new Acsd2PStack(app, envConfig.stackName, {
    env: envConfig.env,
    stackName: envConfig.stackName,
    description: envConfig.description || `ACS Backend Stack for ${targetEnv} environment`,
    stage: envConfig.stage,
    existingUserPoolId,
    existingUserPoolClientId,
    existingUserPoolClientSecret,
    tags: {
      Environment: targetEnv,
      Project: 'ACS',
      ManagedBy: 'CDK',
      Region: envConfig.env.region,
      DeployedAt: new Date().toISOString()
    }
  });
});