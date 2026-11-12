const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const config = require('../config')

const s3 = new S3Client({
  region: config.AWS_REGION,
  credentials: {
    accessKeyId: config.AWS_KEY,
    secretAccessKey: config.AWS_SECRET
  }
})

// No ACL: access comes from the bucket policy. Stored uncompressed; CloudFront
// compresses for clients that ask. Cached a day; deploy invalidates CloudFront.
module.exports.upload = async function (key, data, contentType = 'application/json') {
  await s3.send(new PutObjectCommand({
    Bucket: config.AWS_BUCKET,
    Key: key,
    ContentType: contentType,
    Body: data,
    CacheControl: 'public, max-age=86400'
  }))
}
