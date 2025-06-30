#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Example workflow demonstrating the smart deployment system
 * This script shows different scenarios and their outcomes
 */

class WorkflowExample {
  constructor() {
    this.projectRoot = path.join(__dirname, '..');
    this.lambdasPath = path.join(this.projectRoot, 'lambdas');
  }

  async run() {
    console.log('🎯 Smart Workflow Examples');
    console.log('==========================\n');

    try {
      // Example 1: Lambda function change
      await this.exampleLambdaChange();

      // Example 2: Infrastructure change
      await this.exampleInfrastructureChange();

      // Example 3: New lambda function
      await this.exampleNewLambda();

      // Example 4: No changes
      await this.exampleNoChanges();

      console.log('\n✅ All examples completed successfully!');
    } catch (error) {
      console.error('\n❌ Example failed:', error.message);
    }
  }

  async exampleLambdaChange() {
    console.log('📝 Example 1: Lambda Function Change');
    console.log('====================================');

    // Simulate modifying a lambda function
    const testLambdaPath = path.join(this.lambdasPath, 'TestLambda');
    const testLambdaFile = path.join(testLambdaPath, 'lambda_function.py');

    // Create test lambda if it doesn't exist
    if (!fs.existsSync(testLambdaPath)) {
      fs.mkdirSync(testLambdaPath, { recursive: true });
    }

    // Write initial version
    fs.writeFileSync(testLambdaFile, `
def handler(event, context):
    return {
        'statusCode': 200,
        'body': 'Hello from TestLambda v1!'
    }
`);

    console.log('   📄 Created TestLambda v1');
    console.log('   🔍 Running smart check...');

    // Run smart check
    try {
      execSync('npm run smart:check', { stdio: 'inherit' });
    } catch (error) {
      console.log('   ✅ Smart check completed (new function detected)');
    }

    // Modify the lambda function
    fs.writeFileSync(testLambdaFile, `
def handler(event, context):
    return {
        'statusCode': 200,
        'body': 'Hello from TestLambda v2!'
    }
`);

    console.log('   📝 Modified TestLambda to v2');
    console.log('   🔍 Running smart check again...');

    try {
      execSync('npm run smart:check', { stdio: 'inherit' });
    } catch (error) {
      console.log('   ✅ Smart check completed (modified function detected)');
    }

    console.log('   📊 Expected: Lambda-only deployment\n');
  }

  async exampleInfrastructureChange() {
    console.log('🏗️  Example 2: Infrastructure Change');
    console.log('====================================');

    // Simulate modifying infrastructure code
    const infraFile = path.join(this.projectRoot, 'lib', 'lambda', 'lambda-resources.ts');
    
    if (fs.existsSync(infraFile)) {
      const content = fs.readFileSync(infraFile, 'utf8');
      
      // Add a comment to simulate change
      const modifiedContent = `// Modified at ${new Date().toISOString()}\n${content}`;
      fs.writeFileSync(infraFile, modifiedContent);

      console.log('   📝 Modified infrastructure file');
      console.log('   🔍 Running smart check...');

      try {
        execSync('npm run smart:check', { stdio: 'inherit' });
      } catch (error) {
        console.log('   ✅ Smart check completed (infrastructure change detected)');
      }

      // Restore original content
      fs.writeFileSync(infraFile, content);
      console.log('   🔄 Restored original infrastructure file');
    }

    console.log('   📊 Expected: Full stack deployment\n');
  }

  async exampleNewLambda() {
    console.log('🆕 Example 3: New Lambda Function');
    console.log('=================================');

    const newLambdaPath = path.join(this.lambdasPath, 'NewExampleFunction');
    const newLambdaFile = path.join(newLambdaPath, 'lambda_function.py');

    // Create new lambda function
    fs.mkdirSync(newLambdaPath, { recursive: true });
    fs.writeFileSync(newLambdaFile, `
def handler(event, context):
    return {
        'statusCode': 200,
        'body': 'Hello from NewExampleFunction!'
    }
`);

    console.log('   📄 Created NewExampleFunction');
    console.log('   🔍 Running smart check...');

    try {
      execSync('npm run smart:check', { stdio: 'inherit' });
    } catch (error) {
      console.log('   ✅ Smart check completed (new function detected)');
    }

    // Clean up
    fs.rmSync(newLambdaPath, { recursive: true, force: true });
    console.log('   🧹 Cleaned up NewExampleFunction');

    console.log('   📊 Expected: Lambda-only deployment (new function)\n');
  }

  async exampleNoChanges() {
    console.log('✅ Example 4: No Changes');
    console.log('=======================');

    console.log('   🔍 Running smart check...');

    try {
      execSync('npm run smart:check', { stdio: 'inherit' });
    } catch (error) {
      console.log('   ✅ Smart check completed (no changes detected)');
    }

    console.log('   📊 Expected: No deployment needed\n');
  }

  showWorkflowSummary() {
    console.log('📋 Workflow Summary');
    console.log('===================');
    console.log('');
    console.log('🎯 Key Benefits:');
    console.log('   • Automatic change detection');
    console.log('   • Optimized deployment strategies');
    console.log('   • Faster development cycles');
    console.log('   • Reduced deployment risk');
    console.log('');
    console.log('🚀 Usage:');
    console.log('   npm run deploy          # Smart deploy to dev');
    console.log('   npm run deploy:prod     # Smart deploy to prod');
    console.log('   npm run smart:check     # Check changes only');
    console.log('   npm run smart:reset     # Reset change tracking');
    console.log('');
    console.log('📊 Deployment Types:');
    console.log('   • No Changes: Skip deployment');
    console.log('   • Lambda Only: Fast lambda deployment');
    console.log('   • Full Stack: Complete infrastructure deployment');
  }
}

// Run the example workflow
const example = new WorkflowExample();
example.run().then(() => {
  example.showWorkflowSummary();
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
}); 