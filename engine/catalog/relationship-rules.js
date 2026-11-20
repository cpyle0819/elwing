import { serviceExclusions } from './service-exclusions.js';
import { resourceTypesAllow } from './resource-types.js';
export { serviceExclusions };
import {
  additionalReferences,
  additionalApiReferences,
  additionalRelationships,
} from './additional-relationships.js';
import {
  serviceEventReferences,
  serviceEventRelationships,
} from './service-event-relationships.js';
// Reviewed AWS sources. Summaries describe the evidence used, rather than claiming AWS defines our UI labels.
export const ruleReferences = {
  ...serviceEventReferences,
  ...additionalReferences,
  glueReader: {
    url: 'https://docs.aws.amazon.com/glue/latest/dg/aws-glue-api-crawler-pyspark-extensions-dynamic-frame-reader.html',
    summary:
      'DynamicFrameReader.from_options reads data using S3, MySQL, PostgreSQL, Redshift, SQL Server and Oracle connections, with paths or JDBC connection options.',
  },
  glueWriter: {
    url: 'https://docs.aws.amazon.com/glue/latest/dg/aws-glue-api-crawler-pyspark-extensions-dynamic-frame-writer.html',
    summary:
      'DynamicFrameWriter.from_options writes data using S3 and supported JDBC connection types, including Redshift, with the configured path or database table.',
  },
  glueJdbc: {
    url: 'https://docs.aws.amazon.com/glue/latest/dg/connection-properties.html',
    summary:
      'Glue supports JDBC connections to relational data stores, including RDS engines. ETL data stores must be reachable from the job subnet and use configured database credentials.',
  },
  glueRedshift: {
    url: 'https://docs.aws.amazon.com/glue/latest/dg/aws-glue-programming-etl-connect-redshift-home.html',
    summary:
      'Glue reads and writes Redshift tables using a connection, an S3 temporary directory and the required IAM role, network access and database permissions.',
  },
  cloudTrailDelivery: {
    url: 'https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-service-event-cloudtrail.html',
    summary:
      'CloudTrail sends supported audit events to the default EventBridge bus. A logging trail and the appropriate event selectors are required.',
  },
  comprehendJob: {
    url: 'https://docs.aws.amazon.com/comprehend/latest/APIReference/API_StartEntitiesDetectionJob.html',
    summary:
      'Entity detection jobs read documents from InputDataConfig.S3Uri and store output at OutputDataConfig.S3Uri using a data access role.',
  },
  healthScribeJob: {
    url: 'https://docs.aws.amazon.com/transcribe/latest/APIReference/API_StartMedicalScribeJob.html',
    summary:
      'HealthScribe reads conversation media from S3 and writes transcripts and clinical notes to OutputBucketName using its data access role.',
  },
  humanReviewOutput: {
    url: 'https://docs.aws.amazon.com/sagemaker/latest/APIReference/API_FlowDefinitionOutputConfig.html',
    summary: 'Amazon A2I human review results are made available at the configured S3OutputPath.',
  },
  backint: {
    url: 'https://docs.aws.amazon.com/sap/latest/sap-hana/aws-backint-agent-sap-hana.html',
    summary:
      'The Backint agent runs on SAP HANA EC2 servers and backs up to, and restores from, S3 or AWS Backup.',
  },
  fargateTasks: {
    url: 'https://aws.amazon.com/fargate/faqs/',
    summary: 'Amazon ECS and EKS schedule containers onto AWS Fargate.',
  },
  bottlerocket: {
    url: 'https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-bottlerocket.html',
    summary: 'The ECS-optimized Bottlerocket AMI runs container instances and integrates with ECS.',
  },
  cdkDeploy: {
    url: 'https://docs.aws.amazon.com/cdk/v2/guide/deploy.html',
    summary:
      'CDK synthesizes CloudFormation templates, uploads deployment assets, and submits the templates to CloudFormation to provision resources.',
  },
  ec2Launch: {
    url: 'https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_RunInstances.html',
    summary:
      'RunInstances configures the AMI and supports enabling Nitro Enclaves on eligible instances.',
  },
  apiSubtypes: {
    url: 'https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-aws-services-reference.html',
    summary:
      'HTTP API integrations include SQS SendMessage, ReceiveMessage, DeleteMessage, PurgeQueue, and EventBridge PutEvents.',
  },
  sqsHandler: {
    url: 'https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html',
    summary:
      'Lambda event source mappings poll SQS queues and invoke functions with batches of messages. The queue and function must be in the same Region.',
  },
  polling: {
    url: 'https://docs.aws.amazon.com/lambda/latest/dg/invocation-eventsourcemapping.html',
    summary:
      'Lambda event source mappings poll queues/streams and invoke functions. API Gateway, S3, and SNS can directly invoke functions.',
  },
  apiDdb: {
    url: 'https://aws.amazon.com/blogs/compute/using-amazon-api-gateway-as-a-proxy-for-dynamodb/',
    summary: 'AWS demonstrates REST API service proxies for DynamoDB PutItem and Query.',
  },
  apiS3: {
    url: 'https://docs.aws.amazon.com/apigateway/latest/developerguide/integrating-api-with-aws-services-s3.html',
    summary: 'REST API service proxy exposes S3 object GET and upload operations.',
  },
  cognito: {
    url: 'https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-integrate-with-cognito.html',
    summary:
      'A COGNITO_USER_POOLS authorizer authorizes API calls using client-provided identity/access tokens.',
  },
  sdk: {
    url: 'https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html#nodejs-handler-sdk',
    summary:
      'Lambda handler code uses AWS SDK clients to call AWS service APIs; the example stores a receipt using PutObject.',
  },
  invoke: {
    url: 'https://docs.aws.amazon.com/lambda/latest/api/API_Invoke.html',
    summary: 'Invoke executes a Lambda function synchronously or asynchronously.',
  },
  send: {
    url: 'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_SendMessage.html',
    summary: 'SendMessage delivers a message to the specified SQS queue.',
  },
  receive: {
    url: 'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_ReceiveMessage.html',
    summary: 'ReceiveMessage retrieves messages from an SQS queue, with optional long polling.',
  },
  getItem: {
    url: 'https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_GetItem.html',
    summary: 'GetItem reads the attributes of an item identified by its primary key.',
  },
  putItem: {
    url: 'https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_PutItem.html',
    summary: 'PutItem creates or replaces an item in a table.',
  },
  getObject: {
    url: 'https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html',
    summary: 'GetObject retrieves an object from S3.',
  },
  rds: {
    url: 'https://docs.aws.amazon.com/lambda/latest/dg/services-rds.html',
    summary: 'A Lambda function can connect directly to an RDS database or through RDS Proxy.',
  },
  bedrock: {
    url: 'https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_InvokeModel.html',
    summary: 'InvokeModel invokes a Bedrock model for inference.',
  },
  putEvents: {
    url: 'https://docs.aws.amazon.com/eventbridge/latest/APIReference/API_PutEvents.html',
    summary: 'PutEvents sends custom events to EventBridge for rule matching.',
  },
  origins: {
    url: 'https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistS3AndCustomOrigins.html',
    summary:
      'CloudFront sends origin requests to S3, API Gateway, EC2 HTTP servers, and Lambda function URLs.',
  },
  dns: {
    url: 'https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/integration-with-other-services.html',
    summary:
      'Route 53 uses DNS to route traffic to CloudFront, API Gateway, EC2, and S3 website endpoints.',
  },
  events: {
    url: 'https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-targets.html',
    summary:
      'EventBridge targets include asynchronous Lambda invocation, API Gateway invocation, and SQS SendMessage.',
  },
  s3Events: {
    url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/notification-how-to-event-types-and-destinations.html',
    summary:
      'S3 event notifications can invoke Lambda, send to standard SQS queues, publish to standard SNS topics, or send events to EventBridge.',
  },
  snsSubscribe: {
    url: 'https://docs.aws.amazon.com/sns/latest/api/API_Subscribe.html',
    summary:
      'Subscribe associates a topic with an endpoint. The sqs, lambda, and firehose protocols use queue, function, and delivery-stream ARNs. Firehose requires SubscriptionRoleArn.',
  },
  snsPublish: {
    url: 'https://docs.aws.amazon.com/sns/latest/api/API_Publish.html',
    summary: 'Publish sends a message to an SNS topic, which delivers to subscribed endpoints.',
  },
  snsQueue: {
    url: 'https://docs.aws.amazon.com/sns/latest/dg/subscribe-sqs-queue-to-sns-topic.html',
    summary:
      'A queue is subscribed through SNS Subscribe; SNS sends messages to it with SQS SendMessage permission.',
  },
};
// Popup links use API references; the broader evidence above supports the relationship claims.
const api = (label, path) => ({ label, url: `https://docs.aws.amazon.com/${path}` });
export const relationshipApiReferences = {
  ...additionalApiReferences,
  glueReadFrame: api(
    'DynamicFrameReader.from_options',
    'glue/latest/dg/aws-glue-api-crawler-pyspark-extensions-dynamic-frame-reader.html',
  ),
  glueWriteFrame: api(
    'DynamicFrameWriter.from_options',
    'glue/latest/dg/aws-glue-api-crawler-pyspark-extensions-dynamic-frame-writer.html',
  ),
  entitiesJob: api(
    'StartEntitiesDetectionJob',
    'comprehend/latest/APIReference/API_StartEntitiesDetectionJob.html',
  ),
  scribeJob: api(
    'StartMedicalScribeJob',
    'transcribe/latest/APIReference/API_StartMedicalScribeJob.html',
  ),
  humanOutput: api(
    'FlowDefinitionOutputConfig (output configuration)',
    'sagemaker/latest/APIReference/API_FlowDefinitionOutputConfig.html',
  ),
  runTask: api('RunTask (launch configuration)', 'AmazonECS/latest/APIReference/API_RunTask.html'),
  runInstances: api(
    'RunInstances (host configuration)',
    'AWSEC2/latest/APIReference/API_RunInstances.html',
  ),
  changeSet: api(
    'CreateChangeSet (deployment configuration)',
    'AWSCloudFormation/latest/APIReference/API_CreateChangeSet.html',
  ),
  eventRule: api(
    'PutRule (event matching configuration)',
    'eventbridge/latest/APIReference/API_PutRule.html',
  ),
  trailSelectors: api(
    'PutEventSelectors (audit event configuration)',
    'awscloudtrail/latest/APIReference/API_PutEventSelectors.html',
  ),
  invoke: api('Invoke', 'lambda/latest/api/API_Invoke.html'),
  send: api('SendMessage', 'AWSSimpleQueueService/latest/APIReference/API_SendMessage.html'),
  receive: api(
    'ReceiveMessage',
    'AWSSimpleQueueService/latest/APIReference/API_ReceiveMessage.html',
  ),
  deleteMessage: api(
    'DeleteMessage',
    'AWSSimpleQueueService/latest/APIReference/API_DeleteMessage.html',
  ),
  purge: api('PurgeQueue', 'AWSSimpleQueueService/latest/APIReference/API_PurgeQueue.html'),
  query: api('Query', 'amazondynamodb/latest/APIReference/API_Query.html'),
  getItem: api('GetItem', 'amazondynamodb/latest/APIReference/API_GetItem.html'),
  putItem: api('PutItem', 'amazondynamodb/latest/APIReference/API_PutItem.html'),
  getObject: api('GetObject', 'AmazonS3/latest/API/API_GetObject.html'),
  putObject: api('PutObject', 'AmazonS3/latest/API/API_PutObject.html'),
  authorizer: api(
    'CreateAuthorizer (configuration)',
    'apigateway/latest/api/API_CreateAuthorizer.html',
  ),
  mapping: api(
    'CreateEventSourceMapping (configuration)',
    'lambda/latest/api/API_CreateEventSourceMapping.html',
  ),
  proxy: api(
    'CreateDBProxy (proxy configuration)',
    'AmazonRDS/latest/APIReference/API_CreateDBProxy.html',
  ),
  model: api('InvokeModel', 'bedrock/latest/APIReference/API_runtime_InvokeModel.html'),
  events: api('PutEvents', 'eventbridge/latest/APIReference/API_PutEvents.html'),
  publish: api('Publish', 'sns/latest/api/API_Publish.html'),
  origin: api('Origin (configuration)', 'cloudfront/latest/APIReference/API_Origin.html'),
  dns: api(
    'ChangeResourceRecordSets (configuration)',
    'Route53/latest/APIReference/API_ChangeResourceRecordSets.html',
  ),
  targets: api('PutTargets (configuration)', 'eventbridge/latest/APIReference/API_PutTargets.html'),
  notifications: api(
    'PutBucketNotificationConfiguration (configuration)',
    'AmazonS3/latest/API/API_PutBucketNotificationConfiguration.html',
  ),
  subscribe: api('Subscribe', 'sns/latest/api/API_Subscribe.html'),
};
const operationApiReferences = {
  'Entity detection job input': ['entitiesJob'],
  'Entity detection job output': ['entitiesJob'],
  'Medical scribe media input': ['scribeJob'],
  'Medical scribe output': ['scribeJob'],
  'Human review output': ['humanOutput'],
  'Fargate task launch': ['runTask'],
  'Bottlerocket AMI launch': ['runInstances'],
  'Nitro Enclaves host': ['runInstances'],
  'CloudFormation deployment': ['changeSet'],
  'CloudTrail event delivery': ['eventRule', 'trailSelectors'],
  'Lambda integration': ['invoke'],
  'SQS-SendMessage': ['send'],
  'SQS-ReceiveMessage': ['receive'],
  'SQS-DeleteMessage / SQS-PurgeQueue': ['deleteMessage', 'purge'],
  'EventBridge-PutEvents': ['events'],
  Query: ['query'],
  PutItem: ['putItem'],
  'GET object': ['getObject'],
  'PUT object': ['putObject'],
  'COGNITO_USER_POOLS authorizer': ['authorizer'],
  Invoke: ['invoke'],
  SendMessage: ['send'],
  'ReceiveMessage / event source mapping': ['receive', 'mapping'],
  'SQS event source mapping': ['mapping'],
  'GetItem / stream event source mapping': ['getItem', 'mapping'],
  GetObject: ['getObject'],
  PutObject: ['putObject'],
  'Database connection': ['proxy'],
  InvokeModel: ['model'],
  PutEvents: ['events'],
  Publish: ['publish'],
  'Origin HTTP(S) request': ['origin'],
  'DNS routing': ['dns'],
  'Asynchronous function target': ['invoke'],
  'SendMessage target': ['send'],
  'API Gateway target': ['targets'],
  'Bucket event notification': ['notifications'],
  'Bucket event delivery': ['notifications'],
  'Subscribed queue delivery': ['send'],
  Subscribe: ['subscribe'],
  'Topic notification': ['invoke'],
};
const sns = 'amazon-simple-notification-service';
const entry = (source, target, verb, operation, condition, ...references) => ({
  source,
  target,
  verb,
  operation,
  condition,
  references,
  apiReferences: operationApiReferences[operation],
  reviewed: '2026-09-16',
});

