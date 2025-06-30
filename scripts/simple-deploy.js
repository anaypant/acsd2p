#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`\n${step} ${message}`, 'cyan');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

// Check if .env.local exists and create from template if needed
function setupEnvironment() {
  const envPath = path.join(__dirname, '../.env.local');
  const templatePath = path.join(__dirname, '../config.env');
  
  if (!fs.existsSync(envPath)) {
    logStep('📁', 'Setting up environment configuration...');
    if (fs.existsSync(templatePath)) {
      fs.copyFileSync(templatePath, envPath);
      logSuccess('Created .env.local from template');
      logInfo('Please update .env.local with your actual values before deploying');
      return false; // Need user to configure
    } else {
      logError('config.env template not found');
      return false;
    }
  }
  return true;
}

// Validate environment configuration
function validateEnvironment(env) {
  logStep('🔍', 'Validating environment configuration...');
  
  const envConfig = {
    dev: { region: 'us-west-1', account: '872515253712' },
    prod: { region: 'us-east-2', account: '872515253712' }
  };
  
  if (!envConfig[env]) {
    logError(`Invalid environment: ${env}. Use 'dev' or 'prod'`);
    return false;
  }
  
  logSuccess(`Environment: ${env.toUpperCase()}`);
  logInfo(`Region: ${envConfig[env].region}`);
  logInfo(`Account: ${envConfig[env].account}`);
  return true;
}

// Run CDK command
function runCdkCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    logStep('🚀', `Running: npx cdk ${command} ${args.join(' ')}`);
    
    const cdkProcess = spawn('npx', ['cdk', command, ...args], {
      stdio: 'inherit',
      shell: true
    });
    
    cdkProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`CDK command failed with code ${code}`));
      }
    });
    
    cdkProcess.on('error', (error) => {
      reject(error);
    });
  });
}

// Main deployment function
async function deploy(environment = 'dev', options = {}) {
  try {
    log('🏗️  ACS CDK Infrastructure Deployment', 'bright');
    log('=====================================\n', 'bright');
    
    // Setup environment
    if (!setupEnvironment()) {
      logError('Environment setup failed. Please check your configuration.');
      process.exit(1);
    }
    
    // Validate environment
    if (!validateEnvironment(environment)) {
      process.exit(1);
    }
    
    // Production warning
    if (environment === 'prod') {
      logWarning('PRODUCTION DEPLOYMENT DETECTED');
      logWarning('This will deploy to us-east-2 and affect live users');
      logWarning('Press Ctrl+C to cancel or wait 10 seconds to continue...');
      
      await new Promise(resolve => {
        const timeout = setTimeout(resolve, 10000);
        process.on('SIGINT', () => {
          clearTimeout(timeout);
          logInfo('Deployment cancelled by user');
          process.exit(0);
        });
      });
    }
    
    // Build arguments
    const args = [`--context env=${environment}`];
    
    if (options.requireApproval === false) {
      args.push('--require-approval never');
    }
    
    if (options.force) {
      args.push('--force');
    }
    
    // Run deployment
    await runCdkCommand('deploy', args);
    
    logSuccess('Deployment completed successfully!');
    
    // Show next steps
    logStep('📋', 'Next Steps:');
    logInfo('1. Test your API endpoints');
    logInfo('2. Check CloudWatch logs for any errors');
    logInfo('3. Verify resources in AWS Console');
    
  } catch (error) {
    logError(`Deployment failed: ${error.message}`);
    process.exit(1);
  }
}

// Command line interface
function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'deploy':
    case undefined:
      const env = args[1] || 'dev';
      const options = {
        requireApproval: args.includes('--no-approval') ? false : undefined,
        force: args.includes('--force')
      };
      deploy(env, options);
      break;
      
    case 'destroy':
      const destroyEnv = args[1] || 'dev';
      logWarning(`Destroying ${destroyEnv} environment...`);
      runCdkCommand('destroy', [`--context env=${destroyEnv}`, '--force']);
      break;
      
    case 'diff':
      const diffEnv = args[1] || 'dev';
      runCdkCommand('diff', [`--context env=${diffEnv}`]);
      break;
      
    case 'synth':
      const synthEnv = args[1] || 'dev';
      runCdkCommand('synth', [`--context env=${synthEnv}`]);
      break;
      
    case 'help':
      log('ACS CDK Deployment Script', 'bright');
      log('========================\n');
      log('Usage: node scripts/simple-deploy.js [command] [environment] [options]\n');
      log('Commands:');
      log('  deploy [env]     Deploy infrastructure (default: dev)');
      log('  destroy [env]    Destroy infrastructure (default: dev)');
      log('  diff [env]       Show deployment differences (default: dev)');
      log('  synth [env]      Synthesize CloudFormation template (default: dev)');
      log('  help             Show this help message\n');
      log('Environments:');
      log('  dev              Development environment (us-west-1)');
      log('  prod             Production environment (us-east-2)\n');
      log('Options:');
      log('  --no-approval    Skip approval prompts');
      log('  --force          Force deployment even if no changes');
      break;
      
    default:
      logError(`Unknown command: ${command}`);
      logInfo('Run "node scripts/simple-deploy.js help" for usage information');
      process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { deploy, runCdkCommand }; 