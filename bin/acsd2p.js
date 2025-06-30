#!/usr/bin/env node
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
const cdk = __importStar(require("aws-cdk-lib"));
const acsd2p_stack_1 = require("../lib/acsd2p-stack");
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
// Load environment variables from .env.local file
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log('📁 Loaded configuration from .env.local');
}
else {
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
}
else {
    console.log(`   Creating new Cognito User Pool and Client`);
}
// Handle production warning if needed
handleProductionWarning().then(() => {
    // Create the stack with environment-specific configuration
    new acsd2p_stack_1.Acsd2PStack(app, envConfig.stackName, {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWNzZDJwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYWNzZDJwLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0EsaURBQW1DO0FBQ25DLHNEQUFrRDtBQUNsRCwrQ0FBaUM7QUFDakMsMkNBQTZCO0FBQzdCLHVDQUF5QjtBQUV6QixrREFBa0Q7QUFDbEQsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsZUFBZSxDQUFDLENBQUM7QUFDdEQsSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7SUFDM0IsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDO0lBQ2pDLE9BQU8sQ0FBQyxHQUFHLENBQUMseUNBQXlDLENBQUMsQ0FBQztBQUN6RCxDQUFDO0tBQU0sQ0FBQztJQUNOLE9BQU8sQ0FBQyxHQUFHLENBQUMsNERBQTRELENBQUMsQ0FBQztBQUM1RSxDQUFDO0FBRUQsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7QUFFMUIsMkVBQTJFO0FBQzNFLE1BQU0sU0FBUyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxJQUFJLEtBQUssQ0FBQztBQUNwRixNQUFNLFNBQVMsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUMsQ0FBQztBQUVwRCxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7SUFDZixNQUFNLElBQUksS0FBSyxDQUFDLDRDQUE0QyxTQUFTLEVBQUUsQ0FBQyxDQUFDO0FBQzNFLENBQUM7QUFFRCx1REFBdUQ7QUFDdkQsTUFBTSxrQkFBa0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDO0FBQzdELE1BQU0sd0JBQXdCLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyw0QkFBNEIsQ0FBQztBQUMxRSxNQUFNLDRCQUE0QixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0NBQWdDLENBQUM7QUFFbEYsb0RBQW9EO0FBQ3BELEtBQUssVUFBVSx1QkFBdUI7SUFDcEMsSUFBSSxTQUFTLEtBQUssTUFBTSxFQUFFLENBQUM7UUFDekIsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1Q0FBdUMsQ0FBQyxDQUFDO1FBQ3JELE9BQU8sQ0FBQyxHQUFHLENBQUMsNERBQTRELENBQUMsQ0FBQztRQUMxRSxPQUFPLENBQUMsR0FBRyxDQUFDLG1FQUFtRSxDQUFDLENBQUM7UUFDakYsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNoQixPQUFPLENBQUMsR0FBRyxDQUFDLDZEQUE2RCxDQUFDLENBQUM7UUFDM0UsT0FBTyxDQUFDLEdBQUcsQ0FBQyw2RUFBNkUsQ0FBQyxDQUFDO1FBQzNGLE9BQU8sQ0FBQyxHQUFHLENBQUMsNkJBQTZCLENBQUMsQ0FBQztRQUMzQyxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ2hCLE9BQU8sQ0FBQyxHQUFHLENBQUMsMENBQTBDLENBQUMsQ0FBQztRQUN4RCxNQUFNLElBQUksT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQzNELENBQUM7QUFDSCxDQUFDO0FBRUQsa0NBQWtDO0FBQ2xDLE9BQU8sQ0FBQyxHQUFHLENBQUMsOEJBQThCLENBQUMsQ0FBQztBQUM1QyxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixTQUFTLENBQUMsV0FBVyxFQUFFLEVBQUUsQ0FBQyxDQUFDO0FBQzFELE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxTQUFTLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7QUFDbEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFlLFNBQVMsQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztBQUNwRCxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixTQUFTLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQztBQUVyRCxJQUFJLGtCQUFrQixJQUFJLHdCQUF3QixFQUFFLENBQUM7SUFDbkQsT0FBTyxDQUFDLEdBQUcsQ0FBQyx3Q0FBd0Msa0JBQWtCLEVBQUUsQ0FBQyxDQUFDO0FBQzVFLENBQUM7S0FBTSxDQUFDO0lBQ04sT0FBTyxDQUFDLEdBQUcsQ0FBQyw4Q0FBOEMsQ0FBQyxDQUFDO0FBQzlELENBQUM7QUFFRCxzQ0FBc0M7QUFDdEMsdUJBQXVCLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO0lBQ2xDLDJEQUEyRDtJQUMzRCxJQUFJLDBCQUFXLENBQUMsR0FBRyxFQUFFLFNBQVMsQ0FBQyxTQUFTLEVBQUU7UUFDeEMsR0FBRyxFQUFFLFNBQVMsQ0FBQyxHQUFHO1FBQ2xCLFNBQVMsRUFBRSxTQUFTLENBQUMsU0FBUztRQUM5QixXQUFXLEVBQUUsU0FBUyxDQUFDLFdBQVcsSUFBSSx5QkFBeUIsU0FBUyxjQUFjO1FBQ3RGLEtBQUssRUFBRSxTQUFTLENBQUMsS0FBSztRQUN0QixrQkFBa0I7UUFDbEIsd0JBQXdCO1FBQ3hCLDRCQUE0QjtRQUM1QixJQUFJLEVBQUU7WUFDSixXQUFXLEVBQUUsU0FBUztZQUN0QixPQUFPLEVBQUUsS0FBSztZQUNkLFNBQVMsRUFBRSxLQUFLO1lBQ2hCLE1BQU0sRUFBRSxTQUFTLENBQUMsR0FBRyxDQUFDLE1BQU07WUFDNUIsVUFBVSxFQUFFLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFO1NBQ3JDO0tBQ0YsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIjIS91c3IvYmluL2VudiBub2RlXHJcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XHJcbmltcG9ydCB7IEFjc2QyUFN0YWNrIH0gZnJvbSAnLi4vbGliL2Fjc2QycC1zdGFjayc7XHJcbmltcG9ydCAqIGFzIGRvdGVudiBmcm9tICdkb3RlbnYnO1xyXG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xyXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XHJcblxyXG4vLyBMb2FkIGVudmlyb25tZW50IHZhcmlhYmxlcyBmcm9tIC5lbnYubG9jYWwgZmlsZVxyXG5jb25zdCBlbnZQYXRoID0gcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy5lbnYubG9jYWwnKTtcclxuaWYgKGZzLmV4aXN0c1N5bmMoZW52UGF0aCkpIHtcclxuICBkb3RlbnYuY29uZmlnKHsgcGF0aDogZW52UGF0aCB9KTtcclxuICBjb25zb2xlLmxvZygn8J+TgSBMb2FkZWQgY29uZmlndXJhdGlvbiBmcm9tIC5lbnYubG9jYWwnKTtcclxufSBlbHNlIHtcclxuICBjb25zb2xlLmxvZygn4pqg77iPICAuZW52LmxvY2FsIGZpbGUgbm90IGZvdW5kLCB1c2luZyBkZWZhdWx0IGNvbmZpZ3VyYXRpb24nKTtcclxufVxyXG5cclxuY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcclxuXHJcbi8vIEdldCB0aGUgdGFyZ2V0IGVudmlyb25tZW50IGZyb20gY29tbWFuZCBsaW5lIGFyZ3VtZW50cyBvciBkZWZhdWx0IHRvIGRldlxyXG5jb25zdCB0YXJnZXRFbnYgPSBhcHAubm9kZS50cnlHZXRDb250ZXh0KCdlbnYnKSB8fCBwcm9jZXNzLmVudi5FTlZJUk9OTUVOVCB8fCAnZGV2JztcclxuY29uc3QgZW52Q29uZmlnID0gYXBwLm5vZGUudHJ5R2V0Q29udGV4dCh0YXJnZXRFbnYpO1xyXG5cclxuaWYgKCFlbnZDb25maWcpIHtcclxuICB0aHJvdyBuZXcgRXJyb3IoYEVudmlyb25tZW50IGNvbmZpZ3VyYXRpb24gbm90IGZvdW5kIGZvcjogJHt0YXJnZXRFbnZ9YCk7XHJcbn1cclxuXHJcbi8vIEdldCBleGlzdGluZyBDb2duaXRvIHBhcmFtZXRlcnMgZnJvbSAuZW52LmxvY2FsIGZpbGVcclxuY29uc3QgZXhpc3RpbmdVc2VyUG9vbElkID0gcHJvY2Vzcy5lbnYuRVhJU1RJTkdfVVNFUl9QT09MX0lEO1xyXG5jb25zdCBleGlzdGluZ1VzZXJQb29sQ2xpZW50SWQgPSBwcm9jZXNzLmVudi5FWElTVElOR19VU0VSX1BPT0xfQ0xJRU5UX0lEO1xyXG5jb25zdCBleGlzdGluZ1VzZXJQb29sQ2xpZW50U2VjcmV0ID0gcHJvY2Vzcy5lbnYuRVhJU1RJTkdfVVNFUl9QT09MX0NMSUVOVF9TRUNSRVQ7XHJcblxyXG4vLyBGdW5jdGlvbiB0byBoYW5kbGUgcHJvZHVjdGlvbiBkZXBsb3ltZW50IHdhcm5pbmdzXHJcbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZVByb2R1Y3Rpb25XYXJuaW5nKCkge1xyXG4gIGlmICh0YXJnZXRFbnYgPT09ICdwcm9kJykge1xyXG4gICAgY29uc29sZS5sb2coJ1xcbvCfmqggUFJPRFVDVElPTiBERVBMT1lNRU5UIFdBUk5JTkcg8J+aqCcpO1xyXG4gICAgY29uc29sZS5sb2coJ+KaoO+4jyAgWW91IGFyZSBhYm91dCB0byBkZXBsb3kgdG8gdGhlIFBST0RVQ1RJT04gZW52aXJvbm1lbnQhJyk7XHJcbiAgICBjb25zb2xlLmxvZygn4pqg77iPICBFbnZpcm9ubWVudDogUFJPRCB8IFJlZ2lvbjogdXMtZWFzdC0yIHwgQWNjb3VudDogODcyNTE1MjUzNzEyJyk7XHJcbiAgICBjb25zb2xlLmxvZygnJyk7XHJcbiAgICBjb25zb2xlLmxvZygnVGhpcyBkZXBsb3ltZW50IHdpbGwgYWZmZWN0IGxpdmUgdXNlcnMgYW5kIHByb2R1Y3Rpb24gZGF0YS4nKTtcclxuICAgIGNvbnNvbGUubG9nKCdUbyBwcm9jZWVkLCBydW46IG5weCBjZGsgZGVwbG95IC0tY29udGV4dCBlbnY9cHJvZCAtLXJlcXVpcmUtYXBwcm92YWwgbmV2ZXInKTtcclxuICAgIGNvbnNvbGUubG9nKCdUbyBjYW5jZWwsIHByZXNzIEN0cmwrQyBub3cnKTtcclxuICAgIGNvbnNvbGUubG9nKCcnKTtcclxuICAgIGNvbnNvbGUubG9nKCdEZXBsb3ltZW50IHdpbGwgcHJvY2VlZCBpbiAxMCBzZWNvbmRzLi4uJyk7XHJcbiAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTAwMDApKTtcclxuICB9XHJcbn1cclxuXHJcbi8vIERpc3BsYXkgZW52aXJvbm1lbnQgaW5mb3JtYXRpb25cclxuY29uc29sZS5sb2coYPCfk4sgRGVwbG95bWVudCBDb25maWd1cmF0aW9uOmApO1xyXG5jb25zb2xlLmxvZyhgICAgRW52aXJvbm1lbnQ6ICR7dGFyZ2V0RW52LnRvVXBwZXJDYXNlKCl9YCk7XHJcbmNvbnNvbGUubG9nKGAgICBSZWdpb246ICR7ZW52Q29uZmlnLmVudi5yZWdpb259YCk7XHJcbmNvbnNvbGUubG9nKGAgICBBY2NvdW50OiAke2VudkNvbmZpZy5lbnYuYWNjb3VudH1gKTtcclxuY29uc29sZS5sb2coYCAgIFN0YWNrIE5hbWU6ICR7ZW52Q29uZmlnLnN0YWNrTmFtZX1gKTtcclxuXHJcbmlmIChleGlzdGluZ1VzZXJQb29sSWQgJiYgZXhpc3RpbmdVc2VyUG9vbENsaWVudElkKSB7XHJcbiAgY29uc29sZS5sb2coYCAgIFVzaW5nIGV4aXN0aW5nIENvZ25pdG8gVXNlciBQb29sOiAke2V4aXN0aW5nVXNlclBvb2xJZH1gKTtcclxufSBlbHNlIHtcclxuICBjb25zb2xlLmxvZyhgICAgQ3JlYXRpbmcgbmV3IENvZ25pdG8gVXNlciBQb29sIGFuZCBDbGllbnRgKTtcclxufVxyXG5cclxuLy8gSGFuZGxlIHByb2R1Y3Rpb24gd2FybmluZyBpZiBuZWVkZWRcclxuaGFuZGxlUHJvZHVjdGlvbldhcm5pbmcoKS50aGVuKCgpID0+IHtcclxuICAvLyBDcmVhdGUgdGhlIHN0YWNrIHdpdGggZW52aXJvbm1lbnQtc3BlY2lmaWMgY29uZmlndXJhdGlvblxyXG4gIG5ldyBBY3NkMlBTdGFjayhhcHAsIGVudkNvbmZpZy5zdGFja05hbWUsIHtcclxuICAgIGVudjogZW52Q29uZmlnLmVudixcclxuICAgIHN0YWNrTmFtZTogZW52Q29uZmlnLnN0YWNrTmFtZSxcclxuICAgIGRlc2NyaXB0aW9uOiBlbnZDb25maWcuZGVzY3JpcHRpb24gfHwgYEFDUyBCYWNrZW5kIFN0YWNrIGZvciAke3RhcmdldEVudn0gZW52aXJvbm1lbnRgLFxyXG4gICAgc3RhZ2U6IGVudkNvbmZpZy5zdGFnZSxcclxuICAgIGV4aXN0aW5nVXNlclBvb2xJZCxcclxuICAgIGV4aXN0aW5nVXNlclBvb2xDbGllbnRJZCxcclxuICAgIGV4aXN0aW5nVXNlclBvb2xDbGllbnRTZWNyZXQsXHJcbiAgICB0YWdzOiB7XHJcbiAgICAgIEVudmlyb25tZW50OiB0YXJnZXRFbnYsXHJcbiAgICAgIFByb2plY3Q6ICdBQ1MnLFxyXG4gICAgICBNYW5hZ2VkQnk6ICdDREsnLFxyXG4gICAgICBSZWdpb246IGVudkNvbmZpZy5lbnYucmVnaW9uLFxyXG4gICAgICBEZXBsb3llZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcclxuICAgIH1cclxuICB9KTtcclxufSk7Il19