// Every selectable source/verb/target claim has its own operation, scope, and evidence.
// SDK rows combine Lambda's documented SDK support with the destination operation reference.
export const documentedRelationships = [
  {
    source: 'aws-glue',
    target: 'rds',
    verb: 'reads from',
    operation: 'Glue DynamicFrame read',
    condition:
      'A Glue Spark ETL job uses a supported JDBC driver for an RDS database engine, configured credentials and network reachability from its subnet. This is job data access, not a Data Catalog or crawler operation.',
    references: ['glueReader', 'glueJdbc'],
    apiReferences: ['glueReadFrame'],
    reviewed: '2026-11-05',
  },
  {
    source: 'aws-glue',
    target: 'rds',
    verb: 'writes to',
    operation: 'Glue DynamicFrame write',
    condition:
      'A Glue Spark ETL job uses a supported JDBC driver for an RDS database engine, configured credentials and network reachability from its subnet. This is job data access, not a Data Catalog or crawler operation.',
    references: ['glueWriter', 'glueJdbc'],
    apiReferences: ['glueWriteFrame'],
    reviewed: '2026-11-05',
  },
  {
    source: 'aws-glue',
    target: 'amazon-redshift',
    verb: 'reads from',
    operation: 'Glue DynamicFrame read',
    condition:
      'A Glue Spark ETL job uses a configured Redshift connection, S3 temporary directory and authorized IAM role. Network access and database permissions must permit the operation; the arrow represents the connector operation, not a direct storage transport.',
    references: ['glueReader', 'glueRedshift'],
    apiReferences: ['glueReadFrame'],
    reviewed: '2026-11-05',
  },
  {
    source: 'aws-glue',
    target: 'amazon-redshift',
    verb: 'writes to',
    operation: 'Glue DynamicFrame write',
    condition:
      'A Glue Spark ETL job uses a configured Redshift connection, S3 temporary directory and authorized IAM role. Network access and database permissions must permit the operation; the arrow represents the connector operation, not a direct storage transport.',
    references: ['glueWriter', 'glueRedshift'],
    apiReferences: ['glueWriteFrame'],
    reviewed: '2026-11-05',
  },
  {
    source: 'aws-glue',
    target: 's3',
    verb: 'reads from',
    operation: 'Glue DynamicFrame read',
    condition:
      'A Glue Spark ETL job accesses the configured S3 paths using its job role and the required object and encryption permissions. This is job data access, not an operation performed by the Glue Data Catalog.',
    references: ['glueReader'],
    apiReferences: ['glueReadFrame'],
    reviewed: '2026-11-05',
  },
  {
    source: 'aws-glue',
    target: 's3',
    verb: 'writes to',
    operation: 'Glue DynamicFrame write',
    condition:
      'A Glue Spark ETL job accesses the configured S3 paths using its job role and the required object and encryption permissions. This is job data access, not an operation performed by the Glue Data Catalog.',
    references: ['glueWriter', 'glueReader'],
    apiReferences: ['glueWriteFrame'],
    reviewed: '2026-11-05',
  },
  {
    ...entry(
      'sqs',
      'lambda',
      'handled by',
      'SQS event source mapping',
      'An enabled Lambda event source mapping polls the queue and invokes the function with message batches. The queue and function must share a Region. This arrow describes message processing, not a direct SQS invocation.',
      'sqsHandler',
    ),
    reviewed: '2026-09-21',
  },
  entry(
    'amazon-comprehend',
    's3',
    'reads from',
    'Entity detection job input',
    'An asynchronous entity-detection job reads documents from the configured S3 input location using its data access role.',
    'comprehendJob',
  ),
  entry(
    'amazon-comprehend',
    's3',
    'writes to',
    'Entity detection job output',
    'The job stores results at the configured S3 output location; access and encryption permissions must permit it.',
    'comprehendJob',
  ),
  entry(
    'aws-healthscribe',
    's3',
    'reads from',
    'Medical scribe media input',
    'StartMedicalScribeJob reads conversation audio from the Media S3 URI with the supplied data access role.',
    'healthScribeJob',
  ),
  entry(
    'aws-healthscribe',
    's3',
    'writes to',
    'Medical scribe output',
    'The job writes transcripts and clinical notes to OutputBucketName with the supplied data access role.',
    'healthScribeJob',
  ),
  entry(
    'amazon-augmented-ai-a2i',
    's3',
    'writes to',
    'Human review output',
    'The human review flow writes results to its configured S3OutputPath.',
    'humanReviewOutput',
  ),
  entry(
    'aws-backint-agent',
    's3',
    'writes to',
    'PutObject',
    'The SAP HANA Backint agent transfers backup files and catalogs to its configured S3 bucket.',
    'backint',
  ),
  entry(
    'aws-backint-agent',
    's3',
    'reads from',
    'GetObject',
    'The agent retrieves backup files and catalogs from S3 to restore SAP HANA.',
    'backint',
  ),
  entry(
    'amazon-elastic-container-service',
    'aws-fargate',
    'runs on',
    'Fargate task launch',
    'ECS launches tasks with FARGATE capacity. This arrow represents compute placement, not a network request.',
    'fargateTasks',
  ),
  entry(
    'bottlerocket',
    'ec2',
    'runs on',
    'Bottlerocket AMI launch',
    'Launch an ECS-optimized Bottlerocket AMI as an EC2 container instance. This arrow represents host placement.',
    'bottlerocket',
    'ec2Launch',
  ),
  entry(
    'aws-nitro-enclaves',
    'ec2',
    'runs on',
    'Nitro Enclaves host',
    'An enclave runs on an eligible EC2 parent instance with enclave support enabled. This arrow represents host placement.',
    'ec2Launch',
  ),
  entry(
    'aws-cloud-development-kit',
    'aws-cloudformation',
    'deploys with',
    'CloudFormation deployment',
    'The CDK CLI submits synthesized stack templates to CloudFormation to provision resources; bootstrap resources and deployment permissions are required.',
    'cdkDeploy',
  ),
  entry(
    'aws-cloudtrail',
    'eventbridge',
    'sends to',
    'CloudTrail event delivery',
    'CloudTrail delivers supported recorded audit events to the default event bus. Enable a logging trail and select the required event categories; match the source and CloudTrail detail-type in an EventBridge rule.',
    'cloudTrailDelivery',
  ),
  entry(
    'apigateway',
    'lambda',
    'invokes',
    'Lambda integration',
    'An API request invokes the integrated Lambda function.',
    'polling',
  ),
  entry(
    'apigateway',
    'sqs',
    'sends to',
    'SQS-SendMessage',
    'HTTP API AWS service integration; delivers a queue message.',
    'apiSubtypes',
  ),
  entry(
    'apigateway',
    'sqs',
    'reads from',
    'SQS-ReceiveMessage',
    'HTTP API AWS service integration; retrieves queue messages.',
    'apiSubtypes',
  ),
  entry(
    'apigateway',
    'sqs',
    'deletes from',
    'SQS-DeleteMessage / SQS-PurgeQueue',
    'Deletes one message or clears the queue, according to the configured integration.',
    'apiSubtypes',
  ),
  entry(
    'apigateway',
    'eventbridge',
    'sends to',
    'EventBridge-PutEvents',
    'HTTP API integration sends custom events to an event bus.',
    'apiSubtypes',
  ),
  entry(
    'apigateway',
    'dynamodb',
    'reads from',
    'Query',
    'REST API AWS service proxy queries a table/index.',
    'apiDdb',
  ),
  entry(
    'apigateway',
    'dynamodb',
    'writes to',
    'PutItem',
    'REST API AWS service proxy stores an item.',
    'apiDdb',
  ),
  entry(
    'apigateway',
    's3',
    'reads from',
    'GET object',
    'REST API S3 service proxy retrieves an object.',
    'apiS3',
  ),
  entry(
    'apigateway',
    's3',
    'writes to',
    'PUT object',
    'REST API S3 service proxy uploads an object.',
    'apiS3',
  ),
  entry(
    'apigateway',
    'cognito',
    'authorizes with',
    'COGNITO_USER_POOLS authorizer',
    'Uses client-provided Cognito tokens to authorize REST API calls; the client signs in.',
    'cognito',
  ),
  entry(
    'lambda',
    'lambda',
    'invokes',
    'Invoke',
    'Function code calls the Lambda Invoke API through an SDK.',
    'sdk',
    'invoke',
  ),
  entry(
    'lambda',
    'sqs',
    'sends to',
    'SendMessage',
    'Function code sends a message through the SQS SDK.',
    'sdk',
    'send',
  ),
  entry(
    'lambda',
    'sqs',
    'reads from',
    'ReceiveMessage / event source mapping',
    'Function code or a Lambda event source mapping polls the queue.',
    'sdk',
    'receive',
    'polling',
  ),
  entry(
    'lambda',
    'dynamodb',
    'reads from',
    'GetItem / stream event source mapping',
    'Function code reads an item, or Lambda polls an enabled DynamoDB stream.',
    'sdk',
    'getItem',
    'polling',
  ),
  entry(
    'lambda',
    'dynamodb',
    'writes to',
    'PutItem',
    'Function code creates or replaces a table item.',
    'sdk',
    'putItem',
  ),
  entry(
    'lambda',
    's3',
    'reads from',
    'GetObject',
    'Function code retrieves an S3 object.',
    'sdk',
    'getObject',
  ),
  entry(
    'lambda',
    's3',
    'writes to',
    'PutObject',
    'Function code uploads an object, as in the documented receipt example.',
    'sdk',
  ),
  entry(
    'lambda',
    'rds',
    'connects to',
    'Database connection',
    'Direct database connection or RDS Proxy; requires appropriate network and database access.',
    'rds',
  ),
  entry(
    'lambda',
    'bedrock',
    'invokes',
    'InvokeModel',
    'Function code requests model inference through the SDK.',
    'sdk',
    'bedrock',
  ),
  entry(
    'lambda',
    'eventbridge',
    'sends to',
    'PutEvents',
    'Function code sends custom events through the SDK.',
    'sdk',
    'putEvents',
  ),
  entry(
    'lambda',
    sns,
    'publishes to',
    'Publish',
    'Function code publishes a message to an SNS topic.',
    'sdk',
    'snsPublish',
  ),
  ...['s3', 'apigateway', 'ec2', 'lambda'].map((target) =>
    entry(
      'cloudfront',
      target,
      'forwards to',
      'Origin HTTP(S) request',
      target === 'lambda'
        ? 'Lambda function URL origin.'
        : target === 'ec2'
          ? 'EC2 hosts the HTTP(S) origin server.'
          : target === 's3'
            ? 'S3 bucket or website origin; request methods depend on cache behavior.'
            : 'API Gateway custom origin.',
      'origins',
    ),
  ),
  ...['cloudfront', 'apigateway', 'ec2', 's3'].map((target) =>
    entry(
      'route53',
      target,
      'routes to',
      'DNS routing',
      target === 's3'
        ? 'DNS record points to an S3 static website endpoint.'
        : 'DNS records direct clients to the configured service endpoint; Route 53 does not proxy application traffic.',
      'dns',
    ),
  ),
  entry(
    'eventbridge',
    'lambda',
    'invokes',
    'Asynchronous function target',
    'A matching event bus rule invokes the Lambda target.',
    'events',
  ),
  entry(
    'eventbridge',
    'sqs',
    'sends to',
    'SendMessage target',
    'A matching rule sends a message to the queue.',
    'events',
  ),
  entry(
    'eventbridge',
    'apigateway',
    'invokes',
    'API Gateway target',
    'A matching rule invokes the configured API endpoint.',
    'events',
  ),
  entry(
    's3',
    'lambda',
    'invokes',
    'Bucket event notification',
    'S3 directly invokes a function for configured bucket events.',
    's3Events',
  ),
  entry(
    's3',
    'sqs',
    'sends to',
    'Bucket event notification',
    'Direct notification to a standard queue in the bucket region; FIFO requires an intermediary.',
    's3Events',
  ),
  entry(
    's3',
    'eventbridge',
    'sends to',
    'Bucket event delivery',
    'EventBridge delivery is enabled on the bucket.',
    's3Events',
  ),
  entry(
    's3',
    sns,
    'publishes to',
    'Bucket event notification',
    'Notification to a standard SNS topic in the bucket region.',
    's3Events',
  ),
  ...[
    ['sqs', 'SQS queue', 'sqs', 'The queue policy must permit SNS message delivery.'],
    ['lambda', 'Lambda function', 'lambda', 'The function must permit invocation by SNS.'],
    [
      'amazon-data-firehose',
      'Firehose delivery stream',
      'firehose',
      'SubscriptionRoleArn must allow writing to the stream and trust SNS.',
    ],
  ].flatMap(([service, endpoint, protocol, permission]) => {
    const condition = `SNS Subscribe associates the ${endpoint} ARN with the topic using protocol=${protocol}. ${permission} This describes subscription configuration, not an API call initiated by the endpoint.`;
    return [
      {
        ...entry(sns, service, 'subscribed by', 'Subscribe', condition, 'snsSubscribe'),
        reviewed: '2026-09-21',
      },
      {
        ...entry(service, sns, 'subscribes to', 'Subscribe', condition, 'snsSubscribe'),
        reviewed: '2026-09-21',
      },
    ];
  }),
  entry(
    sns,
    'sqs',
    'sends to',
    'Subscribed queue delivery',
    'SNS delivers messages to its subscribed queue with SendMessage permission.',
    'snsQueue',
  ),
  entry(
    sns,
    'lambda',
    'invokes',
    'Topic notification',
    'SNS directly invokes a subscribed Lambda function.',
    'polling',
  ),
];

