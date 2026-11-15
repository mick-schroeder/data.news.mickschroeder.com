const { AnthropicBedrock } = require('@anthropic-ai/bedrock-sdk')
const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod')
const config = require('../config')

// Returns null on a refusal or a truncated reply.
async function prompt (system, content, schema) {
  const client = new AnthropicBedrock({ awsRegion: config.AWS_REGION })
  const model = `us.anthropic.${config.ANTHROPIC_MODEL}`
  const response = await client.messages.parse({
    model,
    max_tokens: 8000,
    output_config: { format: zodOutputFormat(schema) },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }]
  })

  const { input_tokens: input, cache_read_input_tokens: cached, output_tokens: output } = response.usage
  console.log({ anthropic: { model, input, cached, output } })

  if (response.stop_reason !== 'end_turn') {
    console.warn(`[anthropic] no answer: stop_reason ${response.stop_reason}`)
    return null
  }
  return response.parsed_output
}

module.exports = { prompt }
