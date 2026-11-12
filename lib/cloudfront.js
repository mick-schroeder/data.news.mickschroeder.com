const {
  CloudFrontClient,
  CreateInvalidationCommand,
  waitUntilInvalidationCompleted
} = require('@aws-sdk/client-cloudfront')
const config = require('../config')

const cloudfront = new CloudFrontClient({
  region: config.AWS_REGION,
  credentials: {
    accessKeyId: config.AWS_KEY,
    secretAccessKey: config.AWS_SECRET
  }
})

// Clears the edge cache for these keys and waits, so a build started next gets the new files.
module.exports.invalidate = async function (keys) {
  const DistributionId = config.CLOUDFRONT_DISTRIBUTION_ID
  const paths = ['/', ...keys.map(key => `/${key}`)]
  const { Invalidation } = await cloudfront.send(new CreateInvalidationCommand({
    DistributionId,
    InvalidationBatch: {
      CallerReference: `deploy-${Date.now()}`,
      Paths: { Quantity: paths.length, Items: paths }
    }
  }))
  await waitUntilInvalidationCompleted(
    { client: cloudfront, maxWaitTime: 600 },
    { DistributionId, Id: Invalidation.Id }
  )
  return paths
}
