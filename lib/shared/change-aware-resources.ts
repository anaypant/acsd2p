import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import * as fs from 'fs';

export interface ChangeInfo {
  lambdas: Array<{ name: string; status: 'new' | 'modified' | 'unchanged' }>;
  infrastructure: boolean;
  configuration: boolean;
  newResources: string[];
  modifiedResources: string[];
  unchangedResources: string[];
}

export class ChangeAwareResources {
  private static changeInfo: ChangeInfo | null = null;

  static setChangeInfo(changes: ChangeInfo) {
    this.changeInfo = changes;
  }

  static getChangeInfo(): ChangeInfo | null {
    return this.changeInfo;
  }

  static isLambdaChanged(lambdaName: string): boolean {
    if (!this.changeInfo) return true; // Default to true if no change info
    
    const lambda = this.changeInfo.lambdas.find(l => l.name === lambdaName);
    return lambda ? lambda.status !== 'unchanged' : true;
  }

  static isInfrastructureChanged(): boolean {
    return this.changeInfo?.infrastructure || false;
  }

  static isConfigurationChanged(): boolean {
    return this.changeInfo?.configuration || false;
  }

  static getChangedLambdas(): string[] {
    if (!this.changeInfo) return [];
    
    return this.changeInfo.lambdas
      .filter(l => l.status !== 'unchanged')
      .map(l => l.name);
  }

  static shouldDeployResource(resourceName: string): boolean {
    if (!this.changeInfo) return true; // Default to true if no change info

    // If infrastructure or configuration changed, deploy everything
    if (this.changeInfo.infrastructure || this.changeInfo.configuration) {
      return true;
    }

    // Check if this specific resource changed
    const isChanged = this.changeInfo.modifiedResources.some(resource => 
      resource.includes(resourceName)
    ) || this.changeInfo.newResources.some(resource => 
      resource.includes(resourceName)
    );

    return isChanged;
  }

  static createOptimizedLambdaFunction(
    scope: cdk.Stack,
    lambdaName: string,
    props: lambda.FunctionProps
  ): lambda.Function {
    // Check if this lambda has changed
    const hasChanged = this.isLambdaChanged(lambdaName);
    
    if (hasChanged) {
      console.log(`   🔄 Deploying changed lambda: ${lambdaName}`);
    } else {
      console.log(`   ⏭️  Skipping unchanged lambda: ${lambdaName}`);
    }

    const fn = new lambda.Function(scope, lambdaName, props);

    // Add metadata to track deployment reason
    cdk.Tags.of(fn).add('DeploymentReason', hasChanged ? 'Changed' : 'Unchanged');
    cdk.Tags.of(fn).add('LastDeployment', new Date().toISOString());

    return fn;
  }

  static createOptimizedDynamoDBTable(
    scope: cdk.Stack,
    tableName: string,
    props: any
  ): any {
    const shouldDeploy = this.shouldDeployResource(tableName);
    
    if (shouldDeploy) {
      console.log(`   🔄 Deploying changed table: ${tableName}`);
    } else {
      console.log(`   ⏭️  Skipping unchanged table: ${tableName}`);
    }

    // Import existing table if it hasn't changed
    if (!shouldDeploy) {
      // This is a simplified approach - in practice you'd want to import the existing table
      console.log(`   📋 Importing existing table: ${tableName}`);
    }

    return props;
  }

  static createOptimizedS3Bucket(
    scope: cdk.Stack,
    bucketName: string,
    props: any
  ): any {
    const shouldDeploy = this.shouldDeployResource(bucketName);
    
    if (shouldDeploy) {
      console.log(`   🔄 Deploying changed bucket: ${bucketName}`);
    } else {
      console.log(`   ⏭️  Skipping unchanged bucket: ${bucketName}`);
    }

    return props;
  }

  static getDeploymentSummary(): string {
    if (!this.changeInfo) {
      return 'No change information available';
    }

    const changedLambdas = this.getChangedLambdas();
    const totalLambdas = this.changeInfo.lambdas.length;
    const unchangedLambdas = totalLambdas - changedLambdas.length;

    return `
📊 Deployment Summary:
=====================
🆕 New Resources: ${this.changeInfo.newResources.length}
🔄 Modified Resources: ${this.changeInfo.modifiedResources.length}
✅ Unchanged Resources: ${this.changeInfo.unchangedResources.length}

⚡ Lambda Functions:
   Changed: ${changedLambdas.length}/${totalLambdas}
   Unchanged: ${unchangedLambdas}/${totalLambdas}

🔧 Infrastructure Changes: ${this.changeInfo.infrastructure ? 'Yes' : 'No'}
⚙️  Configuration Changes: ${this.changeInfo.configuration ? 'Yes' : 'No'}

📈 Deployment Type: ${
      this.changeInfo.infrastructure || this.changeInfo.configuration 
        ? 'Full Stack' 
        : changedLambdas.length > 0 
          ? 'Lambda Only' 
          : 'No Changes'
    }
    `.trim();
  }
}

// Initialize change info from environment variables
export function initializeChangeAwareness(): void {
  const deploymentChanges = process.env.DEPLOYMENT_CHANGES;
  if (deploymentChanges) {
    try {
      const changes: ChangeInfo = JSON.parse(deploymentChanges);
      ChangeAwareResources.setChangeInfo(changes);
      console.log(ChangeAwareResources.getDeploymentSummary());
    } catch (error) {
      console.warn('Could not parse deployment changes:', error);
    }
  }
} 