for (const row of [...serviceEventRelationships, ...additionalRelationships]) {
  const existing = documentedRelationships.find(
    (claim) =>
      claim.source === row.source && claim.target === row.target && claim.verb === row.verb,
  );
  if (existing) existing.references.push(...row.references);
  else documentedRelationships.push(row);
}

const excludedServices = new Map(serviceExclusions.map((entry) => [entry.id, entry]));
for (let index = documentedRelationships.length - 1; index >= 0; index--) {
  const row = documentedRelationships[index];
  if (excludedServices.has(row.source) || excludedServices.has(row.target))
    documentedRelationships.splice(index, 1);
}

// Combined access is available only when both directions of access have evidence for this same service pair.
for (const read of documentedRelationships.filter((row) => row.verb === 'reads from')) {
  const write = documentedRelationships.find(
    (row) => row.source === read.source && row.target === read.target && row.verb === 'writes to',
  );
  if (!write) continue;
  documentedRelationships.push({
    source: read.source,
    target: read.target,
    verb: 'reads / writes',
    operation: `${read.operation} + ${write.operation}`,
    condition: `Read: ${read.condition} Write: ${write.condition}`,
    references: [...new Set([...read.references, ...write.references])],
    apiReferences: [...new Set([...read.apiReferences, ...write.apiReferences])],
    reviewed: [read.reviewed, write.reviewed].sort()[0],
  });
}

