const Anthropic = require('@anthropic-ai/sdk')
const { betaZodOutputFormat } = require('@anthropic-ai/sdk/helpers/beta/zod')
const config = require('../config')

// Returns null on a refusal or a truncated reply.
async function prompt (system, content, schema) {
  const client = new Anthropic()
  const model = config.ANTHROPIC_MODEL
  const response = await client.beta.messages.parse({
    model,
    max_tokens: 16000,
    output_config: { effort: 'medium', format: betaZodOutputFormat(schema) },
    // On a safety decline, the API retries on a fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }]
  })

  const { input_tokens: input, cache_read_input_tokens: cached, output_tokens: output } = response.usage
  console.log({ anthropic: { model: response.model, input, cached, output } })

  if (response.stop_reason !== 'end_turn') {
    console.warn(`[anthropic] no answer: stop_reason ${response.stop_reason}`)
    return null
  }
  return response.parsed_output
}

module.exports = { prompt }
