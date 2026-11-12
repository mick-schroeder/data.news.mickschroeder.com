const Anthropic = require('@anthropic-ai/sdk')
const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod')
const config = require('../config')

const supportsFallbacks = model => !model.includes('haiku')

// Returns null on a refusal or a truncated reply.
async function prompt (system, content, schema) {
  const model = config.ANTHROPIC_MODEL
  const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY })
  const response = await client.beta.messages.parse({
    model,
    max_tokens: 16000,
    ...(supportsFallbacks(model) && {
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default'
    }),
    output_config: { effort: 'low', format: zodOutputFormat(schema) },
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