// The global vocabulary and pair menus derive from the evidence, never independent allowlists.
export const verbs = [...new Set(documentedRelationships.map((row) => row.verb))];
export const relationshipRules = [
  ...new Set(documentedRelationships.map((row) => `${row.source}|${row.target}`)),
].map((key) => {
  const [source, target] = key.split('|'),
    evidence = documentedRelationships.filter(
      (row) => row.source === source && row.target === target,
    );
  return { source, target, allowed: [...new Set(evidence.map((row) => row.verb))], evidence };
});
// Retired labels remain readable in stored diagrams but cannot create or update an edge.
export const legacyVerbs = ['authenticates with'];
export function relationshipRule(source, target) {
  return relationshipRules.find((row) => row.source === source && row.target === target);
}
export function allowedRelationships(source, target) {
  return [...(relationshipRule(source, target)?.allowed ?? [])];
}
export function allowedNodeRelationships(source, target) {
  return allowedRelationships(source?.service, target?.service).filter((verb) =>
    resourceTypesAllow(source, verb, target),
  );
}
export function relationshipEvidence(source, verb, target) {
  return documentedRelationships.filter(
    (row) => row.source === source && row.target === target && row.verb === verb,
  );
}
export function relationshipIssue(source, verb, target) {
  // Flow arrows belong to flow charts: any edge touching a shape is a flow, and a flow needs a shape.
  if (source?.service === 'flowchart' || target?.service === 'flowchart') {
    if (verb !== 'flow')
      return `${source.name} → ${target.name}: connect flowchart shapes with the “flow” verb.`;
    // A flow links a step to another step or to the AWS resource that performs it, never to a group container.
    const group = [source, target].find((node) => node?.service === 'group');
    return group
      ? `${source.name} → ${target.name}: a “flow” arrow cannot connect to group “${group.name}”; link the shape to a resource inside it.`
      : null;
  }
  if (verb === 'flow')
    return `${source.name} → ${target.name}: a “flow” arrow must start or end at a flowchart shape (service "flowchart").`;
  if (verb === 'custom') return null;
  for (const node of [source, target]) {
    const exclusion = excludedServices.get(node.service);
    if (exclusion) return `${node.name}: ${exclusion.reason}`;
  }
  const allowed = allowedNodeRelationships(source, target);
  if (allowed.includes(verb)) return null;
  return `${source.name} → ${target.name}: “${verb}” is not documented in this catalog for ${source.service}${source.resourceType ? ' (selected resource type)' : ''} → ${target.service}${target.resourceType ? ' (selected resource type)' : ''}. ${allowed.length ? `Choose: ${allowed.join(', ')}.` : 'No documented relationship is available yet; this does not establish that AWS cannot support an integration.'}`;
}
export function graphRelationshipIssues(graph) {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  return graph.edges
    .map((edge) => relationshipIssue(nodes.get(edge.source), edge.verb, nodes.get(edge.target)))
    .filter(Boolean);
}
