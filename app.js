const { App, AwsLambdaReceiver } = require('@slack/bolt');
const { InvokeFlowCommand, BedrockAgentRuntimeClient } = require('@aws-sdk/client-bedrock-agent-runtime');


// Initialize your custom receiver
const awsLambdaReceiver = new AwsLambdaReceiver({
    signingSecret: process.env.SLACK_SIGNING_SECRET,
});

// Initializes your app with your bot token and the AWS Lambda ready receiver
const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    receiver: awsLambdaReceiver,

    // When using the AwsLambdaReceiver, processBeforeResponse can be omitted.
    // If you use other Receivers, such as ExpressReceiver for OAuth flow support
    // then processBeforeResponse: true is required. This option will defer sending back
    // the acknowledgement until after your handler has run to ensure your function
    // isn't terminated early by responding to the HTTP request that triggered it.

    // processBeforeResponse: true
});

/**
 * Invokes an alias of a flow to run the inputs that you specify and return
 * the output of each node as a stream.
 *
 * @param {{
 *  flowIdentifier: string,
 *  flowAliasIdentifier: string,
 *  prompt?: string,
 *  region?: string
 * }} options
 * @returns {Promise<import("@aws-sdk/client-bedrock-agent").FlowNodeOutput>} An object containing information about the output from flow invocation.
 */
const invokeBedrockFlow = async({
                                    flowIdentifier,
                                    flowAliasIdentifier,
                                    prompt = "Hi, how are you?",
                                    region = "eu-central-1",
                                }) => {
    const client = new BedrockAgentRuntimeClient({ region });

    const command = new InvokeFlowCommand({
        flowIdentifier,
        flowAliasIdentifier,
        inputs: [
            {
                content: {
                    document: prompt,
                },
                nodeName: "FlowInputNode",
                nodeOutputName: "document",
            },
        ],
    });

    let flowResponse = {};
    const response = await client.send(command);

    for await (const chunkEvent of response.responseStream) {
        const { flowOutputEvent, flowCompletionEvent } = chunkEvent;

        if (flowOutputEvent) {
            flowResponse = { ...flowResponse, ...flowOutputEvent };
            console.log("Flow output event:", flowOutputEvent);
        } else if (flowCompletionEvent) {
            flowResponse = { ...flowResponse, ...flowCompletionEvent };
            console.log("Flow completion event:", flowCompletionEvent);
        }
    }

    return flowResponse;
};

// The echo command simply echoes on command
app.command('/question', async ({ command, ack, respond }) => {
    // Acknowledge command request
    await ack();

    const result = await invokeBedrockFlow({flowIdentifier: process.env.FLOW_IDENTIFIER, flowAliasIdentifier: process.env.FLOW_ALIAS_IDENTIFIER, prompt: `${command.text}`});

    await respond(result.content.document);

});

// Handle the Lambda function event
module.exports.handler = async (event, context, callback) => {
    const handler = await awsLambdaReceiver.start();
    return handler(event, context, callback);
};